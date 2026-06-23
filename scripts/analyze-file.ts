#!/usr/bin/env tsx
import { runFileIdeaAnalysis } from "@/lib/file-analysis-run";
import { findAnalysisMode, isAnalysisModeId, isOllamaModel } from "@/lib/ollama-models";

type CliOptions = {
  inputPath?: string;
  analysisJsonPath?: string;
  analysisMarkdownPath?: string;
  mode?: string;
  model?: string;
  deepThinking?: boolean;
};

function usage() {
  return `Usage: npm run analyze:file -- --input <normalized.md> --analysis-json <analysis.json> --analysis-md <analysis.md> [--mode balanced] [--model qwen3:8b] [--deep-thinking true|false]

Runs the shared Idea analysis run core for a normalized markdown file and writes canonical JSON plus rendered markdown to explicit output paths.`;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

function parseBoolean(value: string, flag: string) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${flag} must be true or false.`);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--input":
        options.inputPath = readValue(args, index, arg);
        index += 1;
        break;
      case "--analysis-json":
        options.analysisJsonPath = readValue(args, index, arg);
        index += 1;
        break;
      case "--analysis-md":
        options.analysisMarkdownPath = readValue(args, index, arg);
        index += 1;
        break;
      case "--mode":
        options.mode = readValue(args, index, arg);
        index += 1;
        break;
      case "--model":
        options.model = readValue(args, index, arg);
        index += 1;
        break;
      case "--deep-thinking":
        options.deepThinking = parseBoolean(readValue(args, index, arg), arg);
        index += 1;
        break;
      case "--help":
      case "-h":
        console.log(usage());
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireOption(value: string | undefined, flag: string) {
  if (!value) throw new Error(`Missing required ${flag}.`);
  return value;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mode = options.mode && isAnalysisModeId(options.mode) ? findAnalysisMode(options.mode) : undefined;

  if (options.mode && !mode) {
    throw new Error(`Unsupported analysis mode: ${options.mode}.`);
  }
  if (options.model && !isOllamaModel(options.model)) {
    throw new Error(`Unsupported model: ${options.model}.`);
  }

  const model = options.model && isOllamaModel(options.model) ? options.model : mode?.model;

  const result = await runFileIdeaAnalysis({
    inputPath: requireOption(options.inputPath, "--input"),
    analysisJsonPath: requireOption(options.analysisJsonPath, "--analysis-json"),
    analysisMarkdownPath: requireOption(options.analysisMarkdownPath, "--analysis-md"),
    model,
    deepThinking: options.deepThinking ?? mode?.deepThinking,
  });

  console.log(`Wrote ${result.analysisJsonPath}`);
  console.log(`Wrote ${result.analysisMarkdownPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
