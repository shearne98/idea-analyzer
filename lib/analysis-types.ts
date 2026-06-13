export type ManualTest = {
  goal: string;
  steps: string[];
  successCriteria: string[];
  failureCriteria: string[];
  timeRequired: string;
  costEstimate: string;
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
};

export type AnalysisResponse = {
  status: "analysis";
  ideaSummary: string;
  oneSentenceVerdict: string;
  strongestVersion: string;
  smallestViableWedge: string;
  targetCustomer: string;
  corePainOrDesire: string;
  founderFitScore: number;
  founderFitReason: string;
  painOrDesireScore: number;
  painOrDesireReason: string;
  mvpTestabilityScore: number;
  mvpTestabilityReason: string;
  commercialPotentialScore: number;
  commercialPotentialReason: string;
  scoreCalibration: string;
  mostDangerousAssumption: string;
  whyThisMightFail: string[];
  whatNotToBuildYet: string[];
  manualValidationTest: ManualTest;
  questionsToAskUsers: string[];
  evidenceNeededBeforeBuilding: string[];
  recommendedNextAction: string;
  buildDecision: "build_later" | "test_manually_first" | "pause" | "kill";
};

export type AnalyzeResponse = ClarificationResponse | AnalysisResponse;
