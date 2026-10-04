import { describe, expect, it } from "vitest";
import type { AnalysisResponse } from "@/lib/analysis-types";
import type { IdeaReadinessResult } from "@/lib/idea-readiness";
import {
  EXTERNAL_EXECUTION_CONTRACT_VERSION,
  buildExternalExecutionPacket,
  validateExternalExecutionResponse,
} from "@/lib/external-execution";

const normalizedIdeaMarkdown = `idea_analyzer_schema_version: 1

# One-Sentence Idea
A concierge service that turns messy sales call notes into follow-up emails for independent B2B consultants.

# Target Customer
Independent B2B consultants who sell high-ticket services and personally manage follow-up after discovery calls.

# Problem Or Desire
They lose momentum after promising follow-up because call notes are scattered and writing a specific recap takes too long.

# Proposed Solution
A lightweight workflow that ingests call notes and drafts personalized recap emails with next steps within ten minutes.

# Value Outcome
Consultants send better follow-up faster, recover more active opportunities, and reduce post-call admin time.

# Payer
Solo consultants or small consulting firms paying monthly for pipeline admin leverage.

# Current Alternative
Manual notes in docs, CRM tasks, generic AI chat prompts, or delaying follow-up until they have time.

# First Testable Version
Manually process ten real discovery call note sets for three consultants and measure time saved plus response rates.

# Evidence
Two consultants described follow-up admin as a weekly bottleneck and already paste notes into AI tools.

# Assumptions
- Consultants will share enough call context for useful drafts.
- Faster follow-up improves close rates enough to justify payment.

# Open Questions
- Which CRM or notes format should the first version support?
- Will consultants trust AI-generated follow-up without heavy editing?
`;

const backend = {
  kind: "external_model" as const,
  id: "hermes-codex",
  label: "Hermes/Codex",
  model: "gpt-5.5",
};

function validReadinessResult(): IdeaReadinessResult {
  return {
    contract: "idea-readiness",
    schemaVersion: 1,
    normalizedIdeaSchemaVersion: 1,
    generatedAt: "2026-06-28T12:00:00.000Z",
    readyForFinalAnalysis: true,
    blockers: [],
    warnings: [],
    suggestions: [],
  };
}

function validAnalysisResponse(): AnalysisResponse {
  const performance = {
    model: "gpt-5.5",
    requestStartedAt: "2026-06-28T12:00:00.000Z",
    requestFinishedAt: "2026-06-28T12:00:01.000Z",
    totalRequestMs: 1000,
    ollamaRequestMs: 0,
    ollamaTotalMs: null,
    ollamaGenerationMs: null,
    modelLoadMs: null,
    promptTokens: null,
    outputTokens: null,
    promptTokensPerSecond: null,
    outputTokensPerSecond: null,
    jsonParseMs: null,
  };
  const assessment = {
    score: 5,
    label: "Plausible but unproven",
    reason: "The idea is specific but evidence remains limited.",
    evidence: [],
    uncertainty: "Customer willingness to pay is not yet proven.",
  };

  return {
    status: "analysis",
    ideaSummary: "Concierge sales-call follow-up support for B2B consultants.",
    oneSentenceVerdict: "Specific enough to test manually before building software.",
    strongestVersion: "A done-for-you follow-up pack for solo consultants.",
    firstTestableVersion: "Run a paid manual pilot for three consultants.",
    targetCustomer: "Independent B2B consultants.",
    corePainOrDesire: "Follow-up admin slows down active opportunities.",
    founderFit: assessment,
    painOrDesire: assessment,
    mvpTestability: assessment,
    commercialPotential: assessment,
    scoreSummary: "Evidence is promising but early.",
    confidenceLevel: "medium",
    scoreImprovementRecommendations: [
      {
        scoreArea: "Commercial Potential",
        currentIssue: "Payment intent is unproven.",
        recommendation: "Offer a paid pilot.",
        whyItCouldImproveTheScore: "Payment would prove willingness to pay.",
        evidenceToCollect: "Three paid pilots.",
      },
    ],
    whatNotToBuildYet: ["A full CRM integration"],
    criticalRisksAndUnknowns: [
      {
        concern: "Will consultants pay for manual follow-up support?",
        decisionImpact: "Determines whether to proceed.",
        priority: "primary",
        addressedDuring: "validation_plan",
      },
      {
        concern: "Will quality remain high across call types?",
        decisionImpact: "Determines whether to invest in automation.",
        priority: "secondary",
        addressedDuring: "after_validation",
      },
    ],
    validationPlan: {
      testType: "7_day_payment_validation",
      testTypeLabel: "7-Day Payment Validation",
      addressesConcern: "Will consultants pay for manual follow-up support?",
      goal: "Test payment intent.",
      offerOrExperiment: "Offer a £50 manual follow-up pack.",
      steps: ["Identify prospects", "Make offer", "Collect payment", "Deliver pack"],
      decisionRule: "Proceed if three consultants pay within seven days.",
      constraints: ["Manual delivery only"],
      timeRequired: "7 days",
      costEstimate: "£0-£50",
    },
    afterValidation: {
      fulfilValidatedPromise: "Deliver the paid follow-up pack manually.",
      learnFromDelivery: ["Track editing effort", "Track customer satisfaction"],
      repeatedProofTarget: "Repeat payment with three additional consultants.",
      nextInvestmentIfProven: "Build only the smallest drafting workflow.",
      reviseOrStopIf: "Stop if payment does not repeat.",
    },
    recommendedStrategy: "test_manually_first",
    recommendedStrategyLabel: "Test manually first",
    strategyReason: "Manual delivery is enough to test the core risk.",
    performance,
    runMetadata: {
      analysisVersion: "analysis-v1",
      codeVersion: "abc123",
      model: "gpt-5.5",
      deepThinking: false,
      temperature: 0,
      seed: 42,
    },
  };
}

describe("external execution packet contracts", () => {
  it("builds traceable packets for all externally executable task types", () => {
    const packet = buildExternalExecutionPacket({
      task: "analysis",
      runId: "run-123",
      backend,
      input: {
        normalizedIdeaMarkdown,
        founderProfileMarkdown: "Founder has direct access to three consultants.",
        readiness: validReadinessResult(),
      },
    });

    expect(packet).toMatchObject({
      contract: "idea-analyzer.external-execution.packet",
      contractVersion: EXTERNAL_EXECUTION_CONTRACT_VERSION,
      task: "analysis",
      runId: "run-123",
      backend,
      protocol: {
        normalizedIdeaSchemaVersion: 1,
        readinessSchemaVersion: 1,
        intakeSchemaVersion: 1,
        refreshNormalizedSchemaVersion: 1,
        analysisResponseSchemaVersion: 1,
      },
    });
    expect(packet.packetId).toMatch(/^run-123:analysis:/);
    expect(packet.createdAt).toEqual(expect.any(String));
    expect(packet.prompt.system).toMatch(/Idea Analyzer-defined protocol/i);
    expect(packet.prompt.user).toContain("Founder Profile");
    expect(packet.expectedResponse.contract).toBe("idea-analyzer.external-execution.response");
  });

  it("validates successful external responses for all task-specific output contracts", () => {
    const readiness = validReadinessResult();
    const cases = [
      {
        task: "readiness" as const,
        input: { normalizedIdeaMarkdown },
        output: readiness,
      },
      {
        task: "intake" as const,
        input: {
          normalizedIdeaMarkdown,
          sourceMaterial: "Source note",
          answers: { payer: "Consultants pay monthly." },
        },
        output: {
          contract: "idea-intake" as const,
          schemaVersion: 1 as const,
          normalizedIdeaSchemaVersion: 1 as const,
          generatedAt: "2026-06-28T12:00:00.000Z",
          readiness,
          questions: [],
          proposedUpdates: [],
        },
      },
      {
        task: "refresh-normalized" as const,
        input: {
          existingNormalizedIdeaMarkdown: normalizedIdeaMarkdown,
          updatedSourceMaterial: "Evidence: one consultant offered to pay.",
        },
        output: {
          contract: "refresh-normalized" as const,
          schemaVersion: 1 as const,
          normalizedIdeaSchemaVersion: 1 as const,
          generatedAt: "2026-06-28T12:00:00.000Z",
          readiness,
          proposedUpdates: [],
          warnings: [],
          questions: [],
        },
      },
      {
        task: "analysis" as const,
        input: {
          normalizedIdeaMarkdown,
          founderProfileMarkdown: "Founder profile",
          readiness,
        },
        output: validAnalysisResponse(),
      },
    ];

    for (const { task, input, output } of cases) {
      const packet = buildExternalExecutionPacket({ task, runId: `run-${task}`, backend, input });

      const validated = validateExternalExecutionResponse(packet, {
        contract: "idea-analyzer.external-execution.response",
        contractVersion: EXTERNAL_EXECUTION_CONTRACT_VERSION,
        packetId: packet.packetId,
        runId: packet.runId,
        task,
        backend,
        generatedAt: "2026-06-28T12:01:00.000Z",
        output,
      });

      expect(validated.valid).toBe(true);
      expect(validated.errors).toEqual([]);
      expect(validated.response?.output).toEqual(output);
    }
  });

  it("rejects malformed external responses with clear validation errors", () => {
    const packet = buildExternalExecutionPacket({
      task: "readiness",
      runId: "run-bad",
      backend,
      input: { normalizedIdeaMarkdown },
    });

    const validated = validateExternalExecutionResponse(packet, {
      contract: "idea-analyzer.external-execution.response",
      contractVersion: EXTERNAL_EXECUTION_CONTRACT_VERSION,
      packetId: "wrong-packet",
      runId: packet.runId,
      task: "readiness",
      backend: { ...backend, id: "different-backend" },
      generatedAt: "not-a-date",
      output: { contract: "idea-readiness", readyForFinalAnalysis: true },
    });

    expect(validated.valid).toBe(false);
    expect(validated.errors).toEqual(
      expect.arrayContaining([
        "Response packetId must match the packet being answered.",
        "Response generatedAt must be an ISO timestamp string.",
        "Response backend must match the packet backend metadata.",
        "Readiness output schemaVersion must be 1.",
        "Readiness output blockers must be an array.",
      ])
    );
  });

  it("rejects incomplete analysis outputs instead of silently accepting partial model JSON", () => {
    const packet = buildExternalExecutionPacket({
      task: "analysis",
      runId: "run-analysis-bad",
      backend,
      input: {
        normalizedIdeaMarkdown,
        founderProfileMarkdown: "Founder profile",
        readiness: validReadinessResult(),
      },
    });

    const validated = validateExternalExecutionResponse(packet, {
      contract: "idea-analyzer.external-execution.response",
      contractVersion: EXTERNAL_EXECUTION_CONTRACT_VERSION,
      packetId: packet.packetId,
      runId: packet.runId,
      task: "analysis",
      backend,
      generatedAt: "2026-06-28T12:01:00.000Z",
      output: { status: "analysis", ideaSummary: "Only a partial response" },
    });

    expect(validated.valid).toBe(false);
    expect(validated.errors).toEqual(
      expect.arrayContaining([
        "Analysis output oneSentenceVerdict must be a non-empty string.",
        "Analysis output founderFit must be an object.",
        "Analysis output validationPlan must be an object.",
        "Analysis output runMetadata must be an object.",
      ])
    );
  });
});
