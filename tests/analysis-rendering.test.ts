import { describe, expect, it } from "vitest";
import type { AnalysisResponse, ClarificationResponse } from "@/lib/analysis-types";
import {
  buildAnalysisViewModel,
  formatList,
  hasDisplayContent,
  renderAnalyzeResponseMarkdown,
} from "@/lib/analysis-rendering";

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
    ideaSummary: "A concierge reporting service for small landlords.",
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
    whatNotToBuildYet: ["A tenant portal", "Automated dashboards"],
    criticalRisksAndUnknowns: [
      {
        concern: "Will landlords pay for the report?",
        decisionImpact: "Determines whether to proceed beyond validation.",
        priority: "primary",
        addressedDuring: "validation_plan",
      },
      {
        concern: "Will the work repeat across more landlords?",
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
    performance: performance(),
    runMetadata: runMetadata(),
  };
}

describe("analysis rendering boundaries", () => {
  it("renders a completed canonical analysis response as markdown for non-browser workflows", () => {
    const markdown = renderAnalyzeResponseMarkdown(analysisResponse());

    expect(markdown).toContain("# Idea Analysis");
    expect(markdown).toContain("## Recommended Direction");
    expect(markdown).toContain("Validate payment before building software.");
    expect(markdown).toContain("## Critical Risks & Unknowns");
    expect(markdown).toContain("Primary concern: Will landlords pay for the report?");
    expect(markdown).toContain("## Validation Plan");
    expect(markdown).toContain("Addresses: Will landlords pay for the report?");
    expect(markdown).toContain("## After Validation");
    expect(markdown).not.toContain("[object Object]");
  });

  it("renders clarification responses as markdown without requiring website state", () => {
    const response: ClarificationResponse = {
      status: "needs_clarification",
      reason: "The target customer is unclear.",
      missingFields: ["targetCustomer", "problemOrDesire"],
      clarifyingQuestions: ["Who has this problem?", "How painful is it?"],
      possibleDirections: ["A landlord service"],
      performance: performance(),
      runMetadata: runMetadata(),
    };

    const markdown = renderAnalyzeResponseMarkdown(response);

    expect(markdown).toContain("# Idea Intake");
    expect(markdown).toContain("The target customer is unclear.");
    expect(markdown).toContain("- Target customer");
    expect(markdown).toContain("1. Who has this problem?");
    expect(markdown).toContain("- A landlord service");
  });

  it("builds website view data from the canonical response contract", () => {
    const viewModel = buildAnalysisViewModel(analysisResponse());

    expect(viewModel.strategyStyle).toContain("amber");
    expect(viewModel.scoreCards.map((card) => card.title)).toEqual([
      "Founder Fit",
      "Pain / Desire",
      "MVP Testability",
      "Commercial Potential",
    ]);
    expect(viewModel.criticalConcerns[0]).toMatchObject({
      concern: "Will landlords pay for the report?",
      priorityLabel: "Primary concern",
      stageLabel: "Validation Plan",
    });
  });

  it("keeps display formatting reusable outside React components", () => {
    expect(formatList("first\nsecond")).toEqual(["first", "second"]);
    expect(hasDisplayContent(["item"])).toBe(true);
    expect(hasDisplayContent("   ")).toBe(false);
  });
});
