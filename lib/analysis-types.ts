export type ValidationPlan = {
  testType: "7_day_payment_validation" | "non_payment_experiment";
  testTypeLabel: "7-Day Payment Validation" | "Behavioral Validation Experiment";
  goal: string;
  offerOrExperiment: string;
  steps: string[];
  decisionRule: string;
  constraints: string[];
  timeRequired: string;
  costEstimate: string;
};

export type AfterValidation = {
  deliverManually: string;
  learnFromCustomers: string;
  repeatBeforeScaling: string;
};

export type KeyUnknown = {
  unknown: string;
  howToResolve: string;
};

export type PerformanceMetrics = {
  model: string;
  requestStartedAt: string;
  requestFinishedAt: string;
  totalRequestMs: number;
  ollamaRequestMs: number;
  ollamaTotalMs: number | null;
  ollamaGenerationMs: number | null;
  modelLoadMs: number | null;
  promptTokens: number | null;
  outputTokens: number | null;
  promptTokensPerSecond: number | null;
  outputTokensPerSecond: number | null;
  jsonParseMs: number | null;
};

export type RunMetadata = {
  analysisVersion: string;
  codeVersion: string;
  model: string;
  deepThinking: boolean;
  temperature: number;
  seed: number;
};

export const INTAKE_FIELDS = [
  {
    key: "targetCustomer",
    label: "Target customer",
    description: "Who is this for?",
  },
  {
    key: "problemOrDesire",
    label: "Problem or desire",
    description: "What pain, desire, inefficiency, or behavior are you trying to address?",
  },
  {
    key: "proposedSolution",
    label: "Proposed solution",
    description: "What are you roughly imagining: app, service, hardware, marketplace, automation, content, etc.?",
  },
  {
    key: "valueOutcome",
    label: "Value created",
    description: "What improves for the user: time, money, status, health, convenience, compliance, enjoyment, etc.?",
  },
  {
    key: "payer",
    label: "Buyer / payer",
    description: "Who might pay for this, if anyone?",
  },
  {
    key: "currentAlternative",
    label: "Current workaround",
    description: "How do people solve this today, if they do?",
  },
  {
    key: "mvpAngle",
    label: "MVP test angle",
    description: "What is the smallest way you could test this manually or cheaply?",
  },
] as const;

export type IntakeField = (typeof INTAKE_FIELDS)[number];
export type IntakeFieldKey = IntakeField["key"];

export function isIntakeFieldKey(value: unknown): value is IntakeFieldKey {
  return typeof value === "string" && INTAKE_FIELDS.some((field) => field.key === value);
}

export type ClarificationResponse = {
  status: "needs_clarification";
  reason: string;
  missingFields: IntakeFieldKey[];
  clarifyingQuestions: string[];
  possibleDirections: string[];
  performance: PerformanceMetrics;
  runMetadata: RunMetadata;
};

export type ScoreAssessment = {
  score: number | null;
  label: string;
  reason: string;
  evidence: string[];
  uncertainty: string;
};

export const SCORE_AREAS = [
  "Founder Fit",
  "Pain / Desire",
  "MVP Testability",
  "Commercial Potential",
] as const;

export type ScoreArea = (typeof SCORE_AREAS)[number];

export type ScoreImprovementRecommendation = {
  scoreArea: ScoreArea;
  currentIssue: string;
  recommendation: string;
  whyItCouldImproveTheScore: string;
  evidenceToCollect: string;
};

export type RecommendedStrategy =
  | "clarify_more"
  | "research_first"
  | "test_manually_first"
  | "build_tiny_prototype"
  | "build_software_mvp"
  | "pause"
  | "kill";

export type AnalysisResponse = {
  status: "analysis";
  ideaSummary: string;
  oneSentenceVerdict: string;
  strongestVersion: string;
  firstTestableVersion: string;
  targetCustomer: string;
  corePainOrDesire: string;
  founderFit: ScoreAssessment;
  painOrDesire: ScoreAssessment;
  mvpTestability: ScoreAssessment;
  commercialPotential: ScoreAssessment;
  scoreSummary: string;
  confidenceLevel: "low" | "medium" | "high";
  scoreImprovementRecommendations: ScoreImprovementRecommendation[];
  mostDangerousAssumption: string;
  whyThisMightFail: string[];
  whatNotToBuildYet: string[];
  validationPlan: ValidationPlan;
  afterValidation: AfterValidation;
  keyUnknowns: KeyUnknown[];
  recommendedStrategy: RecommendedStrategy;
  recommendedStrategyLabel: string;
  strategyReason: string;
  performance: PerformanceMetrics;
  runMetadata: RunMetadata;
};

export type AnalyzeResponse = ClarificationResponse | AnalysisResponse;
