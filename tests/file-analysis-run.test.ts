import { mkdtemp, readFile, rm, stat, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import type { AnalysisResponse } from "@/lib/analysis-types";
import { runFileIdeaAnalysis } from "@/lib/file-analysis-run";

function analysisResponse(): AnalysisResponse {
  const assessment = {
    score: 5,
    label: "Plausible but unproven",
    reason: "Specific but still unvalidated.",
    evidence: [],
    uncertainty: "Whether buyers will pay.",
  };

  return {
    status: "analysis",
    ideaSummary: "A reporting service for small landlords.",
    oneSentenceVerdict: "Validate payment before building software.",
    strongestVersion: "A done-for-you reporting service for landlords.",
    firstTestableVersion: "Sell and deliver one report manually.",
    targetCustomer: "Small landlords",
    corePainOrDesire: "Avoiding late maintenance surprises",
    founderFit: assessment,
    painOrDesire: assessment,
    mvpTestability: assessment,
    commercialPotential: assessment,
    scoreSummary: "The idea is testable but unproven.",
    confidenceLevel: "medium",
    scoreImprovementRecommendations: [],
    whatNotToBuildYet: ["A tenant portal"],
    criticalRisksAndUnknowns: [
      {
        concern: "Will landlords pay for the report?",
        decisionImpact: "Determines whether to proceed beyond validation.",
        priority: "primary",
        addressedDuring: "validation_plan",
      },
      {
        concern: "Will the signal repeat?",
        decisionImpact: "Determines whether automation is justified.",
        priority: "secondary",
        addressedDuring: "after_validation",
      },
    ],
    validationPlan: {
      testType: "7_day_payment_validation",
      testTypeLabel: "7-Day Payment Validation",
      addressesConcern: "Will landlords pay for the report?",
      goal: "Test paid demand.",
      offerOrExperiment: "Ask five landlords to pay GBP 100 for one report.",
      steps: ["Write the offer", "Contact five landlords", "Collect payment", "Deliver manually"],
      decisionRule: "Proceed if one landlord pays GBP 100 within 7 days.",
      constraints: ["Manual delivery only"],
      timeRequired: "7 days",
      costEstimate: "GBP 0-50",
    },
    afterValidation: {
      fulfilValidatedPromise: "Create the report manually with existing tools.",
      learnFromDelivery: ["Which data matters most", "What takes longest to deliver"],
      repeatedProofTarget: "Sell the same report to three more landlords.",
      nextInvestmentIfProven: "Automate the slowest proven reporting step.",
      reviseOrStopIf: "No additional landlords pay for the same offer.",
    },
    recommendedStrategy: "test_manually_first",
    recommendedStrategyLabel: "Test manually first",
    strategyReason: "Payment can be tested without software.",
    performance: {
      model: "qwen3:8b",
      requestStartedAt: "2026-06-22T12:00:00.000Z",
      requestFinishedAt: "2026-06-22T12:00:01.000Z",
      totalRequestMs: 1000,
      ollamaRequestMs: 900,
      ollamaTotalMs: 850,
      ollamaGenerationMs: 700,
      modelLoadMs: 50,
      promptTokens: 100,
      outputTokens: 50,
      promptTokensPerSecond: 200,
      outputTokensPerSecond: 70,
      jsonParseMs: 1,
    },
    runMetadata: {
      analysisVersion: "analysis-v1",
      codeVersion: "abc123",
      model: "qwen3:8b",
      deepThinking: false,
      temperature: 0,
      seed: 42,
    },
  };
}

async function withTempDir<T>(callback: (directory: string) => Promise<T>) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "idea-analyzer-file-run-"));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("file-based Idea analysis run", () => {
  it("reads normalized markdown and writes canonical JSON plus rendered markdown", async () => {
    await withTempDir(async (directory) => {
      const inputPath = path.join(directory, "normalized.md");
      const analysisJsonPath = path.join(directory, "analysis.json");
      const analysisMarkdownPath = path.join(directory, "analysis.md");
      await writeFile(inputPath, "# Idea\n\nA reporting service for small landlords.", "utf8");

      await runFileIdeaAnalysis(
        { inputPath, analysisJsonPath, analysisMarkdownPath },
        { runIdeaAnalysis: async ({ idea, model, deepThinking }) => {
          expect(idea).toContain("A reporting service for small landlords.");
          expect(model).toBe("qwen3:8b");
          expect(deepThinking).toBe(false);
          return analysisResponse();
        } }
      );

      const json = JSON.parse(await readFile(analysisJsonPath, "utf8"));
      expect(json.status).toBe("analysis");
      expect(json.runMetadata.codeVersion).toBe("abc123");

      const markdown = await readFile(analysisMarkdownPath, "utf8");
      expect(markdown).toContain("# Idea Analysis");
      expect(markdown).toContain("## Validation Plan");
      expect(markdown).toContain("Ask five landlords to pay GBP 100");
    });
  });

  it("allows explicit model and thinking-mode configuration", async () => {
    await withTempDir(async (directory) => {
      const inputPath = path.join(directory, "normalized.md");
      await writeFile(inputPath, "Specific idea", "utf8");

      await runFileIdeaAnalysis(
        {
          inputPath,
          analysisJsonPath: path.join(directory, "analysis.json"),
          analysisMarkdownPath: path.join(directory, "analysis.md"),
          model: "deepseek-r1:8b",
          deepThinking: true,
        },
        { runIdeaAnalysis: async ({ model, deepThinking }) => {
          expect(model).toBe("deepseek-r1:8b");
          expect(deepThinking).toBe(true);
          return analysisResponse();
        } }
      );
    });
  });

  it("fails clearly when the input path is missing", async () => {
    await withTempDir(async (directory) => {
      await expect(
        runFileIdeaAnalysis(
          {
            inputPath: path.join(directory, "missing.md"),
            analysisJsonPath: path.join(directory, "analysis.json"),
            analysisMarkdownPath: path.join(directory, "analysis.md"),
          },
          { runIdeaAnalysis: async () => analysisResponse() }
        )
      ).rejects.toThrow(/normalized markdown input not found/i);
    });
  });

  it("does not write analysis artifacts when analysis fails or needs clarification", async () => {
    await withTempDir(async (directory) => {
      const inputPath = path.join(directory, "normalized.md");
      const analysisJsonPath = path.join(directory, "analysis.json");
      const analysisMarkdownPath = path.join(directory, "analysis.md");
      await writeFile(inputPath, "Too vague", "utf8");

      await expect(
        runFileIdeaAnalysis(
          { inputPath, analysisJsonPath, analysisMarkdownPath },
          {
            runIdeaAnalysis: async () => ({
              status: "needs_clarification",
              reason: "The idea is too vague.",
              missingFields: ["targetCustomer"],
              clarifyingQuestions: ["Who is this for?"],
              possibleDirections: [],
              performance: analysisResponse().performance,
              runMetadata: analysisResponse().runMetadata,
            }),
          }
        )
      ).rejects.toThrow(/completed analysis/i);

      expect(await exists(analysisJsonPath)).toBe(false);
      expect(await exists(analysisMarkdownPath)).toBe(false);
    });
  });

  it("does not write partial final artifacts when an output write fails", async () => {
    await withTempDir(async (directory) => {
      const inputPath = path.join(directory, "normalized.md");
      const analysisJsonPath = path.join(directory, "analysis.json");
      const blockedParentPath = path.join(directory, "blocked-parent");
      const analysisMarkdownPath = path.join(blockedParentPath, "analysis.md");
      await writeFile(inputPath, "Specific idea", "utf8");
      await writeFile(blockedParentPath, "not a directory", "utf8");

      await expect(
        runFileIdeaAnalysis(
          { inputPath, analysisJsonPath, analysisMarkdownPath },
          { runIdeaAnalysis: async () => analysisResponse() }
        )
      ).rejects.toThrow();

      expect(await exists(analysisJsonPath)).toBe(false);
      expect(await exists(analysisMarkdownPath)).toBe(false);
    });
  });
});
