import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
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

  it("migrates legacy saved outputs to the canonical response contract", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "idea-analyzer-runs-"));
    temporaryDirectories.push(directory);
    const run = savedRun();
    const legacyRun = {
      ...run,
      response: {
        ...run.response,
        status: "analysis",
        smallestViableWedge: "Deliver the service manually.",
        paymentValidation: {
          goal: "Test payment.",
          offer: "Sell one manual service for GBP 100.",
          steps: ["Approach buyers", "Ask for payment"],
          decisionRule: "Progress after one buyer pays GBP 100.",
          constraints: [],
          timeRequired: "7 days",
          costEstimate: "GBP 0",
        },
        questionsToAskUsers: ["Which buyer pays first?"],
        evidenceNeededBeforeBuilding: ["A real payment"],
        mostDangerousAssumption: "Target customers will pay for the manual service.",
        whyThisMightFail: ["The successful signal may not repeat with additional customers."],
        keyUnknowns: [
          {
            unknown: "Will buyers renew after the first delivery?",
            howToResolve: "Ask buyers whether they would renew.",
          },
        ],
        afterValidation: {
          deliverManually: "Deliver the service with existing tools.",
          learnFromCustomers: "Learn which outcome customers value most.",
          repeatBeforeScaling: "Repeat the sale with three additional customers.",
        },
      },
    };
    await writeFile(
      path.join(directory, `${run.id}.json`),
      `${JSON.stringify(legacyRun, null, 2)}\n`,
      "utf8"
    );

    const [migrated] = await createSavedAnalysisRunStore(directory).list();
    expect(migrated.response).toHaveProperty("firstTestableVersion", "Deliver the service manually.");
    expect(migrated.response).toHaveProperty("validationPlan.offerOrExperiment", "Sell one manual service for GBP 100.");
    expect(migrated.response).toHaveProperty(
      "validationPlan.addressesConcern",
      "Target customers will pay for the manual service."
    );
    expect(migrated.response).toHaveProperty("criticalRisksAndUnknowns");
    expect(migrated.response).toHaveProperty("criticalRisksAndUnknowns.0", {
      concern: "Target customers will pay for the manual service.",
      decisionImpact: "Determines whether the idea should progress beyond the Validation Plan.",
      priority: "primary",
      addressedDuring: "validation_plan",
    });
    expect(migrated.response).not.toHaveProperty("keyUnknowns");
    expect(migrated.response).not.toHaveProperty("mostDangerousAssumption");
    expect(migrated.response).not.toHaveProperty("whyThisMightFail");
    expect(migrated.response).toHaveProperty(
      "afterValidation.fulfilValidatedPromise",
      "Deliver the service with existing tools."
    );
    expect(migrated.response).toHaveProperty("afterValidation.learnFromDelivery");
    expect(migrated.response).toHaveProperty(
      "afterValidation.repeatedProofTarget",
      "Repeat the sale with three additional customers."
    );
    expect(migrated.response).toHaveProperty("afterValidation.nextInvestmentIfProven");
    expect(migrated.response).toHaveProperty("afterValidation.reviseOrStopIf");
    expect(migrated.response).not.toHaveProperty("afterValidation.deliverManually");
    expect(migrated.response).not.toHaveProperty("paymentValidation");
    expect(await readFile(path.join(directory, `${run.id}.json`), "utf8")).not.toMatch(
      /paymentValidation|smallestViableWedge|questionsToAskUsers|evidenceNeededBeforeBuilding|deliverManually|learnFromCustomers|repeatBeforeScaling|mostDangerousAssumption|whyThisMightFail|keyUnknowns|howToResolve/
    );
  });
});
