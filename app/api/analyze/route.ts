import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  INTAKE_FIELDS,
  SCORE_AREAS,
  isIntakeFieldKey,
  type ClarificationResponse,
  type PerformanceMetrics,
  type RecommendedStrategy,
  type ScoreArea,
} from "@/lib/analysis-types";
import { isOllamaModel, OLLAMA_MODELS } from "@/lib/ollama-models";

const OLLAMA_URL = "http://localhost:11434/api/chat";

type OllamaCallMetrics = {
  requestMs: number;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalCount: number | null;
  promptEvalDurationNs: number | null;
  evalCount: number | null;
  evalDurationNs: number | null;
};

type PerformanceAccumulator = {
  requestStartedAt: number;
  ollamaRequestMs: number;
  jsonParseMs: number;
  calls: OllamaCallMetrics[];
};

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

function optionalNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  const requestStartedAt = performance.now();
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
  const requestMs = performance.now() - requestStartedAt;
  const metricsSource = isRecord(rawResponse) ? rawResponse : {};
  const metrics: OllamaCallMetrics = {
    requestMs,
    totalDurationNs: optionalNumber(metricsSource.total_duration),
    loadDurationNs: optionalNumber(metricsSource.load_duration),
    promptEvalCount: optionalNumber(metricsSource.prompt_eval_count),
    promptEvalDurationNs: optionalNumber(metricsSource.prompt_eval_duration),
    evalCount: optionalNumber(metricsSource.eval_count),
    evalDurationNs: optionalNumber(metricsSource.eval_duration),
  };

  if (typeof rawResponse === "string") return { assistantText: rawResponse, metrics };
  if (isRecord(rawResponse)) {
    const firstChoice = Array.isArray(rawResponse.choices) ? rawResponse.choices[0] : rawResponse;
    const assistantText =
      normalizeAssistantContent(firstChoice) || normalizeAssistantContent(rawResponse);
    if (assistantText) return { assistantText, metrics };
  }

  throw new Error("Ollama returned an empty assistant response.");
}

function timedExtractJson(raw: string, accumulator: PerformanceAccumulator) {
  const startedAt = performance.now();
  try {
    return extractJson(raw);
  } finally {
    accumulator.jsonParseMs += performance.now() - startedAt;
  }
}

function sumAvailable(calls: OllamaCallMetrics[], field: keyof OllamaCallMetrics) {
  const values = calls
    .map((call) => call[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length > 0 ? values.reduce((total, value) => total + value, 0) : null;
}

function roundMetric(value: number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function buildPerformance(model: string, accumulator: PerformanceAccumulator): PerformanceMetrics {
  const requestFinishedAt = Date.now();
  const totalDurationNs = sumAvailable(accumulator.calls, "totalDurationNs");
  const loadDurationNs = sumAvailable(accumulator.calls, "loadDurationNs");
  const promptTokens = sumAvailable(accumulator.calls, "promptEvalCount");
  const outputTokens = sumAvailable(accumulator.calls, "evalCount");
  const promptDurationNs = sumAvailable(accumulator.calls, "promptEvalDurationNs");
  const outputDurationNs = sumAvailable(accumulator.calls, "evalDurationNs");
  const tokensPerSecond = (tokens: number | null, durationNs: number | null) =>
    tokens !== null && durationNs !== null && durationNs > 0
      ? roundMetric(tokens / (durationNs / 1_000_000_000), 2)
      : null;

  return {
    model,
    requestStartedAt: new Date(accumulator.requestStartedAt).toISOString(),
    requestFinishedAt: new Date(requestFinishedAt).toISOString(),
    totalRequestMs: roundMetric(requestFinishedAt - accumulator.requestStartedAt),
    ollamaRequestMs: roundMetric(accumulator.ollamaRequestMs),
    ollamaTotalMs: totalDurationNs === null ? null : roundMetric(totalDurationNs / 1_000_000),
    ollamaGenerationMs: outputDurationNs === null ? null : roundMetric(outputDurationNs / 1_000_000),
    modelLoadMs: loadDurationNs === null ? null : roundMetric(loadDurationNs / 1_000_000),
    promptTokens,
    outputTokens,
    promptTokensPerSecond: tokensPerSecond(promptTokens, promptDurationNs),
    outputTokensPerSecond: tokensPerSecond(outputTokens, outputDurationNs),
    jsonParseMs: roundMetric(accumulator.jsonParseMs, 2),
  };
}

function recordOllamaMetrics(accumulator: PerformanceAccumulator, metrics: OllamaCallMetrics) {
  accumulator.calls.push(metrics);
  accumulator.ollamaRequestMs += metrics.requestMs;
}

function logPerformance(metrics: PerformanceMetrics) {
  console.info(
    [
      "[Analyzer performance]",
      `model=${metrics.model}`,
      `totalRequestMs=${metrics.totalRequestMs}`,
      `ollamaRequestMs=${metrics.ollamaRequestMs}`,
      `promptTokens=${metrics.promptTokens ?? "unavailable"}`,
      `outputTokens=${metrics.outputTokens ?? "unavailable"}`,
      `outputTokensPerSecond=${metrics.outputTokensPerSecond ?? "unavailable"}`,
    ].join("\n")
  );
}

function normalizeClarification(
  parsed: Record<string, unknown>,
  idea: string,
  isExtremelyVague: boolean
): Omit<ClarificationResponse, "performance"> {
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

const STRATEGY_LABELS: Record<RecommendedStrategy, string> = {
  clarify_more: "Clarify more",
  research_first: "Research first",
  test_manually_first: "Test manually first",
  build_tiny_prototype: "Build a tiny prototype",
  build_software_mvp: "Build a software MVP",
  pause: "Pause",
  kill: "Kill",
};

function isRecommendedStrategy(value: unknown): value is RecommendedStrategy {
  return typeof value === "string" && value in STRATEGY_LABELS;
}

function legacyStrategy(value: unknown): RecommendedStrategy {
  switch (value) {
    case "test_manually_first":
      return "test_manually_first";
    case "build_later":
      return "research_first";
    case "pause":
      return "pause";
    case "kill":
      return "kill";
    default:
      return "research_first";
  }
}

function isScoreArea(value: unknown): value is ScoreArea {
  return typeof value === "string" && SCORE_AREAS.some((area) => area === value);
}

function normalizeScoreImprovementRecommendations(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .filter((item) => isScoreArea(item.scoreArea))
    .map((item) => ({
      scoreArea: item.scoreArea,
      currentIssue: String(item.currentIssue ?? "").trim(),
      recommendation: String(item.recommendation ?? "").trim(),
      whyItCouldImproveTheScore: String(item.whyItCouldImproveTheScore ?? "").trim(),
      evidenceToCollect: String(item.evidenceToCollect ?? "").trim(),
    }))
    .filter((item) => item.recommendation && item.evidenceToCollect)
    .slice(0, 4);
}

const SCORE_RECOMMENDATION_FALLBACKS: Record<
  ScoreArea,
  { recommendation: string; whyItCouldImproveTheScore: string; evidenceToCollect: string }
> = {
  "Founder Fit": {
    recommendation: "Narrow the first test to a customer group you can reach directly and serve manually.",
    whyItCouldImproveTheScore:
      "Direct access and hands-on testing could demonstrate stronger founder-market fit.",
    evidenceToCollect: "Documented access to target users and completed manual tests with them.",
  },
  "Pain / Desire": {
    recommendation: "Interview target users about the last time they experienced the problem and what they did next.",
    whyItCouldImproveTheScore:
      "Observed urgency, frequency, and workaround behavior could support a stronger pain score.",
    evidenceToCollect: "Repeated examples of recent pain, existing workarounds, and time or money already spent.",
  },
  "MVP Testability": {
    recommendation: "Reduce the first test to one core assumption that can be tested within seven days.",
    whyItCouldImproveTheScore:
      "A cheaper and faster test could make the riskiest assumption easier to validate.",
    evidenceToCollect: "A completed manual or tiny-prototype test with measurable success and failure criteria.",
  },
  "Commercial Potential": {
    recommendation: "Test payment intent with a specific buyer, price, and concrete offer.",
    whyItCouldImproveTheScore:
      "Real payment behavior could demonstrate budget and willingness to pay.",
    evidenceToCollect: "Paid pilots, deposits, pre-orders, or explicit buyer commitments at a stated price.",
  },
};

function fallbackScoreImprovementRecommendation(parsed: Record<string, unknown>) {
  const assessments: { scoreArea: ScoreArea; assessment: Record<string, unknown> }[] = [
    { scoreArea: "Founder Fit", assessment: isRecord(parsed.founderFit) ? parsed.founderFit : {} },
    { scoreArea: "Pain / Desire", assessment: isRecord(parsed.painOrDesire) ? parsed.painOrDesire : {} },
    { scoreArea: "MVP Testability", assessment: isRecord(parsed.mvpTestability) ? parsed.mvpTestability : {} },
    {
      scoreArea: "Commercial Potential",
      assessment: isRecord(parsed.commercialPotential) ? parsed.commercialPotential : {},
    },
  ];
  const weakest = assessments.sort(
    (a, b) => Number(a.assessment.score ?? 1) - Number(b.assessment.score ?? 1)
  )[0];
  const fallback = SCORE_RECOMMENDATION_FALLBACKS[weakest.scoreArea];

  return {
    scoreArea: weakest.scoreArea,
    currentIssue: String(weakest.assessment.uncertainty ?? "The strongest evidence is still missing."),
    ...fallback,
  };
}

export async function POST(req: NextRequest) {
  const performanceAccumulator: PerformanceAccumulator = {
    requestStartedAt: Date.now(),
    ollamaRequestMs: 0,
    jsonParseMs: 0,
    calls: [],
  };
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
    const intakeResult = await callOllama(
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
    recordOllamaMetrics(performanceAccumulator, intakeResult.metrics);

    const intake = timedExtractJson(intakeResult.assistantText, performanceAccumulator);
    const isExtremelyVague = isClearlyVaguePhrase(idea);
    const needsClarification = isExtremelyVague || intake.status !== "ready";

    if (needsClarification) {
      const performance = buildPerformance(model, performanceAccumulator);
      logPerformance(performance);
      return NextResponse.json({
        ...normalizeClarification(intake, idea, isExtremelyVague),
        performance,
      });
    }

    const analysisResult = await callOllama(
      model,
      [
        {
          role: "system",
          content:
            "You are a skeptical product strategist. Analyze startup ideas with practical scrutiny. Scores estimate current evidence strength, not excitement. Missing evidence lowers scores. Scores above 8 are rare and require exceptional proof. Separate what is known, assumed, and uncertain. Never invent evidence or missing business context. Prefer manual validation before building software. Use the founder profile when assessing founder fit. If the founder profile is missing or empty, founder fit must remain low or uncertain. Return only valid JSON. No markdown, no commentary outside the JSON.",
        },
        {
          role: "user",
          content: `Analyze the following business idea and return only valid JSON with exactly these fields: ideaSummary, oneSentenceVerdict, strongestVersion, smallestViableWedge, firstTestableVersion, targetCustomer, corePainOrDesire, founderFit, painOrDesire, mvpTestability, commercialPotential, scoreSummary, confidenceLevel, scoreImprovementRecommendations, mostDangerousAssumption, whyThisMightFail, whatNotToBuildYet, manualValidationTest, questionsToAskUsers, evidenceNeededBeforeBuilding, recommendedNextAction, recommendedStrategy, recommendedStrategyLabel, strategyReason.

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

scoreImprovementRecommendations must contain 1 to 4 practical recommendations focused on the weakest or most uncertain scores. Each item must contain exactly:
scoreArea: exactly one of "Founder Fit", "Pain / Desire", "MVP Testability", "Commercial Potential"
currentIssue: the specific weakness or uncertainty
recommendation: a practical refinement, exploration, or validation action
whyItCouldImproveTheScore: explain why the action could justify a higher score without promising it will
evidenceToCollect: the concrete signal that would justify reassessment

firstTestableVersion means the simplest version that can be put in front of real users to test the core assumption. Keep smallestViableWedge for backward compatibility, but make firstTestableVersion more concrete.

recommendedStrategy must be exactly one of:
- clarify_more: the idea is still underspecified
- research_first: market or user context is too unknown
- test_manually_first: demand or willingness to pay is unproven and a manual test is possible
- build_tiny_prototype: a very small prototype is the best way to test behavior, but a full product is premature
- build_software_mvp: the idea is specific and testable, has some evidence, and software is genuinely needed
- pause: interesting but not currently high priority
- kill: weak pain, fit, and commercial potential make further testing unattractive

Do not default every idea to test_manually_first. Recommend build_tiny_prototype when software is the smallest useful behavioral test. Recommend research_first when customer understanding is the main gap. Recommend build_software_mvp only when evidence and necessity justify it. recommendedStrategyLabel is a readable label. strategyReason must explain why this strategy is the right next level of commitment.

Prefer conservative scores. If evidence is missing, say so clearly. Focus on the smallest useful version and separate future vision from MVP reality. Identify what not to build yet. The manualValidationTest object is mandatory. steps must contain 3 to 7 concrete steps. successCriteria and failureCriteria must each contain 2 to 4 measurable criteria. timeRequired and costEstimate must be realistic and specific. The test must be possible within 7 days using existing tools such as phone camera, Google Drive, WhatsApp, Google Forms, payment links, manual editing, spreadsheets, or direct outreach. Do not recommend building software as the first validation test unless there is evidence of demand. Return only valid JSON. No markdown or commentary outside JSON.

Business idea:
${idea}

${founderProfileSection}`,
        },
      ],
      1900
    );
    recordOllamaMetrics(performanceAccumulator, analysisResult.metrics);

    let parsed: Record<string, unknown>;
    try {
      parsed = timedExtractJson(analysisResult.assistantText, performanceAccumulator);
    } catch (parseError) {
      throw new Error(
        `Unable to parse JSON from Ollama response: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response: ${analysisResult.assistantText.slice(0, 300)}`
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
    parsed.firstTestableVersion =
      String(parsed.firstTestableVersion ?? parsed.smallestViableWedge ?? "").trim();
    parsed.smallestViableWedge =
      String(parsed.smallestViableWedge ?? parsed.firstTestableVersion ?? "").trim();
    const scoreImprovementRecommendations = normalizeScoreImprovementRecommendations(
      parsed.scoreImprovementRecommendations
    );
    parsed.scoreImprovementRecommendations =
      scoreImprovementRecommendations.length > 0
        ? scoreImprovementRecommendations
        : [fallbackScoreImprovementRecommendation(parsed)];
    const recommendedStrategy = isRecommendedStrategy(parsed.recommendedStrategy)
      ? parsed.recommendedStrategy
      : legacyStrategy(parsed.buildDecision);
    parsed.recommendedStrategy = recommendedStrategy;
    parsed.recommendedStrategyLabel = STRATEGY_LABELS[recommendedStrategy];
    parsed.strategyReason =
      String(parsed.strategyReason ?? parsed.recommendedNextAction ?? "").trim() ||
      "This strategy matches the current evidence and uncertainty level.";
    delete parsed.founderFitScore;
    delete parsed.founderFitReason;
    delete parsed.painOrDesireScore;
    delete parsed.painOrDesireReason;
    delete parsed.mvpTestabilityScore;
    delete parsed.mvpTestabilityReason;
    delete parsed.commercialPotentialScore;
    delete parsed.commercialPotentialReason;
    delete parsed.scoreCalibration;
    delete parsed.buildDecision;
    parsed.status = "analysis";
    parsed.performance = buildPerformance(model, performanceAccumulator);
    logPerformance(parsed.performance as PerformanceMetrics);

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
