import { promises as fs } from "fs";
import path from "path";
import type { AnalysisResponse, AnalyzeResponse } from "@/lib/analysis-types";
import { renderAnalyzeResponseMarkdown } from "@/lib/analysis-rendering";
import {
  buildExternalExecutionPacket,
  validateExternalExecutionResponse,
  type ExternalExecutionResponse,
} from "@/lib/external-execution";
import {
  FounderProfileError,
  readFounderProfileMarkdown as readFounderProfile,
} from "@/lib/founder-profile";
import { runIdeaAnalysis } from "@/lib/idea-analysis-run";
import { checkIdeaReadiness } from "@/lib/idea-readiness";
import { validateNormalizedIdeaMarkdown } from "@/lib/normalized-idea";
import {
  DEFAULT_ANALYSIS_MODE_ID,
  findAnalysisMode,
  isOllamaModel,
  type OllamaModel,
} from "@/lib/ollama-models";

export type FileIdeaAnalysisInput = {
  inputPath: string;
  founderProfilePath: string;
  analysisJsonPath: string;
  analysisMarkdownPath: string;
  readinessJsonPath?: string;
  runId?: string;
  runArtifactPaths?: {
    packetPath?: string;
    responsePath?: string;
    validationPath?: string;
    readinessPath?: string;
    debugPath?: string;
  };
  model?: OllamaModel;
  deepThinking?: boolean;
};

type FileIdeaAnalysisDependencies = {
  runIdeaAnalysis?: typeof runIdeaAnalysis;
};

export class FileIdeaAnalysisRunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileIdeaAnalysisRunError";
  }
}

async function readNormalizedMarkdown(inputPath: string) {
  try {
    const content = await fs.readFile(inputPath, "utf8");
    if (!content.trim()) {
      throw new FileIdeaAnalysisRunError(
        `Normalized markdown input is empty: ${inputPath}`
      );
    }

    const validation = validateNormalizedIdeaMarkdown(content);
    if (!validation.valid) {
      throw new FileIdeaAnalysisRunError(
        validation.errors.map((issue) => issue.message).join("; ")
      );
    }

    return content;
  } catch (error) {
    if (error instanceof FileIdeaAnalysisRunError) throw error;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      throw new FileIdeaAnalysisRunError(
        `Normalized markdown input not found: ${inputPath}`
      );
    }
    throw error;
  }
}

async function readFounderProfileMarkdown(founderProfilePath: string) {
  try {
    return await readFounderProfile(founderProfilePath);
  } catch (error) {
    if (error instanceof FounderProfileError && error.kind === "not_found") {
      throw new FileIdeaAnalysisRunError(
        `Founder Profile markdown not found: ${founderProfilePath}`
      );
    }
    if (error instanceof FounderProfileError && error.kind === "empty") {
      throw new FileIdeaAnalysisRunError(
        `Founder Profile markdown is empty: ${founderProfilePath}`
      );
    }
    throw error;
  }
}

function resolveAnalysisConfiguration(input: FileIdeaAnalysisInput) {
  const defaultMode = findAnalysisMode(DEFAULT_ANALYSIS_MODE_ID);
  const model = input.model ?? defaultMode.model;
  const deepThinking = input.deepThinking ?? defaultMode.deepThinking;

  if (!isOllamaModel(model)) {
    throw new FileIdeaAnalysisRunError(`Unsupported model for file analysis: ${model}`);
  }

  return { model, deepThinking };
}

async function writeCompletedArtifacts(files: { filePath: string; content: string }[]) {
  const temporaryPaths: string[] = [];
  const committedFinalPaths: string[] = [];
  const backups: { filePath: string; backupPath: string }[] = [];

  try {
    for (const file of files) {
      await fs.mkdir(path.dirname(file.filePath), { recursive: true });
      const temporaryPath = `${file.filePath}.tmp-${process.pid}-${Date.now()}-${temporaryPaths.length}`;
      temporaryPaths.push(temporaryPath);
      await fs.writeFile(temporaryPath, file.content, "utf8");
    }

    for (let index = 0; index < files.length; index += 1) {
      if (!(await fileExists(files[index].filePath))) continue;
      const existing = await fs.stat(files[index].filePath);
      if (!existing.isFile()) {
        throw new FileIdeaAnalysisRunError(
          `Artifact output path is not a file: ${files[index].filePath}`
        );
      }
      const backupPath = `${files[index].filePath}.backup-${process.pid}-${Date.now()}-${index}`;
      await fs.rename(files[index].filePath, backupPath);
      backups.push({ filePath: files[index].filePath, backupPath });
    }

    for (let index = 0; index < files.length; index += 1) {
      await fs.rename(temporaryPaths[index], files[index].filePath);
      committedFinalPaths.push(files[index].filePath);
    }

    await Promise.allSettled(backups.map(({ backupPath }) => fs.rm(backupPath, { force: true })));
  } catch (error) {
    await Promise.allSettled([
      ...temporaryPaths.map((temporaryPath) => fs.rm(temporaryPath, { force: true })),
      ...committedFinalPaths.map((filePath) => fs.rm(filePath, { force: true })),
    ]);
    for (const backup of backups.reverse()) {
      await fs.rename(backup.backupPath, backup.filePath);
    }
    throw error;
  }
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertCompletedAnalysis(response: AnalyzeResponse): asserts response is AnalysisResponse {
  if (response.status !== "analysis") {
    throw new FileIdeaAnalysisRunError(
      "File-based Idea analysis run requires a completed analysis; the normalized input still needs clarification."
    );
  }
}

export async function runFileIdeaAnalysis(
  input: FileIdeaAnalysisInput,
  dependencies: FileIdeaAnalysisDependencies = {}
) {
  const startedAt = new Date().toISOString();
  const idea = await readNormalizedMarkdown(input.inputPath);
  const readiness = checkIdeaReadiness(idea);
  if (!readiness.readyForFinalAnalysis) {
    const blockerSections = readiness.blockers
      .map((blocker) => blocker.section ?? blocker.code)
      .join(", ");
    throw new FileIdeaAnalysisRunError(
      `File-based Idea analysis cannot proceed because readiness blockers remain: ${blockerSections}.`
    );
  }
  const founderProfile = await readFounderProfileMarkdown(input.founderProfilePath);
  const { model, deepThinking } = resolveAnalysisConfiguration(input);
  const runId = input.runId ?? `file-analysis-${Date.now()}`;
  const backend = {
    kind: "local_model" as const,
    id: "ollama",
    model,
  };
  const packet = buildExternalExecutionPacket({
    task: "analysis",
    runId,
    backend,
    input: {
      normalizedIdeaMarkdown: idea,
      founderProfileMarkdown: founderProfile,
      readiness,
    },
    createdAt: startedAt,
  });
  const analyze = dependencies.runIdeaAnalysis ?? runIdeaAnalysis;
  const response = await analyze({ idea, founderProfile, model, deepThinking });

  assertCompletedAnalysis(response);

  const externalResponse: ExternalExecutionResponse<"analysis"> = {
    contract: "idea-analyzer.external-execution.response",
    contractVersion: packet.contractVersion,
    packetId: packet.packetId,
    runId,
    task: "analysis",
    backend,
    generatedAt: new Date().toISOString(),
    output: response,
  };
  const validation = validateExternalExecutionResponse(packet, externalResponse);
  if (!validation.valid) {
    throw new FileIdeaAnalysisRunError(
      `Completed analysis failed external response validation: ${validation.errors.join("; ")}`
    );
  }

  const json = `${JSON.stringify(response, null, 2)}\n`;
  const markdown = `${renderAnalyzeResponseMarkdown(response)}\n`;
  const jsonArtifact = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
  const files = [
    { filePath: input.analysisJsonPath, content: json },
    { filePath: input.analysisMarkdownPath, content: markdown },
  ];

  if (input.readinessJsonPath) {
    files.push({ filePath: input.readinessJsonPath, content: jsonArtifact(readiness) });
  }

  const runArtifacts = input.runArtifactPaths;
  if (runArtifacts?.packetPath) {
    files.push({ filePath: runArtifacts.packetPath, content: jsonArtifact(packet) });
  }
  if (runArtifacts?.responsePath) {
    files.push({ filePath: runArtifacts.responsePath, content: jsonArtifact(externalResponse) });
  }
  if (runArtifacts?.validationPath) {
    files.push({
      filePath: runArtifacts.validationPath,
      content: jsonArtifact({ valid: validation.valid, errors: validation.errors }),
    });
  }
  if (runArtifacts?.readinessPath) {
    files.push({ filePath: runArtifacts.readinessPath, content: jsonArtifact(readiness) });
  }
  if (runArtifacts?.debugPath) {
    files.push({
      filePath: runArtifacts.debugPath,
      content: jsonArtifact({
        runId,
        status: "completed",
        startedAt,
        finishedAt: new Date().toISOString(),
        model,
        deepThinking,
        inputPath: input.inputPath,
        founderProfilePath: input.founderProfilePath,
        analysisJsonPath: input.analysisJsonPath,
        analysisMarkdownPath: input.analysisMarkdownPath,
      }),
    });
  }

  await writeCompletedArtifacts(files);

  return {
    status: "written" as const,
    runId,
    inputPath: input.inputPath,
    analysisJsonPath: input.analysisJsonPath,
    analysisMarkdownPath: input.analysisMarkdownPath,
    readiness,
    response,
  };
}
