import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { INTAKE_FIELDS, isIntakeFieldKey, type ClarificationResponse } from "@/lib/analysis-types";
import { isOllamaModel, OLLAMA_MODELS } from "@/lib/ollama-models";

const OLLAMA_URL = "http://localhost:11434/api/chat";

async function readFounderProfile() {
  const filePath = path.join(process.cwd(), "founder-profile.md");
  try {
    const content = await fs.readFile(filePath, "utf8");
    return content.trim();
  } catch {
    return "";
  }
}

function extractJson(raw: string) {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");

  if (first === -1 || last === -1) {
    throw new Error("AI response did not contain valid JSON.");
  }

  const text = raw.slice(first, last + 1);
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed)) {
    throw new Error("AI response JSON was not an object.");
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function contentItemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (!isRecord(item)) return "";
  return typeof item.text === "string" ? item.text : "";
}

function normalizeAssistantContent(choice: unknown): string {
  if (!choice) return "";
  if (typeof choice === "string") return choice;
  if (!isRecord(choice)) return "";
  if (typeof choice.content === "string") return choice.content;
  if (typeof choice.output === "string") return choice.output;
  if (Array.isArray(choice.content)) {
    return choice.content.map(contentItemText).join("");
  }
  if (Array.isArray(choice.output)) {
    return choice.output.map(contentItemText).join("");
  }
  if (choice.message) return normalizeAssistantContent(choice.message);
  return "";
}

function normalizeArrayField(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isClearlyVaguePhrase(idea: string) {
  const words = idea.split(/\s+/).filter(Boolean);
  const hasSentenceDetail = /[.!?;:]|\b(for|who|that|which|because|using|helps?|allows?|so that|by)\b/i.test(idea);
  return words.length <= 8 && !hasSentenceDetail;
}

async function callOllama(model: string, messages: { role: string; content: string }[], maxTokens: number) {
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      temperature: 0.2,
      max_tokens: maxTokens,
      messages,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const isModelUnavailable =
      response.status === 404 ||
      /model.*(?:not found|does not exist|unavailable)|(?:not found|pull).*model/i.test(errorText);

    throw new Error(
      isModelUnavailable
        ? "Ollama could not run this model. Check that it is installed and that Ollama is running."
        : errorText || `Ollama returned an unexpected status: ${response.status}`
    );
  }

  const rawResponse: unknown = await response.json();
  if (typeof rawResponse === "string") return rawResponse;
  if (isRecord(rawResponse)) {
    const firstChoice = Array.isArray(rawResponse.choices) ? rawResponse.choices[0] : rawResponse;
    const assistantText =
      normalizeAssistantContent(firstChoice) || normalizeAssistantContent(rawResponse);
    if (assistantText) return assistantText;
  }

  throw new Error("Ollama returned an empty assistant response.");
}

function normalizeClarification(
  parsed: Record<string, unknown>,
  idea: string,
  isExtremelyVague: boolean
): ClarificationResponse {
  const missingFieldSet = new Set(
    normalizeArrayField(parsed.missingFields).filter(isIntakeFieldKey)
  );
  const missingFields = INTAKE_FIELDS
    .map((field) => field.key)
    .filter((field) => missingFieldSet.has(field))
    .slice(0, 5);
  const clarifyingQuestions = normalizeArrayField(parsed.clarifyingQuestions).slice(0, 6);
  const possibleDirections = normalizeArrayField(parsed.possibleDirections).slice(0, 4);

  return {
    status: "needs_clarification",
    reason:
      String(parsed.reason ?? "").trim() ||
      "This idea is too vague to analyze without inventing important business assumptions.",
    missingFields:
      isExtremelyVague
        ? ["targetCustomer", "problemOrDesire", "proposedSolution", "valueOutcome", "payer"]
        : missingFields.length > 0
        ? missingFields
        : ["targetCustomer", "problemOrDesire", "proposedSolution", "valueOutcome", "payer"],
    clarifyingQuestions:
      clarifyingQuestions.length > 0
        ? clarifyingQuestions
        : [
            "Who specifically experiences this problem or desire?",
            `What would "${idea}" help them do or improve?`,
            "What rough solution are you imagining?",
            "What is the smallest manual test you could run first?",
          ],
    possibleDirections:
      possibleDirections.length > 0
        ? possibleDirections
        : [
            `A consumer-facing version of ${idea}`,
            `A service-based version of ${idea}`,
            `A business or organization-focused version of ${idea}`,
          ],
  };
}

function scoreLabel(score: number) {
  if (score <= 2) return "Very weak";
  if (score <= 4) return "Weak";
  if (score <= 6) return "Plausible but unproven";
  if (score <= 8) return "Strong";
  return "Exceptional";
}

function normalizeScore(
  value: unknown,
  legacyScore: unknown,
  legacyReason: unknown
) {
  const assessment = isRecord(value) ? value : {};
  const rawScore = Number(assessment.score ?? legacyScore);
  const score = Number.isFinite(rawScore)
    ? Math.min(10, Math.max(1, Math.round(rawScore)))
    : 1;

  return {
    score,
    label: scoreLabel(score),
    reason:
      String(assessment.reason ?? legacyReason ?? "").trim() ||
      "There is not enough evidence to support a stronger score.",
    evidence: normalizeArrayField(assessment.evidence).slice(0, 5),
    uncertainty:
      String(assessment.uncertainty ?? "").trim() ||
      "Important assumptions remain unverified.",
  };
}

export async function POST(req: NextRequest) {
  let body: { idea?: unknown; model?: unknown } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";

  if (!idea) {
    return NextResponse.json({ error: "Business idea is required." }, { status: 400 });
  }

  if (!isOllamaModel(body.model)) {
    return NextResponse.json(
      { error: `Invalid model. Choose one of: ${OLLAMA_MODELS.join(", ")}.` },
      { status: 400 }
    );
  }

  const model = body.model;
  const founderProfile = await readFounderProfile();
  const founderProfileSection = founderProfile
    ? `Founder profile:\n${founderProfile}`
    : "Founder profile is not available. Founder fit cannot be reliably assessed from the idea alone.";

  try {
    const intakeText = await callOllama(
      model,
      [
        {
          role: "system",
          content:
            "You are an idea intake interviewer. Decide conservatively whether a business idea has enough user-provided context for a useful analysis without inventing assumptions. Never choose a direction for the user. Possible directions are examples only. Return only valid JSON.",
        },
        {
          role: "user",
          content: `Check whether this idea is specific enough to analyze.

Minimum useful context includes enough of: targetCustomer, problemOrDesire, proposedSolution, valueOutcome, payer, currentAlternative, and mvpAngle. Not every field must be perfect, but the idea must clearly state who it is for and what it roughly does. A phrase, title, category, or vague concept needs clarification.

Return JSON with exactly these fields:
status: "ready" or "needs_clarification"
reason: short string
missingFields: array using only these exact values: targetCustomer, problemOrDesire, proposedSolution, valueOutcome, payer, currentAlternative, mvpAngle. Never return partial, misspelled, or invented keys. Return at most the 5 most important missing fields, prioritized in the order listed.
clarifyingQuestions: 3 to 6 practical, targeted questions when clarification is needed, otherwise []
possibleDirections: 2 to 4 short example interpretations when clarification is needed, otherwise []

Do not invent missing context. Do not treat possible directions as assumptions.

Idea:
${idea}`,
        },
      ],
      450
    );

    const intake = extractJson(intakeText);
    const isExtremelyVague = isClearlyVaguePhrase(idea);
    const needsClarification = isExtremelyVague || intake.status !== "ready";

    if (needsClarification) {
      return NextResponse.json(normalizeClarification(intake, idea, isExtremelyVague));
    }

    const assistantText = await callOllama(
      model,
      [
        {
          role: "system",
          content:
            "You are a skeptical product strategist. Analyze startup ideas with practical scrutiny. Scores estimate current evidence strength, not excitement. Missing evidence lowers scores. Scores above 8 are rare and require exceptional proof. Separate what is known, assumed, and uncertain. Never invent evidence or missing business context. Prefer manual validation before building software. Use the founder profile when assessing founder fit. If the founder profile is missing or empty, founder fit must remain low or uncertain. Return only valid JSON. No markdown, no commentary outside the JSON.",
        },
        {
          role: "user",
          content: `Analyze the following business idea and return only valid JSON with exactly these fields: ideaSummary, oneSentenceVerdict, strongestVersion, smallestViableWedge, targetCustomer, corePainOrDesire, founderFit, painOrDesire, mvpTestability, commercialPotential, scoreSummary, confidenceLevel, mostDangerousAssumption, whyThisMightFail, whatNotToBuildYet, manualValidationTest, questionsToAskUsers, evidenceNeededBeforeBuilding, recommendedNextAction, buildDecision.

Each of founderFit, painOrDesire, mvpTestability, and commercialPotential must be an object with exactly:
score: integer from 1 to 10
label: string
reason: concise explanation of why the current evidence supports this score
evidence: array of concrete evidence explicitly present in the idea or founder profile
uncertainty: the most important unknown or assumption affecting the score

Use this universal scale:
1-2 = Very weak
3-4 = Weak
5-6 = Plausible but unproven
7-8 = Strong
9-10 = Exceptional

Scoring rules:
- Scores estimate current evidence strength, not excitement.
- Missing evidence lowers the score. Do not invent evidence.
- Scores above 8 are rare and require strong real-world proof.
- Separate what is known, assumed, and uncertain.
- founderFit: lived experience, domain knowledge, access to users, technical ability, motivation, and ability to test manually. Interest alone is not evidence.
- painOrDesire: urgency, frequency, cost, emotional or status motivation, existing workaround behavior, and existing time or money spent.
- mvpTestability: whether the riskiest assumption can be tested within 7 days, manually, cheaply, and without software. Complex technology, hardware, regulation, or network effects lower the score.
- commercialPotential: clear buyer, budget, willingness to pay, recurring use, pricing model, and value exchange. Users liking something is not payment evidence.

confidenceLevel must be "low", "medium", or "high":
- low: many assumptions or important missing context
- medium: enough detail to analyze but little real-world proof
- high: strong evidence such as customer data, payment signals, or direct user access

Prefer conservative scores. If evidence is missing, say so clearly. Focus on the smallest useful version and separate future vision from MVP reality. Identify what not to build yet. The manualValidationTest object is mandatory. steps must contain 3 to 7 concrete steps. successCriteria and failureCriteria must each contain 2 to 4 measurable criteria. timeRequired and costEstimate must be realistic and specific. The test must be possible within 7 days using existing tools such as phone camera, Google Drive, WhatsApp, Google Forms, payment links, manual editing, spreadsheets, or direct outreach. Do not recommend building software as the first validation test unless there is evidence of demand. Return only valid JSON. No markdown or commentary outside JSON.

Business idea:
${idea}

${founderProfileSection}`,
        },
      ],
      1400
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(assistantText);
    } catch (parseError) {
      throw new Error(
        `Unable to parse JSON from Ollama response: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response: ${assistantText.slice(0, 300)}`
      );
    }

    const normalizeManualTest = (value: unknown) => {
      if (typeof value !== "object" || value === null) {
        return {
          goal: "",
          steps: [],
          successCriteria: [],
          failureCriteria: [],
          timeRequired: "",
          costEstimate: "",
        };
      }

      const test = value as Record<string, unknown>;
      return {
        goal: String(test.goal ?? ""),
        steps: normalizeArrayField(test.steps),
        successCriteria: normalizeArrayField(test.successCriteria),
        failureCriteria: normalizeArrayField(test.failureCriteria),
        timeRequired: String(test.timeRequired ?? ""),
        costEstimate: String(test.costEstimate ?? ""),
      };
    };

    parsed.whyThisMightFail = normalizeArrayField(parsed.whyThisMightFail);
    parsed.whatNotToBuildYet = normalizeArrayField(parsed.whatNotToBuildYet);
    parsed.questionsToAskUsers = normalizeArrayField(parsed.questionsToAskUsers);
    parsed.evidenceNeededBeforeBuilding = normalizeArrayField(parsed.evidenceNeededBeforeBuilding);
    parsed.manualValidationTest = normalizeManualTest(parsed.manualValidationTest);
    parsed.founderFit = normalizeScore(parsed.founderFit, parsed.founderFitScore, parsed.founderFitReason);
    parsed.painOrDesire = normalizeScore(parsed.painOrDesire, parsed.painOrDesireScore, parsed.painOrDesireReason);
    parsed.mvpTestability = normalizeScore(parsed.mvpTestability, parsed.mvpTestabilityScore, parsed.mvpTestabilityReason);
    parsed.commercialPotential = normalizeScore(
      parsed.commercialPotential,
      parsed.commercialPotentialScore,
      parsed.commercialPotentialReason
    );
    parsed.scoreSummary =
      String(parsed.scoreSummary ?? "").trim() ||
      "The scores reflect the strength of currently provided evidence and should improve only when assumptions are validated.";
    parsed.confidenceLevel = ["low", "medium", "high"].includes(String(parsed.confidenceLevel))
      ? String(parsed.confidenceLevel)
      : "low";
    delete parsed.founderFitScore;
    delete parsed.founderFitReason;
    delete parsed.painOrDesireScore;
    delete parsed.painOrDesireReason;
    delete parsed.mvpTestabilityScore;
    delete parsed.mvpTestabilityReason;
    delete parsed.commercialPotentialScore;
    delete parsed.commercialPotentialReason;
    delete parsed.scoreCalibration;
    parsed.status = "analysis";

    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    const isConnectionError = /Failed to fetch|ECONNREFUSED|connect/i.test(message);

    return NextResponse.json(
      {
        error: isConnectionError
          ? "Unable to connect to local Ollama at http://localhost:11434. Please make sure Ollama is running."
          : `Analysis failed: ${message}`,
      },
      { status: isConnectionError ? 502 : 500 }
    );
  }
}
