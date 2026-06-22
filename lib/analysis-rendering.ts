import {
  INTAKE_FIELDS,
  type AnalysisResponse,
  type AnalyzeResponse,
  type ClarificationResponse,
} from "@/lib/analysis-types";

type AnalyzeResponseArtifact = {
  id?: string;
  savedAt?: string;
  idea?: string;
  response: AnalyzeResponse;
};

type MarkdownRenderableAnalysis = AnalyzeResponse | AnalyzeResponseArtifact;

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

function subsection(title: string, body: string) {
  return body.trim() ? `### ${title}\n\n${body.trim()}` : "";
}

function renderScoreAssessment(
  title: string,
  assessment: AnalysisResponse["founderFit"]
) {
  return subsection(
    title,
    [
      `Score: ${assessment.score ?? "Not available"}`,
      `Label: ${assessment.label}`,
      `Reason: ${assessment.reason}`,
      assessment.evidence.length > 0 ? `Evidence:\n${markdownList(assessment.evidence)}` : "",
      `Uncertainty: ${assessment.uncertainty}`,
    ]
      .filter(Boolean)
      .join("\n\n")
  );
}

function renderRunMetadata(response: AnalysisResponse) {
  const metadata = response.runMetadata;
  return markdownList([
    `Analysis version: ${metadata.analysisVersion}`,
    `Code version: ${metadata.codeVersion}`,
    `Model: ${metadata.model}`,
    `Thinking mode: ${metadata.deepThinking ? "on" : "off"}`,
    `Seed: ${metadata.seed}`,
    `Temperature: ${metadata.temperature}`,
  ]);
}

function renderAnalysisMarkdown(response: AnalysisResponse) {
  const viewModel = buildAnalysisViewModel(response);
  const scores = viewModel.scoreCards
    .map(({ title, assessment }) => renderScoreAssessment(title, assessment))
    .join("\n\n");
  const concerns = viewModel.criticalConcerns
    .map(
      (concern) =>
        `- ${concern.priorityLabel}: ${concern.concern}\n  - Decision impact: ${concern.decisionImpact}\n  - Address during: ${concern.stageLabel}`
    )
    .join("\n");

  return [
    "# Idea Analysis",
    section("Verdict", response.oneSentenceVerdict),
    section("Strongest Version", response.strongestVersion),
    section("First Testable Version", response.firstTestableVersion),
    section(
      "Idea Assessment",
      [
        scores,
        subsection(
          "Summary",
          [
            response.scoreSummary,
            `Target customer: ${response.targetCustomer}`,
            `Core pain / desire: ${response.corePainOrDesire}`,
            `Confidence: ${response.confidenceLevel}`,
          ].join("\n\n")
        ),
      ].join("\n\n")
    ),
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
        `Constraints:\n${markdownList(formatList(response.validationPlan.constraints))}`,
        `Time required: ${response.validationPlan.timeRequired}`,
        `Cost estimate: ${response.validationPlan.costEstimate}`,
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
    section(
      "Recommended Strategy",
      [
        `Strategy: ${response.recommendedStrategyLabel}`,
        `Strategy key: ${response.recommendedStrategy}`,
        response.strategyReason,
        `Idea: ${response.ideaSummary}`,
        `What not to build yet:\n${markdownList(formatList(response.whatNotToBuildYet))}`,
      ].join("\n\n")
    ),
    section("Run Metadata", renderRunMetadata(response)),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function renderSourceIdea(input: AnalyzeResponseArtifact) {
  return [
    input.idea ? section("Source Idea", input.idea) : "",
    input.savedAt ? section("Artifact", markdownList([`Saved at: ${input.savedAt}`])) : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function isAnalyzeResponseArtifact(
  input: MarkdownRenderableAnalysis
): input is AnalyzeResponseArtifact {
  return "response" in input;
}

export function renderAnalyzeResponseMarkdown(input: MarkdownRenderableAnalysis): string {
  if (isAnalyzeResponseArtifact(input)) {
    const renderedResponse: string = renderAnalyzeResponseMarkdown(input.response);
    const context = renderSourceIdea(input);
    return context ? renderedResponse.replace("\n\n## Run Metadata", `\n\n${context}\n\n## Run Metadata`) : renderedResponse;
  }

  return input.status === "needs_clarification"
    ? renderClarificationMarkdown(input)
    : renderAnalysisMarkdown(input);
}
