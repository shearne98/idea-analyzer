import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { execFileSync } from "child_process";
import {
  INTAKE_FIELDS,
  SCORE_AREAS,
  isIntakeFieldKey,
  type ClarificationResponse,
  type PerformanceMetrics,
  type RecommendedStrategy,
  type ScoreArea,
} from "@/lib/analysis-types";
import type { AnalysisResponse, AnalyzeResponse } from "@/lib/analysis-types";
import { buildIntakeClarification } from "@/lib/idea-intake";
import type { OllamaModel } from "@/lib/ollama-models";

const OLLAMA_URL = "http://localhost:11434/api/chat";
const ANALYSIS_VERSION = "idea-analysis-v4-payment-first";
const OLLAMA_TEMPERATURE = 0;
const OLLAMA_SEED = 42;
let cachedCodeVersion: string | null = null;

function getCodeVersion() {
  if (cachedCodeVersion) return cachedCodeVersion;
  try {
    const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
    const workingChanges = execFileSync("git", ["diff", "--no-ext-diff", "HEAD", "--", "app", "components", "lib"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    const changeHash = workingChanges
      ? `-${createHash("sha256").update(workingChanges).digest("hex").slice(0, 8)}`
      : "";
    cachedCodeVersion = `${revision}${changeHash}`;
  } catch {
    cachedCodeVersion = ANALYSIS_VERSION;
  }
  return cachedCodeVersion;
}

async function buildRunMetadata(model: OllamaModel, deepThinking: boolean) {
  return {
    analysisVersion: ANALYSIS_VERSION,
    codeVersion: getCodeVersion(),
    model,
    deepThinking,
    temperature: OLLAMA_TEMPERATURE,
    seed: OLLAMA_SEED,
  };
}

export class IdeaAnalysisRunError extends Error {
  constructor(
    message: string,
    readonly kind: "ollama_unavailable" | "analysis_failed"
  ) {
    super(message);
    this.name = "IdeaAnalysisRunError";
  }
}

export type ModelCallMetrics = {
  requestMs: number;
  totalDurationNs: number | null;
  loadDurationNs: number | null;
  promptEvalCount: number | null;
  promptEvalDurationNs: number | null;
  evalCount: number | null;
  evalDurationNs: number | null;
};

export type ModelCallResult = {
  assistantText: string;
  metrics: Partial<ModelCallMetrics>;
};

export type IdeaAnalysisRunnerDependencies = {
  readFounderProfile: () => Promise<string>;
  callModel: (
    model: string,
    messages: { role: string; content: string }[],
    maxTokens: number,
    think?: boolean
  ) => Promise<ModelCallResult>;
};

type PerformanceAccumulator = {
  requestStartedAt: number;
  ollamaRequestMs: number;
  jsonParseMs: number;
  calls: ModelCallMetrics[];
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

function redactSensitiveText(value: unknown, sensitiveText: string): unknown {
  if (!sensitiveText) return value;
  if (typeof value === "string") {
    return value.split(sensitiveText).join("[Founder profile detail redacted]");
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveText(item, sensitiveText));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redactSensitiveText(item, sensitiveText)])
    );
  }
  return value;
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
  const hasSentenceDetail = /[.!?;:]|\b(who|that|which|because|using|helps?|allows?|so that|by)\b/i.test(idea);
  return words.length <= 8 && !hasSentenceDetail;
}

function intakeNeedsClarification(intake: Record<string, unknown>, idea: string) {
  if (isClearlyVaguePhrase(idea)) return true;
  if (intake.status === "ready") return false;

  const missingFields = normalizeArrayField(intake.missingFields).filter(isIntakeFieldKey);
  if (missingFields.length === 0) return true;

  return missingFields.some((field) =>
    ["targetCustomer", "problemOrDesire", "proposedSolution"].includes(field)
  );
}

async function callOllama(
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number,
  think = false
) {
  const requestStartedAt = performance.now();
  const response = await fetch(OLLAMA_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      stream: false,
      think,
      format: "json",
      options: {
        temperature: OLLAMA_TEMPERATURE,
        seed: OLLAMA_SEED,
        num_predict: maxTokens,
      },
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
  const metrics: ModelCallMetrics = {
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

function sumAvailable(calls: ModelCallMetrics[], field: keyof ModelCallMetrics) {
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

function recordOllamaMetrics(accumulator: PerformanceAccumulator, metrics: Partial<ModelCallMetrics>) {
  const normalizedMetrics: ModelCallMetrics = {
    requestMs: metrics.requestMs ?? 0,
    totalDurationNs: metrics.totalDurationNs ?? null,
    loadDurationNs: metrics.loadDurationNs ?? null,
    promptEvalCount: metrics.promptEvalCount ?? null,
    promptEvalDurationNs: metrics.promptEvalDurationNs ?? null,
    evalCount: metrics.evalCount ?? null,
    evalDurationNs: metrics.evalDurationNs ?? null,
  };
  accumulator.calls.push(normalizedMetrics);
  accumulator.ollamaRequestMs += normalizedMetrics.requestMs;
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
): Omit<ClarificationResponse, "performance" | "runMetadata"> {
  const missingFieldSet = new Set(
    normalizeArrayField(parsed.missingFields).filter(isIntakeFieldKey)
  );
  const missingFields = INTAKE_FIELDS
    .map((field) => field.key)
    .filter((field) => missingFieldSet.has(field))
    .slice(0, 5);
  const clarifyingQuestions = normalizeArrayField(parsed.clarifyingQuestions).slice(0, 6);
  const possibleDirections = normalizeArrayField(parsed.possibleDirections).slice(0, 4);
  const sharedClarification = buildIntakeClarification({
    idea,
    reason: String(parsed.reason ?? "").trim(),
    missingFields:
      isExtremelyVague
        ? ["targetCustomer", "problemOrDesire", "proposedSolution", "valueOutcome", "payer"]
        : missingFields.length > 0
        ? missingFields
        : ["targetCustomer", "problemOrDesire", "proposedSolution", "valueOutcome", "payer"],
    modelQuestions: clarifyingQuestions,
    possibleDirections,
  });

  return {
    status: "needs_clarification",
    ...sharedClarification,
  };
}

function scoreLabel(score: number) {
  if (score <= 2) return "Very weak";
  if (score <= 4) return "Weak";
  if (score <= 6) return "Plausible but unproven";
  if (score <= 8) return "Strong";
  return "Exceptional";
}

const OBSERVED_EVIDENCE_CLAIM =
  /\b(?:paid|payment|revenue|sales?|deposit|pre-?order|purchase order|signed pilot|existing customers?|customer data|interviewed|observed|tested|test result|measured|tracked|repeat(?:ed)? (?:use|purchase|payment)|currently (?:use|uses|using|spend|spends|pay|pays)|direct (?:customer|user) access|founder (?:has|runs|organizes|organises|worked|built|sold|delivered)|domain experience|industry experience)\b/i;

function normalizeObservedEvidence(value: unknown) {
  return normalizeArrayField(value)
    .filter((item) => OBSERVED_EVIDENCE_CLAIM.test(item))
    .slice(0, 5);
}

function normalizeScore(value: unknown) {
  const assessment = isRecord(value) ? value : {};
  const rawScore = Number(assessment.score);
  const score = Number.isFinite(rawScore)
    ? Math.min(10, Math.max(1, Math.round(rawScore)))
    : 1;

  return {
    score,
    label: scoreLabel(score),
    reason:
      String(assessment.reason ?? "").trim() ||
      "There is not enough evidence to support a stronger score.",
    evidence: normalizeObservedEvidence(assessment.evidence),
    uncertainty:
      String(assessment.uncertainty ?? "").trim() ||
      "Important assumptions remain unverified.",
  };
}

function unavailableFounderFit() {
  return {
    score: null,
    label: "Not available",
    reason: "Founder Fit cannot be assessed without a founder profile.",
    evidence: [],
    uncertainty: "Add a founder profile to assess relevant experience, skills, and customer access.",
  };
}

const STRONG_PROOF_CLAIM =
  /\b(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:existing\s+)?(?:paying\s+)?customers?\b|customers?\s+(?:have\s+)?(?:already\s+)?paid\b|paid customers?\b|revenue\b|signed (?:paid )?pilot\b|purchase order\b|deposit(?:s)?\b|pre-?order(?:s)?\b|repeat(?:ed)? (?:use|purchase|payment))\b/i;

function removeUnsupportedProofClaims<T extends { evidence: string[] }>(
  assessment: T,
  suppliedContext: string
) {
  const suppliedContextHasProof = STRONG_PROOF_CLAIM.test(suppliedContext);
  return {
    ...assessment,
    evidence: assessment.evidence.filter(
      (item) => suppliedContextHasProof || !STRONG_PROOF_CLAIM.test(item)
    ),
  };
}

function hasStrongEvidence(parsed: Record<string, unknown>) {
  const assessments = [
    parsed.founderFit,
    parsed.painOrDesire,
    parsed.mvpTestability,
    parsed.commercialPotential,
  ];
  const evidence = assessments
    .filter(isRecord)
    .flatMap((assessment) => normalizeArrayField(assessment.evidence))
    .join(" ");

  return /\b(paid|payment|revenue|sales?|deposit|pre-?order|purchase order|signed (?:paid )?pilot|customer data|existing customers?|repeat(?:ed)? use|direct (?:customer|user) access)\b/i.test(
    evidence
  );
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

function normalizeRecommendedStrategy(
  requested: RecommendedStrategy,
  parsed: Record<string, unknown>
): { strategy: RecommendedStrategy; reason?: string } {
  if (requested === "clarify_more") {
    return {
      strategy: "research_first",
      reason:
        "The idea has enough context for analysis, but important unknowns should be researched before making a larger commitment.",
    };
  }

  if (requested === "build_software_mvp" && parsed.confidenceLevel === "low") {
    return {
      strategy: "research_first",
      reason:
        "Customer and market evidence is still too uncertain to justify building a software MVP.",
    };
  }

  if (requested === "build_software_mvp" && !hasStrongEvidence(parsed)) {
    return {
      strategy: "build_tiny_prototype",
      reason:
        "A tiny prototype can test the core software behavior before the evidence justifies a full software MVP.",
    };
  }

  return { strategy: requested };
}

function fallbackStrategyReason(strategy: RecommendedStrategy, parsed: Record<string, unknown>) {
  const validationPlan = isRecord(parsed.validationPlan) ? parsed.validationPlan : {};
  const offerOrExperiment = String(validationPlan.offerOrExperiment ?? "").trim();
  const goal = String(validationPlan.goal ?? "").trim();
  const test = offerOrExperiment || "the Validation Plan";
  const purpose = goal || "the most important remaining assumption";

  switch (strategy) {
    case "research_first":
      return "Resolve the most important customer and market unknowns before committing to a product build.";
    case "test_manually_first":
      return `Test ${test} before building further because it can validate ${purpose} with real customer behavior.`;
    case "build_tiny_prototype":
      return `Build only the smallest prototype needed to test ${purpose} before investing in a broader product.`;
    case "build_software_mvp":
      return "A focused software MVP is justified because software is necessary for the test and the current evidence supports the investment.";
    case "pause":
      return "Pause further investment until the idea becomes a clearer priority or stronger evidence emerges.";
    case "kill":
      return "Stop pursuing this version because the current pain, founder fit, or commercial evidence does not justify another test.";
    case "clarify_more":
      return "Clarify the customer, problem, and proposed solution before choosing a validation strategy.";
  }
}

function isScoreArea(value: unknown): value is ScoreArea {
  return typeof value === "string" && SCORE_AREAS.some((area) => area === value);
}

function normalizeScoreImprovementRecommendations(value: unknown) {
  if (!Array.isArray(value)) return [];

  const seenAreas = new Set<ScoreArea>();
  return value
    .filter(isRecord)
    .filter((item) => isScoreArea(item.scoreArea))
    .map((item) => ({
      scoreArea: item.scoreArea as ScoreArea,
      currentIssue: String(item.currentIssue ?? "").trim(),
      recommendation: String(item.recommendation ?? "").trim(),
      whyItCouldImproveTheScore: String(item.whyItCouldImproveTheScore ?? "").trim(),
      evidenceToCollect: String(item.evidenceToCollect ?? "").trim(),
    }))
    .filter((item) => item.recommendation && item.evidenceToCollect)
    .filter((item) => {
      if (seenAreas.has(item.scoreArea)) return false;
      seenAreas.add(item.scoreArea);
      return true;
    })
    .slice(0, 4);
}

function normalizeValidationConstraints(value: unknown) {
  return normalizeArrayField(value)
    .filter((constraint) =>
      /\b(manual|deliver|fulfil|hour|minute|day|week|time|cost|budget|price|GBP|EUR|USD|safety|secure|privacy|regulat|legal|compliance|approval|capacity|limit|accuracy|quality|technical|feasibility|risk)\b/i.test(
        constraint
      )
    )
    .slice(0, 3);
}

function normalizeValidationPlan(parsed: Record<string, unknown>) {
  const value = isRecord(parsed.validationPlan) ? parsed.validationPlan : {};
  const offerOrExperiment =
    String(value.offerOrExperiment ?? "").trim() ||
    "Offer or run the First Testable Version with a specific target customer.";
  const decisionRule =
    String(value.decisionRule ?? "").trim() ||
    "Progress only after the experiment reaches a stated measurable behavior threshold.";
  const requestedType = String(value.testType ?? "").trim();
  const paymentIsBinding =
    /\b(pay(?:s|ment|able)?|paid|price|invoice|deposit|purchase order|signed paid pilot|financial commitment)\b/i.test(
      `${offerOrExperiment} ${decisionRule}`
    );
  const testType =
    requestedType === "non_payment_experiment" || !paymentIsBinding
      ? "non_payment_experiment"
      : "7_day_payment_validation";

  return {
    testType,
    testTypeLabel:
      testType === "7_day_payment_validation"
        ? "7-Day Payment Validation"
        : "Behavioral Validation Experiment",
    addressesConcern: String(value.addressesConcern ?? "").trim(),
    goal:
      String(value.goal ?? "").trim() ||
      "Test the most important assumption with observable real-world behavior.",
    offerOrExperiment,
    steps: normalizeArrayField(value.steps).slice(0, 7),
    decisionRule,
    constraints: normalizeValidationConstraints(value.constraints),
    timeRequired: String(value.timeRequired ?? "").trim() || "7 days",
    costEstimate: String(value.costEstimate ?? "").trim() || "€0-€50",
  } as const;
}

function normalizeAfterValidation(parsed: Record<string, unknown>) {
  const value = isRecord(parsed.afterValidation) ? parsed.afterValidation : {};
  const validationPlan = isRecord(parsed.validationPlan) ? parsed.validationPlan : {};
  const firstTestableVersion = String(parsed.firstTestableVersion ?? "").trim();
  const offerOrExperiment = String(validationPlan.offerOrExperiment ?? "").trim();
  const validatedPromise = firstTestableVersion || offerOrExperiment || "the validated offer";
  const learningPriorities = normalizeArrayField(value.learnFromDelivery).slice(0, 4);
  const requestedFulfilment = String(value.fulfilValidatedPromise ?? "").trim();
  const requestedRepeatedProof = String(value.repeatedProofTarget ?? "").trim();
  const requestedNextInvestment = String(value.nextInvestmentIfProven ?? "").trim();
  const learningFallbacks = [
    `Identify which part of ${validatedPromise} creates the strongest customer value.`,
    "Track the delivery friction, cost, or risk that most affects whether the validated promise can be repeated.",
  ];

  return {
    fulfilValidatedPromise:
      requestedFulfilment && !/\bbuild (?:the )?(?:full product|full platform)\b/i.test(requestedFulfilment)
        ? requestedFulfilment
        : `Fulfil ${validatedPromise} for the first validated customers using the simplest appropriate approach.`,
    learnFromDelivery: [...learningPriorities, ...learningFallbacks]
      .filter((item, index, items) => items.indexOf(item) === index)
      .slice(0, Math.max(2, Math.min(4, learningPriorities.length || 2))),
    repeatedProofTarget:
      requestedRepeatedProof &&
      !/\bscale immediately|after (?:one|a single|the first) successful\b/i.test(requestedRepeatedProof)
        ? requestedRepeatedProof
        : "Repeat the successful Validation Plan signal with at least three additional target customers.",
    nextInvestmentIfProven:
      requestedNextInvestment &&
      !/\bfull (?:product|platform)|every planned feature|all planned features\b/i.test(requestedNextInvestment)
        ? requestedNextInvestment
        : "Invest only in the smallest improvement justified by repeated customer value or observed delivery friction.",
    reviseOrStopIf:
      String(value.reviseOrStopIf ?? "").trim() ||
      "Revise, pause, or stop if the successful signal does not repeat with additional target customers.",
  };
}

function normalizeCriticalConcerns(parsed: Record<string, unknown>) {
  const value = Array.isArray(parsed.criticalRisksAndUnknowns)
    ? parsed.criticalRisksAndUnknowns
    : [];
  const allowedStages = ["validation_plan", "after_validation", "before_larger_investment"];
  const normalized = value
    .filter(isRecord)
    .map((item) => ({
      concern: String(item.concern ?? "").trim(),
      decisionImpact: String(item.decisionImpact ?? "").trim(),
      priority: item.priority === "primary" ? "primary" : "secondary",
      addressedDuring: allowedStages.includes(String(item.addressedDuring))
        ? String(item.addressedDuring)
        : "after_validation",
    }))
    .filter((item) => item.concern && item.decisionImpact)
    .filter(
      (item) =>
        !/\bmore research is needed|commercial potential is unknown|founder'?s? ability to build\b/i.test(
          item.concern
        )
    )
    .filter(
      (item) =>
        !/\b(?:conduct|run|do|commission|perform|build|create|offer|ask|interview|survey|research|test|track|measure|observe)\b/i.test(
          item.decisionImpact
        )
    );

  const fallbacks = [
    {
      concern: "Will target customers make the commitment required by the Validation Plan?",
      decisionImpact: "Determines whether the idea should progress beyond the immediate validation.",
      priority: "primary",
      addressedDuring: "validation_plan",
    },
    {
      concern: "Will the successful signal repeat with additional target customers?",
      decisionImpact: "Determines whether the next investment is justified.",
      priority: "secondary",
      addressedDuring: "after_validation",
    },
  ];
  const seen = new Set<string>();
  const concerns = [
    ...normalized,
    ...(normalized.length >= 2 ? [] : fallbacks),
  ]
    .filter((item) => {
      const key = item.concern.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
  const primaryIndex = concerns.findIndex((item) => item.priority === "primary");

  return concerns.map((item, index) => ({
    ...item,
    priority: index === (primaryIndex >= 0 ? primaryIndex : 0) ? "primary" : "secondary",
    addressedDuring:
      index === (primaryIndex >= 0 ? primaryIndex : 0)
        ? "validation_plan"
        : item.addressedDuring,
  }));
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

async function executeIdeaAnalysis({
  idea,
  model,
  deepThinking,
}: {
  idea: string;
  model: OllamaModel;
  deepThinking: boolean;
}, dependencies: IdeaAnalysisRunnerDependencies): Promise<AnalyzeResponse> {
  const performanceAccumulator: PerformanceAccumulator = {
    requestStartedAt: Date.now(),
    ollamaRequestMs: 0,
    jsonParseMs: 0,
    calls: [],
  };
  const founderProfile = await dependencies.readFounderProfile();
  const runMetadata = await buildRunMetadata(model, deepThinking);
  const founderProfileSection = founderProfile
    ? `Founder profile:\n${founderProfile}`
    : "Founder profile is not available. Founder fit cannot be reliably assessed from the idea alone.";

  const intakeResult = await dependencies.callModel(
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

Only return needs_clarification when core context is missing: targetCustomer, problemOrDesire, or proposedSolution. Missing secondary detail such as payer nuance, currentAlternative detail, valueOutcome detail, or mvpAngle detail should not block analysis when the core idea is clear. Those gaps should be handled later as uncertainty and evidence needed.

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
    const needsClarification = intakeNeedsClarification(intake, idea);

    if (needsClarification) {
      const performance = buildPerformance(model, performanceAccumulator);
      logPerformance(performance);
      return {
        ...normalizeClarification(intake, idea, isExtremelyVague),
        performance,
        runMetadata,
      };
    }

    const analysisResult = await dependencies.callModel(
      model,
      [
        {
          role: "system",
          content:
            "You are a skeptical product strategist. Analyze startup ideas with practical scrutiny. Scores estimate current evidence strength, not excitement. Missing evidence lowers scores. Scores above 8 are rare and require exceptional proof. Separate what is known, assumed, and uncertain. Never invent evidence or missing business context. Prefer manual validation before building software. Use the founder profile when assessing founder fit, but never quote or reproduce its source text. If the founder profile is missing or empty, founder fit must be marked not available and must not receive a numeric score. Treat claims and descriptions in the submitted idea as context, not observed evidence, unless they explicitly report completed tests, payments, customer behavior, customer data, or demonstrated founder experience/access. Return only valid JSON. No markdown, no commentary outside the JSON.",
        },
        {
          role: "user",
          content: `Analyze the following business idea and return only valid JSON with exactly these fields: ideaSummary, oneSentenceVerdict, strongestVersion, firstTestableVersion, targetCustomer, corePainOrDesire, founderFit, painOrDesire, mvpTestability, commercialPotential, scoreSummary, confidenceLevel, scoreImprovementRecommendations, whatNotToBuildYet, criticalRisksAndUnknowns, validationPlan, afterValidation, recommendedStrategy, recommendedStrategyLabel, strategyReason.

Each of founderFit, painOrDesire, mvpTestability, and commercialPotential must be an object with exactly:
score: integer from 1 to 10
label: string
reason: concise explanation of why the current evidence supports this score
evidence: array containing only genuine observed evidence explicitly reported in the idea or founder profile, such as completed tests, payments, measured customer behavior, direct customer access, or demonstrated founder experience; use an empty array when none exists and never restate the idea description as evidence
uncertainty: one concise piece of evidence or real-world result that would materially change the score

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

Return at most one recommendation for each scoreArea. Keep every field brief and avoid restating the same information across fields. This is retained for compatibility and is not displayed as a separate action section.

strongestVersion is the most compelling plausible version of the opportunity supported by the supplied context. Present it as a hypothesis to validate, never as proven fact.

firstTestableVersion means the simplest version that can be put in front of real users to test the core assumption. Make it concrete enough to execute.

recommendedStrategy must be exactly one of:
- clarify_more: the idea is still underspecified
- research_first: market or user context is too unknown
- test_manually_first: demand or willingness to pay is unproven and a manual test is possible
- build_tiny_prototype: a very small prototype is the best way to test behavior, but a full product is premature
- build_software_mvp: the idea is specific and testable, has some evidence, and software is genuinely needed
- pause: interesting but not currently high priority
- kill: weak pain, fit, and commercial potential make further testing unattractive

Do not default every idea to test_manually_first or "do not build software." Recommend build_tiny_prototype when software is the smallest useful behavioral test. Recommend research_first when customer understanding is the main gap. Recommend build_software_mvp only when evidence and necessity justify it. A completed analysis must not recommend clarify_more because unclear ideas should have been handled by intake. recommendedStrategyLabel is a readable label. strategyReason must explain why this strategy is the right next level of commitment and remain consistent with the assessment scores and confidence level.

Prefer conservative scores. If evidence is missing, say so clearly. Focus on the smallest useful version and separate future vision from MVP reality. Identify what not to build yet.

validationPlan is the single immediate next action and must contain exactly:
- testType: exactly "7_day_payment_validation" or "non_payment_experiment"
- testTypeLabel: exactly "7-Day Payment Validation" or "Behavioral Validation Experiment"
- addressesConcern: repeat the exact primary concern that this plan addresses
- goal: the most important assumption being tested
- offerOrExperiment: a concrete paid offer or observable real-world experiment
- steps: 4 to 7 concrete actions completed within 7 days
- decisionRule: one measurable behavior-based rule
- constraints: 0 to 3 meaningful operational constraints that are not merely the inverse of the decision rule
- timeRequired: a specific estimate
- costEstimate: a specific estimate or range

Validation-plan rules:
- Recommend the strongest practical real-world test of the most important assumption.
- Use 7_day_payment_validation whenever asking for payment or a binding financial commitment is plausible and tests the core risk.
- A 7-Day Payment Validation must identify a concrete buyer, offer, price, outreach channel, payment method, and the number of payments or binding commitments required within 7 days.
- Free engagement, compliments, verbal interest, survey answers, and hypothetical willingness to pay do not satisfy a payment Validation Plan.
- Use non_payment_experiment only when payment is genuinely premature or does not test the core risk. It must still measure observable behavior with a numeric threshold.
- Do not include inverse failure criteria. constraints are only for distinct limits such as manual fulfilment time, delivery cost, regulation, or safety.

afterValidation must contain exactly:
- fulfilValidatedPromise: how to fulfil the promise proven by the Validation Plan using the simplest approach appropriate to the business model, without building the full product
- learnFromDelivery: 2 to 4 concise, decision-relevant learning priorities about the offer, buyer, economics, customer value, or observed delivery friction
- repeatedProofTarget: a measurable repeated signal, including a number of additional customers, purchases, uses, or commitments, that would justify the next investment
- nextInvestmentIfProven: the smallest next investment unlocked by repeated proof, chosen from observed customer value or delivery friction rather than the original feature wish list
- reviseOrStopIf: the result that means revise the offer, pause, or stop instead of investing

After-Validation rules:
- Assume the Validation Plan succeeded once. Do not repeat the Validation Plan.
- Adapt fulfilment to the business model. Prefer manual or existing-tool delivery when practical, but do not force manual service delivery for hardware, marketplaces, content, regulated products, or technical-feasibility experiments.
- Focus repeatedProofTarget on repetition of the important validated behavior, especially repeat payment when relevant.
- Do not automatically use manual-delivery efficiency as the investment gate when automation is part of the intended solution.
- nextInvestmentIfProven must not jump to unrelated features or the full product.

criticalRisksAndUnknowns must contain 2 to 5 objects with exactly:
- concern: one known risk or unresolved assumption that could materially change a decision
- decisionImpact: one concise sentence naming the decision affected, such as proceed, pause, stop, change buyer, change offer, revise price, or make a specific investment
- priority: exactly "primary" or "secondary"
- addressedDuring: exactly "validation_plan", "after_validation", or "before_larger_investment"

Critical-risk rules:
- Include exactly one primary concern. It should usually be addressed during validation_plan and must match validationPlan.addressesConcern exactly.
- Include only decision-critical concerns. Omit generic startup risks, minor cautions, and broad statements.
- Do not include investigation steps, questions, tests, or resolution methods.
- Use after_validation for concerns about repeatability, delivery learning, or the next investment.
- Use before_larger_investment for known regulatory, legal, safety, or operational risks that could change a larger commitment.

Return only valid JSON. No markdown or commentary outside JSON.

Business idea:
${idea}

${founderProfileSection}`,
        },
      ],
      deepThinking ? 6000 : 3000,
      deepThinking
    );
    recordOllamaMetrics(performanceAccumulator, analysisResult.metrics);

    let parsed: Record<string, unknown>;
    try {
      parsed = timedExtractJson(analysisResult.assistantText, performanceAccumulator);
      parsed = redactSensitiveText(parsed, founderProfile) as Record<string, unknown>;
    } catch (parseError) {
      throw new Error(
        `Unable to parse JSON from Ollama response: ${parseError instanceof Error ? parseError.message : String(parseError)}. Response: ${analysisResult.assistantText.slice(0, 300)}`
      );
    }

    parsed.whatNotToBuildYet = normalizeArrayField(parsed.whatNotToBuildYet);
    parsed.validationPlan = normalizeValidationPlan(parsed);
    parsed.afterValidation = normalizeAfterValidation(parsed);
    parsed.criticalRisksAndUnknowns = normalizeCriticalConcerns(parsed);
    const primaryConcern = (
      parsed.criticalRisksAndUnknowns as ReturnType<typeof normalizeCriticalConcerns>
    ).find((item) => item.priority === "primary");
    parsed.validationPlan = {
      ...(parsed.validationPlan as ReturnType<typeof normalizeValidationPlan>),
      addressesConcern:
        primaryConcern?.concern ||
        (parsed.validationPlan as ReturnType<typeof normalizeValidationPlan>).addressesConcern,
    };
    const validationPlan = parsed.validationPlan as ReturnType<typeof normalizeValidationPlan>;
    const ideaSummary = String(parsed.ideaSummary ?? idea).trim();
    const targetCustomer = String(parsed.targetCustomer ?? "").trim();
    parsed.strongestVersion =
      String(parsed.strongestVersion ?? "").trim() ||
      `A focused, plausible version of ${ideaSummary}${
        targetCustomer ? ` for ${targetCustomer}` : ""
      }, subject to real-world validation.`;
    parsed.firstTestableVersion =
      String(parsed.firstTestableVersion ?? "").trim() ||
      `Use this as the First Testable Version: ${validationPlan.offerOrExperiment}`;
    parsed.whatNotToBuildYet =
      (parsed.whatNotToBuildYet as string[]).length > 0
        ? parsed.whatNotToBuildYet
        : ["A full product or capabilities beyond the First Testable Version"];
    const suppliedContext = `${idea}\n${founderProfile}`;
    parsed.founderFit = founderProfile
      ? removeUnsupportedProofClaims(
          normalizeScore(parsed.founderFit),
          suppliedContext
        )
      : unavailableFounderFit();
    parsed.painOrDesire = removeUnsupportedProofClaims(
      normalizeScore(parsed.painOrDesire),
      suppliedContext
    );
    parsed.mvpTestability = removeUnsupportedProofClaims(
      normalizeScore(parsed.mvpTestability),
      suppliedContext
    );
    parsed.commercialPotential = removeUnsupportedProofClaims(
      normalizeScore(parsed.commercialPotential),
      suppliedContext
    );
    parsed.scoreSummary =
      String(parsed.scoreSummary ?? "").trim() ||
      "The scores reflect the strength of currently provided evidence and should improve only when assumptions are validated.";
    const requestedConfidence = ["low", "medium", "high"].includes(String(parsed.confidenceLevel))
      ? String(parsed.confidenceLevel)
      : "low";
    parsed.confidenceLevel =
      requestedConfidence === "high" && !hasStrongEvidence(parsed)
        ? "medium"
        : requestedConfidence;
    parsed.firstTestableVersion = String(parsed.firstTestableVersion ?? "").trim();
    const scoreImprovementRecommendations = normalizeScoreImprovementRecommendations(
      parsed.scoreImprovementRecommendations
    );
    parsed.scoreImprovementRecommendations =
      scoreImprovementRecommendations.length > 0
        ? scoreImprovementRecommendations
        : [fallbackScoreImprovementRecommendation(parsed)];
    const requestedStrategy = isRecommendedStrategy(parsed.recommendedStrategy)
      ? parsed.recommendedStrategy
      : "research_first";
    const normalizedStrategy = normalizeRecommendedStrategy(
      requestedStrategy,
      parsed
    );
    parsed.recommendedStrategy = normalizedStrategy.strategy;
    parsed.recommendedStrategyLabel = STRATEGY_LABELS[normalizedStrategy.strategy];
    parsed.strategyReason =
      normalizedStrategy.reason ||
      String(parsed.strategyReason ?? "").trim() ||
      fallbackStrategyReason(normalizedStrategy.strategy, parsed);
    const performance = buildPerformance(model, performanceAccumulator);
    logPerformance(performance);

    return {
      status: "analysis",
      ideaSummary: parsed.ideaSummary,
      oneSentenceVerdict: parsed.oneSentenceVerdict,
      strongestVersion: parsed.strongestVersion,
      firstTestableVersion: parsed.firstTestableVersion,
      targetCustomer: parsed.targetCustomer,
      corePainOrDesire: parsed.corePainOrDesire,
      founderFit: parsed.founderFit,
      painOrDesire: parsed.painOrDesire,
      mvpTestability: parsed.mvpTestability,
      commercialPotential: parsed.commercialPotential,
      scoreSummary: parsed.scoreSummary,
      confidenceLevel: parsed.confidenceLevel,
      scoreImprovementRecommendations: parsed.scoreImprovementRecommendations,
      whatNotToBuildYet: parsed.whatNotToBuildYet,
      criticalRisksAndUnknowns: parsed.criticalRisksAndUnknowns,
      validationPlan: parsed.validationPlan,
      afterValidation: parsed.afterValidation,
      recommendedStrategy: parsed.recommendedStrategy,
      recommendedStrategyLabel: parsed.recommendedStrategyLabel,
      strategyReason: parsed.strategyReason,
      performance,
      runMetadata,
    } as AnalysisResponse;
}

export function createIdeaAnalysisRunner(dependencies: IdeaAnalysisRunnerDependencies) {
  return async function runIdeaAnalysis(input: {
    idea: string;
    model: OllamaModel;
    deepThinking: boolean;
  }): Promise<AnalyzeResponse> {
    try {
      return await executeIdeaAnalysis(input, dependencies);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected analysis error.";
      const isConnectionError = /Failed to fetch|ECONNREFUSED|connect/i.test(message);

      throw new IdeaAnalysisRunError(
        isConnectionError
          ? "Unable to connect to local Ollama at http://localhost:11434. Please make sure Ollama is running."
          : `Analysis failed: ${message}`,
        isConnectionError ? "ollama_unavailable" : "analysis_failed"
      );
    }
  };
}

const runDefaultIdeaAnalysis = createIdeaAnalysisRunner({
  readFounderProfile,
  callModel: callOllama,
});

export async function runIdeaAnalysis(input: {
  idea: string;
  model: OllamaModel;
  deepThinking: boolean;
}): Promise<AnalyzeResponse> {
  return runDefaultIdeaAnalysis(input);
}
