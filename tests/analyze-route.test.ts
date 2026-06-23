import { describe, expect, it } from "vitest";
import type { AnalysisResponse, ClarificationResponse } from "@/lib/analysis-types";
import { createAnalyzePostHandler } from "@/app/api/analyze/route";

function performance() {
  return {
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
  };
}

function runMetadata() {
  return {
    analysisVersion: "analysis-v1",
    codeVersion: "abc123",
    model: "qwen3:8b",
    deepThinking: false,
    temperature: 0,
    seed: 42,
  };
}

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
    performance: performance(),
    runMetadata: runMetadata(),
  };
}

function clarificationResponse(): ClarificationResponse {
  return {
    status: "needs_clarification",
    reason: "The target customer is unclear.",
    missingFields: ["targetCustomer"],
    clarifyingQuestions: ["Who has this problem?"],
    possibleDirections: ["A landlord service"],
    performance: performance(),
    runMetadata: runMetadata(),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("website analyze API", () => {
  it("calls the shared Idea analysis run core and returns the canonical analysis contract", async () => {
    const calls: unknown[] = [];
    const response = analysisResponse();
    const POST = createAnalyzePostHandler({
      runIdeaAnalysis: async (input) => {
        calls.push(input);
        return response;
      },
    });

    const result = await POST(jsonRequest({
      idea: "  A reporting service for small landlords.  ",
      model: "qwen3:8b",
      deepThinking: false,
    }));
    const data = await result.json();

    expect(result.status).toBe(200);
    expect(calls).toEqual([
      {
        idea: "A reporting service for small landlords.",
        model: "qwen3:8b",
        deepThinking: false,
      },
    ]);
    expect(data).toMatchObject({
      status: "analysis",
      founderFit: { label: "Plausible but unproven" },
      painOrDesire: { label: "Plausible but unproven" },
      mvpTestability: { label: "Plausible but unproven" },
      commercialPotential: { label: "Plausible but unproven" },
      criticalRisksAndUnknowns: [{ concern: "Will landlords pay for the report?" }],
      validationPlan: { offerOrExperiment: "Ask five landlords to pay GBP 100 for one report." },
      afterValidation: { repeatedProofTarget: "Sell the same report to three more landlords." },
      recommendedStrategyLabel: "Test manually first",
      runMetadata: { analysisVersion: "analysis-v1", codeVersion: "abc123" },
    });
  });

  it("preserves clarification responses from the shared core", async () => {
    const POST = createAnalyzePostHandler({
      runIdeaAnalysis: async () => clarificationResponse(),
    });

    const result = await POST(jsonRequest({
      idea: "landlord thing",
      model: "qwen3:8b",
      deepThinking: false,
    }));
    const data = await result.json();

    expect(result.status).toBe(200);
    expect(data).toMatchObject({
      status: "needs_clarification",
      reason: "The target customer is unclear.",
      missingFields: ["targetCustomer"],
      clarifyingQuestions: ["Who has this problem?"],
      possibleDirections: ["A landlord service"],
    });
  });
});
