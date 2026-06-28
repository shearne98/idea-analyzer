import type { AnalyzeResponse } from "@/lib/analysis-types";
import type { IdeaIntakeResult } from "@/lib/idea-intake";
import { IDEA_INTAKE_SCHEMA_VERSION } from "@/lib/idea-intake";
import { IDEA_READINESS_SCHEMA_VERSION, type IdeaReadinessResult } from "@/lib/idea-readiness";
import type { RefreshNormalizedResult } from "@/lib/idea-refresh-normalized";
import { REFRESH_NORMALIZED_SCHEMA_VERSION } from "@/lib/idea-refresh-normalized";
import { NORMALIZED_IDEA_SCHEMA_VERSION } from "@/lib/normalized-idea";

export const EXTERNAL_EXECUTION_CONTRACT_VERSION = 1;
export const ANALYSIS_RESPONSE_SCHEMA_VERSION = 1;

export type ExternalExecutionTask = "readiness" | "intake" | "refresh-normalized" | "analysis";

export type ExternalExecutionBackendMetadata = {
  kind: "external_model" | "local_model" | "manual";
  id: string;
  label?: string;
  model?: string;
};

export type ExternalExecutionProtocolMetadata = {
  normalizedIdeaSchemaVersion: typeof NORMALIZED_IDEA_SCHEMA_VERSION;
  readinessSchemaVersion: typeof IDEA_READINESS_SCHEMA_VERSION;
  intakeSchemaVersion: typeof IDEA_INTAKE_SCHEMA_VERSION;
  refreshNormalizedSchemaVersion: typeof REFRESH_NORMALIZED_SCHEMA_VERSION;
  analysisResponseSchemaVersion: typeof ANALYSIS_RESPONSE_SCHEMA_VERSION;
};

type ReadinessPacketInput = {
  normalizedIdeaMarkdown: string;
};

type IntakePacketInput = {
  normalizedIdeaMarkdown: string;
  sourceMaterial?: string;
  answers?: Record<string, string>;
};

type RefreshNormalizedPacketInput = {
  existingNormalizedIdeaMarkdown: string;
  updatedSourceMaterial: string;
};

type AnalysisPacketInput = {
  normalizedIdeaMarkdown: string;
  founderProfileMarkdown: string;
  readiness?: IdeaReadinessResult;
};

export type ExternalExecutionPacketInputByTask = {
  readiness: ReadinessPacketInput;
  intake: IntakePacketInput;
  "refresh-normalized": RefreshNormalizedPacketInput;
  analysis: AnalysisPacketInput;
};

export type ExternalExecutionOutputByTask = {
  readiness: IdeaReadinessResult;
  intake: IdeaIntakeResult;
  "refresh-normalized": RefreshNormalizedResult;
  analysis: AnalyzeResponse;
};

export type ExternalExecutionPacket<TTask extends ExternalExecutionTask = ExternalExecutionTask> = {
  contract: "idea-analyzer.external-execution.packet";
  contractVersion: typeof EXTERNAL_EXECUTION_CONTRACT_VERSION;
  packetId: string;
  runId: string;
  task: TTask;
  createdAt: string;
  backend: ExternalExecutionBackendMetadata;
  protocol: ExternalExecutionProtocolMetadata;
  input: ExternalExecutionPacketInputByTask[TTask];
  prompt: {
    system: string;
    user: string;
  };
  expectedResponse: {
    contract: "idea-analyzer.external-execution.response";
    contractVersion: typeof EXTERNAL_EXECUTION_CONTRACT_VERSION;
    task: TTask;
    outputContract: string;
  };
};

export type ExternalExecutionResponse<TTask extends ExternalExecutionTask = ExternalExecutionTask> = {
  contract: "idea-analyzer.external-execution.response";
  contractVersion: typeof EXTERNAL_EXECUTION_CONTRACT_VERSION;
  packetId: string;
  runId: string;
  task: TTask;
  backend: ExternalExecutionBackendMetadata;
  generatedAt: string;
  output: ExternalExecutionOutputByTask[TTask];
};

export type ExternalExecutionResponseValidation<TTask extends ExternalExecutionTask = ExternalExecutionTask> =
  | {
      valid: true;
      errors: [];
      response: ExternalExecutionResponse<TTask>;
    }
  | {
      valid: false;
      errors: string[];
      response?: undefined;
    };

type BuildPacketInput<TTask extends ExternalExecutionTask> = {
  task: TTask;
  runId: string;
  backend: ExternalExecutionBackendMetadata;
  input: ExternalExecutionPacketInputByTask[TTask];
  createdAt?: string;
};

const OUTPUT_CONTRACT_BY_TASK: Record<ExternalExecutionTask, string> = {
  readiness: "idea-readiness",
  intake: "idea-intake",
  "refresh-normalized": "refresh-normalized",
  analysis: "analysis-response",
};

const protocol: ExternalExecutionProtocolMetadata = {
  normalizedIdeaSchemaVersion: NORMALIZED_IDEA_SCHEMA_VERSION,
  readinessSchemaVersion: IDEA_READINESS_SCHEMA_VERSION,
  intakeSchemaVersion: IDEA_INTAKE_SCHEMA_VERSION,
  refreshNormalizedSchemaVersion: REFRESH_NORMALIZED_SCHEMA_VERSION,
  analysisResponseSchemaVersion: ANALYSIS_RESPONSE_SCHEMA_VERSION,
};

function isoTimestamp(value = new Date().toISOString()) {
  return value;
}

function stableHash(value: unknown) {
  const serialized = JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < serialized.length; index += 1) {
    hash = (hash * 31 + serialized.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function buildSystemPrompt(task: ExternalExecutionTask) {
  return [
    "You are executing an Idea Analyzer-defined protocol for a model-backed task.",
    "Follow the supplied packet exactly. Do not invent a different workflow or mutate input files.",
    "Return only a JSON object matching the expected response contract and task output schema.",
    `Task: ${task}.`,
  ].join("\n");
}

function buildUserPrompt<TTask extends ExternalExecutionTask>(
  task: TTask,
  input: ExternalExecutionPacketInputByTask[TTask]
) {
  const serializedInput = JSON.stringify(input, null, 2);
  const common = [
    "Execute this Idea Analyzer packet.",
    `Required output contract: ${OUTPUT_CONTRACT_BY_TASK[task]}.`,
    "Include schema/version fields from the packet where applicable.",
  ];

  if (task === "analysis") {
    common.push(
      "Final analysis must use only the normalized idea and explicit Founder Profile supplied in this packet.",
      "Do not use source.md or process.cwd(). Do not quote or reproduce Founder Profile source text.",
      "Founder Profile is included below inside the packet input."
    );
  }

  return `${common.join("\n")}\n\nPacket input JSON:\n${serializedInput}`;
}

export function buildExternalExecutionPacket<TTask extends ExternalExecutionTask>({
  task,
  runId,
  backend,
  input,
  createdAt = isoTimestamp(),
}: BuildPacketInput<TTask>): ExternalExecutionPacket<TTask> {
  const packetCore = { runId, task, backend, protocol, input, createdAt };
  return {
    contract: "idea-analyzer.external-execution.packet",
    contractVersion: EXTERNAL_EXECUTION_CONTRACT_VERSION,
    packetId: `${runId}:${task}:${stableHash(packetCore)}`,
    runId,
    task,
    createdAt,
    backend,
    protocol,
    input,
    prompt: {
      system: buildSystemPrompt(task),
      user: buildUserPrompt(task, input),
    },
    expectedResponse: {
      contract: "idea-analyzer.external-execution.response",
      contractVersion: EXTERNAL_EXECUTION_CONTRACT_VERSION,
      task,
      outputContract: OUTPUT_CONTRACT_BY_TASK[task],
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireString(errors: string[], value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string.`);
  }
}

function requireArray(errors: string[], value: unknown, label: string) {
  if (!Array.isArray(value)) errors.push(`${label} must be an array.`);
}

function requireObject(errors: string[], value: unknown, label: string) {
  if (!isRecord(value)) errors.push(`${label} must be an object.`);
}

function validateReadinessOutput(output: unknown) {
  const errors: string[] = [];
  if (!isRecord(output)) return ["Readiness output must be an object."];

  if (output.contract !== "idea-readiness") errors.push("Readiness output contract must be idea-readiness.");
  if (output.schemaVersion !== IDEA_READINESS_SCHEMA_VERSION) {
    errors.push(`Readiness output schemaVersion must be ${IDEA_READINESS_SCHEMA_VERSION}.`);
  }
  if (output.normalizedIdeaSchemaVersion !== NORMALIZED_IDEA_SCHEMA_VERSION) {
    errors.push(`Readiness output normalizedIdeaSchemaVersion must be ${NORMALIZED_IDEA_SCHEMA_VERSION}.`);
  }
  if (typeof output.readyForFinalAnalysis !== "boolean") {
    errors.push("Readiness output readyForFinalAnalysis must be a boolean.");
  }
  if (!isIsoTimestamp(output.generatedAt)) {
    errors.push("Readiness output generatedAt must be an ISO timestamp string.");
  }
  requireArray(errors, output.blockers, "Readiness output blockers");
  requireArray(errors, output.warnings, "Readiness output warnings");
  requireArray(errors, output.suggestions, "Readiness output suggestions");
  return errors;
}

function validateIntakeOutput(output: unknown) {
  const errors = validateReadinessLikeContract(output, "idea-intake", IDEA_INTAKE_SCHEMA_VERSION, "Intake");
  if (!isRecord(output)) return errors;
  requireObject(errors, output.readiness, "Intake output readiness");
  requireArray(errors, output.questions, "Intake output questions");
  requireArray(errors, output.proposedUpdates, "Intake output proposedUpdates");
  return errors;
}

function validateRefreshNormalizedOutput(output: unknown) {
  const errors = validateReadinessLikeContract(
    output,
    "refresh-normalized",
    REFRESH_NORMALIZED_SCHEMA_VERSION,
    "Refresh-normalized"
  );
  if (!isRecord(output)) return errors;
  requireObject(errors, output.readiness, "Refresh-normalized output readiness");
  requireArray(errors, output.proposedUpdates, "Refresh-normalized output proposedUpdates");
  requireArray(errors, output.warnings, "Refresh-normalized output warnings");
  requireArray(errors, output.questions, "Refresh-normalized output questions");
  return errors;
}

function validateReadinessLikeContract(
  output: unknown,
  contract: string,
  schemaVersion: number,
  label: string
) {
  const errors: string[] = [];
  if (!isRecord(output)) return [`${label} output must be an object.`];
  if (output.contract !== contract) errors.push(`${label} output contract must be ${contract}.`);
  if (output.schemaVersion !== schemaVersion) {
    errors.push(`${label} output schemaVersion must be ${schemaVersion}.`);
  }
  if (output.normalizedIdeaSchemaVersion !== NORMALIZED_IDEA_SCHEMA_VERSION) {
    errors.push(`${label} output normalizedIdeaSchemaVersion must be ${NORMALIZED_IDEA_SCHEMA_VERSION}.`);
  }
  if (!isIsoTimestamp(output.generatedAt)) {
    errors.push(`${label} output generatedAt must be an ISO timestamp string.`);
  }
  return errors;
}

function validateAssessment(errors: string[], value: unknown, label: string) {
  if (!isRecord(value)) {
    errors.push(`Analysis output ${label} must be an object.`);
    return;
  }
  requireString(errors, value.label, `Analysis output ${label}.label`);
  requireString(errors, value.reason, `Analysis output ${label}.reason`);
  requireArray(errors, value.evidence, `Analysis output ${label}.evidence`);
  requireString(errors, value.uncertainty, `Analysis output ${label}.uncertainty`);
}

function validateAnalysisOutput(output: unknown) {
  const errors: string[] = [];
  if (!isRecord(output)) return ["Analysis output must be an object."];
  if (output.status !== "analysis" && output.status !== "needs_clarification") {
    errors.push("Analysis output status must be analysis or needs_clarification.");
  }

  if (output.status === "needs_clarification") {
    requireString(errors, output.reason, "Analysis output reason");
    requireArray(errors, output.missingFields, "Analysis output missingFields");
    requireArray(errors, output.clarifyingQuestions, "Analysis output clarifyingQuestions");
    requireArray(errors, output.possibleDirections, "Analysis output possibleDirections");
    requireObject(errors, output.performance, "Analysis output performance");
    requireObject(errors, output.runMetadata, "Analysis output runMetadata");
    return errors;
  }

  for (const field of [
    "ideaSummary",
    "oneSentenceVerdict",
    "strongestVersion",
    "firstTestableVersion",
    "targetCustomer",
    "corePainOrDesire",
    "scoreSummary",
    "confidenceLevel",
    "recommendedStrategy",
    "recommendedStrategyLabel",
    "strategyReason",
  ]) {
    requireString(errors, output[field], `Analysis output ${field}`);
  }

  validateAssessment(errors, output.founderFit, "founderFit");
  validateAssessment(errors, output.painOrDesire, "painOrDesire");
  validateAssessment(errors, output.mvpTestability, "mvpTestability");
  validateAssessment(errors, output.commercialPotential, "commercialPotential");
  requireArray(errors, output.scoreImprovementRecommendations, "Analysis output scoreImprovementRecommendations");
  requireArray(errors, output.whatNotToBuildYet, "Analysis output whatNotToBuildYet");
  requireArray(errors, output.criticalRisksAndUnknowns, "Analysis output criticalRisksAndUnknowns");
  requireObject(errors, output.validationPlan, "Analysis output validationPlan");
  requireObject(errors, output.afterValidation, "Analysis output afterValidation");
  requireObject(errors, output.performance, "Analysis output performance");
  requireObject(errors, output.runMetadata, "Analysis output runMetadata");
  return errors;
}

function validateTaskOutput(task: ExternalExecutionTask, output: unknown) {
  switch (task) {
    case "readiness":
      return validateReadinessOutput(output);
    case "intake":
      return validateIntakeOutput(output);
    case "refresh-normalized":
      return validateRefreshNormalizedOutput(output);
    case "analysis":
      return validateAnalysisOutput(output);
  }
}

export function validateExternalExecutionResponse<TTask extends ExternalExecutionTask>(
  packet: ExternalExecutionPacket<TTask>,
  response: unknown
): ExternalExecutionResponseValidation<TTask> {
  const errors: string[] = [];

  if (!isRecord(response)) {
    return { valid: false, errors: ["External execution response must be an object."] };
  }

  if (response.contract !== "idea-analyzer.external-execution.response") {
    errors.push("Response contract must be idea-analyzer.external-execution.response.");
  }
  if (response.contractVersion !== EXTERNAL_EXECUTION_CONTRACT_VERSION) {
    errors.push(`Response contractVersion must be ${EXTERNAL_EXECUTION_CONTRACT_VERSION}.`);
  }
  if (response.packetId !== packet.packetId) {
    errors.push("Response packetId must match the packet being answered.");
  }
  if (response.runId !== packet.runId) {
    errors.push("Response runId must match the packet runId.");
  }
  if (response.task !== packet.task) {
    errors.push("Response task must match the packet task.");
  }
  if (!isIsoTimestamp(response.generatedAt)) {
    errors.push("Response generatedAt must be an ISO timestamp string.");
  }
  if (!sameJson(response.backend, packet.backend)) {
    errors.push("Response backend must match the packet backend metadata.");
  }

  errors.push(...validateTaskOutput(packet.task, response.output));

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], response: response as ExternalExecutionResponse<TTask> };
}
