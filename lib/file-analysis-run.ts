import { promises as fs } from "fs";
import path from "path";
import type { AnalysisResponse, AnalyzeResponse } from "@/lib/analysis-types";
import { renderAnalyzeResponseMarkdown } from "@/lib/analysis-rendering";
import { runIdeaAnalysis } from "@/lib/idea-analysis-run";
import {
  DEFAULT_ANALYSIS_MODE_ID,
  findAnalysisMode,
  isOllamaModel,
  type OllamaModel,
} from "@/lib/ollama-models";

export type FileIdeaAnalysisInput = {
  inputPath: string;
  analysisJsonPath: string;
  analysisMarkdownPath: string;
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
  const createdFinalPaths: string[] = [];

  try {
    for (const file of files) {
      await fs.mkdir(path.dirname(file.filePath), { recursive: true });
      const temporaryPath = `${file.filePath}.tmp-${process.pid}-${Date.now()}-${temporaryPaths.length}`;
      temporaryPaths.push(temporaryPath);
      await fs.writeFile(temporaryPath, file.content, "utf8");
    }

    for (let index = 0; index < files.length; index += 1) {
      const finalExisted = await fileExists(files[index].filePath);
      await fs.rename(temporaryPaths[index], files[index].filePath);
      if (!finalExisted) createdFinalPaths.push(files[index].filePath);
    }
  } catch (error) {
    await Promise.all([
      ...temporaryPaths.map((temporaryPath) => fs.rm(temporaryPath, { force: true })),
      ...createdFinalPaths.map((filePath) => fs.rm(filePath, { force: true })),
    ]);
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
  const idea = await readNormalizedMarkdown(input.inputPath);
  const { model, deepThinking } = resolveAnalysisConfiguration(input);
  const analyze = dependencies.runIdeaAnalysis ?? runIdeaAnalysis;
  const response = await analyze({ idea, model, deepThinking });

  assertCompletedAnalysis(response);

  const json = `${JSON.stringify(response, null, 2)}\n`;
  const markdown = `${renderAnalyzeResponseMarkdown(response)}\n`;

  await writeCompletedArtifacts([
    { filePath: input.analysisJsonPath, content: json },
    { filePath: input.analysisMarkdownPath, content: markdown },
  ]);

  return {
    status: "written" as const,
    inputPath: input.inputPath,
    analysisJsonPath: input.analysisJsonPath,
    analysisMarkdownPath: input.analysisMarkdownPath,
    response,
  };
}
