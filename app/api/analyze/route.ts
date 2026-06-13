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
            "You are a skeptical product strategist. Analyze startup ideas with practical scrutiny, penalizing vague buyers, weak pain, unclear monetization, and over-complex MVPs. Prefer manual validation before building software. Use the founder profile when assessing founder fit. If the founder profile is missing or empty, state clearly that founder fit cannot be reliably assessed. Do not invent missing business context. If important context is missing, lower confidence and say what evidence is needed. Return only valid JSON. No markdown, no commentary outside the JSON.",
        },
        {
          role: "user",
          content: `Analyze the following business idea and return only valid JSON with exactly these fields: ideaSummary, oneSentenceVerdict, strongestVersion, smallestViableWedge, targetCustomer, corePainOrDesire, founderFitScore, founderFitReason, painOrDesireScore, painOrDesireReason, mvpTestabilityScore, mvpTestabilityReason, commercialPotentialScore, commercialPotentialReason, scoreCalibration, mostDangerousAssumption, whyThisMightFail, whatNotToBuildYet, manualValidationTest, questionsToAskUsers, evidenceNeededBeforeBuilding, recommendedNextAction, buildDecision. Use scores from 1 to 10. Prefer conservative scores. If evidence is missing, say so clearly. Do not invent missing business context. If important context is missing, lower confidence and say what evidence is needed. Focus on the smallest useful version of the idea and separate future vision from MVP reality. Identify what not to build yet. The manualValidationTest object is mandatory. steps must contain 3 to 7 concrete steps. successCriteria must contain 2 to 4 measurable criteria. failureCriteria must contain 2 to 4 measurable criteria. timeRequired and costEstimate must be realistic and specific. The test must be possible within 7 days using existing tools such as phone camera, Google Drive, WhatsApp, Google Forms, Notion, Stripe payment links, manual editing, spreadsheets, or direct outreach. Do not recommend building software as the first validation test unless there is evidence of demand. Return only valid JSON. No markdown, no commentary outside JSON.

Business idea:
${idea}

${founderProfileSection}`,
        },
      ],
      800
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
