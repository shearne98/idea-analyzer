import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createSavedAnalysisRunStore,
  isSavedAnalysisRun,
  type SavedAnalysisRun,
} from "@/lib/saved-analysis-runs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

function savedRun(): SavedAnalysisRun {
  return {
    id: "stable-run-1",
    savedAt: "2026-06-14T12:00:00.000Z",
    idea: "A detailed test idea",
    response: {
      status: "needs_clarification",
      reason: "More context is needed.",
      missingFields: ["targetCustomer"],
      clarifyingQuestions: ["Who is this for?"],
      possibleDirections: [],
      performance: {
        model: "qwen3:8b",
        requestStartedAt: "2026-06-14T11:59:59.000Z",
        requestFinishedAt: "2026-06-14T12:00:00.000Z",
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
        temperature: 0.1,
        seed: 42,
      },
    },
  };
}

describe("saved analysis run store", () => {
  it("persists, lists, and deletes complete analysis runs across store instances", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "idea-analyzer-runs-"));
    temporaryDirectories.push(directory);
    const firstStore = createSavedAnalysisRunStore(directory);
    const run = savedRun();

    await firstStore.save(run);

    const restartedStore = createSavedAnalysisRunStore(directory);
    expect(await restartedStore.list()).toEqual([run]);
    expect(await restartedStore.delete(run.id)).toBe(true);
    expect(await restartedStore.list()).toEqual([]);
  });

  it("rejects saved runs without complete comparison metadata", () => {
    const run = savedRun();
    const invalidRun = {
      ...run,
      response: {
        ...run.response,
        runMetadata: {
          model: "qwen3:8b",
        },
      },
    };

    expect(isSavedAnalysisRun(invalidRun)).toBe(false);
  });
});
