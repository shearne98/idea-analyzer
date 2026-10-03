import os from "os";
import { describe, expect, it } from "vitest";

describe("Idea Analyzer code version", () => {
  it("resolves from the package root instead of the launch directory", async () => {
    const originalCwd = process.cwd();
    process.chdir(os.tmpdir());

    try {
      const { createIdeaAnalysisRunner } = await import("@/lib/idea-analysis-run");
      const runIdeaAnalysis = createIdeaAnalysisRunner({
        callModel: async () => ({
          assistantText: JSON.stringify({
            status: "needs_clarification",
            reason: "The idea needs more context.",
            missingFields: ["targetCustomer"],
            clarifyingQuestions: ["Who is the target customer?"],
            possibleDirections: [],
          }),
          metrics: {},
        }),
      });

      const result = await runIdeaAnalysis({
        idea: "reporting service",
        founderProfile: "Experienced operator",
        model: "qwen3:8b",
        deepThinking: false,
      });

      expect(result.runMetadata.codeVersion).toMatch(/^[0-9a-f]{7}(?:-[0-9a-f]{8})?$/);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
