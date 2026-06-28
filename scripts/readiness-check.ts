#!/usr/bin/env tsx
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { checkIdeaReadiness } from "@/lib/idea-readiness";

type CliOptions = {
  inputPath?: string;
  outputPath?: string;
};

function usage() {
  return `Usage: npm run readiness:check -- --input <normalized.md> --output <readiness.json>

Evaluates only normalized idea markdown and writes a readiness.json-compatible result with blockers, warnings, suggestions, and readyForFinalAnalysis.`;
}

function readValue(args: string[], index: number, flag: string) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
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
      case "--output":
        options.outputPath = readValue(args, index, arg);
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
  const inputPath = requireOption(options.inputPath, "--input");
  const outputPath = requireOption(options.outputPath, "--output");
  const normalizedMarkdown = await readFile(inputPath, "utf8");
  const result = checkIdeaReadiness(normalizedMarkdown);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  console.log(`Wrote ${outputPath}`);
  console.log(
    `Ready for final analysis: ${result.readyForFinalAnalysis ? "yes" : "no"} (${result.blockers.length} blockers, ${result.warnings.length} warnings, ${result.suggestions.length} suggestions)`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
