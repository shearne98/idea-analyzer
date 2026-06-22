import {
  INTAKE_FIELDS,
  type AnalysisResponse,
  type AnalyzeResponse,
  type ClarificationResponse,
} from "@/lib/analysis-types";

export function formatList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export function hasDisplayContent(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

export function strategyStyle(strategy: AnalysisResponse["recommendedStrategy"]) {
  switch (strategy) {
    case "clarify_more":
    case "research_first":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "test_manually_first":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "build_tiny_prototype":
    case "build_software_mvp":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "pause":
      return "border-slate-300 bg-slate-100 text-slate-700";
    case "kill":
      return "border-rose-200 bg-rose-50 text-rose-800";
    default:
      return "border-slate-300 bg-slate-100 text-slate-700";
  }
}

export function concernStageLabel(
  stage: AnalysisResponse["criticalRisksAndUnknowns"][number]["addressedDuring"]
) {
  switch (stage) {
    case "validation_plan":
      return "Validation Plan";
    case "after_validation":
      return "After Validation";
    case "before_larger_investment":
      return "Before larger investment";
  }
}

export function buildAnalysisViewModel(response: AnalysisResponse) {
  return {
    strategyStyle: strategyStyle(response.recommendedStrategy),
    scoreCards: [
      { title: "Founder Fit", assessment: response.founderFit },
      { title: "Pain / Desire", assessment: response.painOrDesire },
      { title: "MVP Testability", assessment: response.mvpTestability },
      { title: "Commercial Potential", assessment: response.commercialPotential },
    ],
    criticalConcerns: response.criticalRisksAndUnknowns.map((concern) => ({
      ...concern,
      priorityLabel: concern.priority === "primary" ? "Primary concern" : "Secondary concern",
      stageLabel: concernStageLabel(concern.addressedDuring),
    })),
  };
}

function markdownList(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function numberedMarkdownList(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join("\n");
}

function section(title: string, body: string) {
  return body.trim() ? `## ${title}\n\n${body.trim()}` : "";
}

function renderClarificationMarkdown(response: ClarificationResponse) {
  const missingFields = response.missingFields
    .map((fieldKey) => INTAKE_FIELDS.find((field) => field.key === fieldKey)?.label)
    .filter((label) => Boolean(label))
    .map((label) => String(label));

  return [
    "# Idea Intake",
    response.reason,
    section("Missing Context", markdownList(missingFields)),
    section("Clarifying Questions", numberedMarkdownList(response.clarifyingQuestions)),
    section("Possible Directions", markdownList(response.possibleDirections)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderAnalysisMarkdown(response: AnalysisResponse) {
  const viewModel = buildAnalysisViewModel(response);
  const scores = viewModel.scoreCards
    .map(
      ({ title, assessment }) =>
        `- ${title}: ${assessment.score ?? "Not available"} (${assessment.label}) - ${assessment.reason}`
    )
    .join("\n");
  const concerns = viewModel.criticalConcerns
    .map(
      (concern) =>
        `- ${concern.priorityLabel}: ${concern.concern}\n  - Decision impact: ${concern.decisionImpact}\n  - Address during: ${concern.stageLabel}`
    )
    .join("\n");

  return [
    "# Idea Analysis",
    section(
      "Recommended Direction",
      [
        response.oneSentenceVerdict,
        `Strategy: ${response.recommendedStrategyLabel}`,
        response.strategyReason,
        `Idea: ${response.ideaSummary}`,
      ].join("\n\n")
    ),
    section(
      "Product Scope",
      [
        `Strongest Version: ${response.strongestVersion}`,
        `First Testable Version: ${response.firstTestableVersion}`,
        `What Not To Build Yet:\n${markdownList(formatList(response.whatNotToBuildYet))}`,
      ].join("\n\n")
    ),
    section("Idea Assessment", `${scores}\n\nSummary: ${response.scoreSummary}`),
    section("Critical Risks & Unknowns", concerns),
    section(
      "Validation Plan",
      [
        `Type: ${response.validationPlan.testTypeLabel}`,
        `Addresses: ${response.validationPlan.addressesConcern}`,
        `Goal: ${response.validationPlan.goal}`,
        `Offer or experiment: ${response.validationPlan.offerOrExperiment}`,
        `Steps:\n${numberedMarkdownList(formatList(response.validationPlan.steps))}`,
        `Decision rule: ${response.validationPlan.decisionRule}`,
      ].join("\n\n")
    ),
    section(
      "After Validation",
      [
        `Fulfil: ${response.afterValidation.fulfilValidatedPromise}`,
        `Learn:\n${markdownList(response.afterValidation.learnFromDelivery)}`,
        `Repeated proof target: ${response.afterValidation.repeatedProofTarget}`,
        `Next investment if proven: ${response.afterValidation.nextInvestmentIfProven}`,
        `Revise or stop if: ${response.afterValidation.reviseOrStopIf}`,
      ].join("\n\n")
    ),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function renderAnalyzeResponseMarkdown(response: AnalyzeResponse) {
  return response.status === "needs_clarification"
    ? renderClarificationMarkdown(response)
    : renderAnalysisMarkdown(response);
}
