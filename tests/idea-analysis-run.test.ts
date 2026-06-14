import { describe, expect, it, vi } from "vitest";
import {
  createIdeaAnalysisRunner,
  IdeaAnalysisRunError,
  type ModelCallMetrics,
  type ModelCallResult,
} from "@/lib/idea-analysis-run";

function createRunnerWithResponses(responses: ModelCallResult[], founderProfile = "") {
  const calls: { messages: { role: string; content: string }[] }[] = [];
  const runIdeaAnalysis = createIdeaAnalysisRunner({
    readFounderProfile: async () => founderProfile,
    callModel: async (_model, messages) => {
      calls.push({ messages });
      const response = responses.shift();
      if (!response) throw new Error("Unexpected model call.");
      return response;
    },
  });

  return { runIdeaAnalysis, calls };
}

function modelJson(value: unknown, metrics: Partial<ModelCallMetrics> = {}): ModelCallResult {
  return { assistantText: JSON.stringify(value), metrics };
}

function readyIntake() {
  return modelJson({
    status: "ready",
    reason: "The idea has enough context.",
    missingFields: [],
    clarifyingQuestions: [],
    possibleDirections: [],
  });
}

function completeAnalysisValue(overrides: Record<string, unknown> = {}) {
  const score = {
    score: 5,
    reason: "Plausible but unproven.",
    evidence: ["The idea describes a specific manual test."],
    uncertainty: "Real-world behavior is unknown.",
  };

  return {
    ideaSummary: "A testable business idea",
    oneSentenceVerdict: "Run the smallest useful validation test.",
    strongestVersion: "A focused service for a specific customer.",
    firstTestableVersion: "Deliver the outcome manually.",
    targetCustomer: "A specific target customer",
    corePainOrDesire: "A costly recurring problem",
    founderFit: score,
    painOrDesire: score,
    mvpTestability: score,
    commercialPotential: score,
    scoreSummary: "Plausible but unproven.",
    confidenceLevel: "medium",
    scoreImprovementRecommendations: [],
    mostDangerousAssumption: "Customers will commit.",
    whyThisMightFail: ["The problem may not be urgent."],
    whatNotToBuildYet: ["A full software platform"],
    paymentValidation: {
      goal: "Test commitment.",
      offer: "A manually delivered service for GBP 100.",
      steps: ["Approach five buyers", "Ask for payment", "Deliver manually", "Review results"],
      decisionRule: "Progress after one buyer pays GBP 100 within 7 days.",
      constraints: [],
      timeRequired: "7 days",
      costEstimate: "GBP 0-50",
    },
    afterFirstPayment: {
      deliverManually: "Deliver manually.",
      learnFromCustomers: "Observe what creates value.",
      repeatBeforeScaling: "Repeat the sale.",
    },
    keyUnknowns: [
      {
        unknown: "Who pays first?",
        howToResolve: "Track responses to the paid offer.",
      },
    ],
    recommendedStrategy: "test_manually_first",
    strategyReason: "Manual testing is possible.",
    ...overrides,
  };
}

function completeAnalysis(overrides: Record<string, unknown> = {}) {
  return modelJson(completeAnalysisValue(overrides));
}

describe("Idea analysis run", () => {
  it("asks for clarification instead of scoring a vague idea", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      modelJson({
          status: "needs_clarification",
          reason: "The idea does not identify a customer, problem, or solution.",
          missingFields: ["targetCustomer", "problemOrDesire", "proposedSolution"],
          clarifyingQuestions: [
            "Who specifically has this problem?",
            "What problem are they experiencing?",
            "What solution are you imagining?",
          ],
          possibleDirections: ["Pet waste collection", "Municipal sewage processing"],
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "poop recycling",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("needs_clarification");
    expect(result).not.toHaveProperty("founderFit");
    expect(result).not.toHaveProperty("paymentValidation");
  });

  it("expands a weak clarification response into a focused minimum interview", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      modelJson({
        status: "needs_clarification",
        reason: "The core customer and solution are unclear.",
        missingFields: ["targetCustomer", "proposedSolution"],
        clarifyingQuestions: ["Who is this for?"],
        possibleDirections: ["A consumer service"],
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "climate app",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status !== "needs_clarification") throw new Error("Expected clarification response.");
    expect(result.clarifyingQuestions).toHaveLength(3);
    expect(result.clarifyingQuestions[0]).toBe("Who is this for?");
  });

  it("filters, prioritizes, and limits hostile clarification output", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      modelJson({
        status: "needs_clarification",
        reason: "Important context is missing.",
        missingFields: [
          "inventedField",
          "payer",
          "proposedSolution",
          "targetCustomer",
          "targetCustomer",
          "mvpAng",
          "valueOutcome",
          "problemOrDesire",
          "currentAlternative",
          "mvpAngle",
        ],
        clarifyingQuestions: [
          "Question 1?",
          "Question 2?",
          "Question 3?",
          "Question 4?",
          "Question 5?",
          "Question 6?",
          "Question 7?",
        ],
        possibleDirections: [
          "Direction 1",
          "Direction 2",
          "Direction 3",
          "Direction 4",
          "Direction 5",
        ],
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A service concept for teams that has some detail but no defined user, problem, or solution",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("needs_clarification");
    if (result.status !== "needs_clarification") throw new Error("Expected clarification response.");
    expect(result.missingFields).toEqual([
      "targetCustomer",
      "problemOrDesire",
      "proposedSolution",
      "valueOutcome",
      "payer",
    ]);
    expect(result.clarifyingQuestions).toHaveLength(6);
    expect(result.possibleDirections).toHaveLength(4);
  });

  it("overrides an incorrect ready decision for a phrase-only idea", async () => {
    const { runIdeaAnalysis, calls } = createRunnerWithResponses([
      modelJson({
        status: "ready",
        reason: "Ready to analyze.",
        missingFields: [],
        clarifyingQuestions: [],
        possibleDirections: [],
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "AI for sports",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("needs_clarification");
    expect(calls).toHaveLength(1);
  });

  it("produces a founder-aware basketball analysis with payment validation", async () => {
    const { runIdeaAnalysis, calls } = createRunnerWithResponses(
      [
        modelJson({
          status: "ready",
          reason: "The idea names its users, problem, solution, and manual MVP.",
          missingFields: [],
          clarifyingQuestions: [],
          possibleDirections: [],
        }),
        modelJson({
          ideaSummary: "Manual basketball recording and highlight service",
          oneSentenceVerdict: "Test whether players will pay for manually produced highlights.",
          strongestVersion: "A paid highlight service for serious amateur players.",
          firstTestableVersion: "Record one game and manually deliver paid highlight packs.",
          targetCustomer: "Serious amateur basketball players",
          corePainOrDesire: "Players want footage they can watch and share.",
          founderFit: {
            score: 7.4,
            reason: "The founder can access local basketball players.",
            evidence: ["The founder organizes a weekly basketball run."],
            uncertainty: "Video editing ability is unproven.",
          },
          painOrDesire: {
            score: 12,
            reason: "Players value shareable footage.",
            evidence: ["Players currently ask friends to record games."],
            uncertainty: "Payment behavior is unknown.",
          },
          mvpTestability: {
            score: 7,
            reason: "One game can be delivered manually.",
            evidence: ["The MVP explicitly uses a phone and manual clips."],
            uncertainty: "Manual editing time is unknown.",
          },
          commercialPotential: {
            score: 5,
            reason: "Several possible buyers are named.",
            evidence: ["Players and organizers are potential payers."],
            uncertainty: "No payment evidence exists.",
          },
          scoreSummary: "Promising and testable, but payment remains unproven.",
          confidenceLevel: "medium",
          scoreImprovementRecommendations: [],
          mostDangerousAssumption: "Players will pay for clips.",
          whyThisMightFail: ["Manual editing may take too long."],
          whatNotToBuildYet: ["AI player tracking"],
          paymentValidation: {
            goal: "Test whether players will pay for highlights.",
            offer: "Three clips from one game for GBP 5.",
            steps: ["Record one game", "Offer paid highlight packs", "Deliver manually"],
            decisionRule: "Progress after at least two players pay GBP 5 within 7 days.",
            constraints: ["Manual delivery must take under three hours per game."],
            timeRequired: "7 days",
            costEstimate: "GBP 0-20",
          },
          afterFirstPayment: {
            deliverManually: "Edit and send the clips manually.",
            learnFromCustomers: "Ask which clips mattered and what confused them.",
            repeatBeforeScaling: "Sell the same offer at two more games.",
          },
          keyUnknowns: [
            {
              unknown: "Which player segment pays?",
              howToResolve: "Track who accepts the paid offer.",
            },
          ],
          recommendedStrategy: "test_manually_first",
          strategyReason: "Payment is unproven and manual delivery is possible.",
        }),
      ],
      "The founder organizes a weekly basketball run."
    );

    const result = await runIdeaAnalysis({
      idea: "A detailed amateur basketball recording and highlights platform idea.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.founderFit.score).toBe(7);
    expect(result.painOrDesire.score).toBe(10);
    expect(result.paymentValidation.decisionRule).toMatch(/two players pay GBP 5/i);
    expect(result.runMetadata.model).toBe("qwen3:8b");
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain(
      "The founder organizes a weekly basketball run."
    );
  });

  it("marks Founder Fit unavailable when no founder profile exists", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        founderFit: {
          score: 9,
          reason: "The founder appears highly capable.",
          evidence: ["The founder has deep industry experience."],
          uncertainty: "None.",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea with a target customer, problem, solution, and manual test.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.founderFit.score).toBeNull();
    expect(result.founderFit.label).toBe("Not available");
    expect(result.founderFit.evidence).toEqual([]);
    expect(result.founderFit.uncertainty).toMatch(/founder profile/i);
  });

  it("normalizes malformed score objects into complete conservative assessments", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        painOrDesire: {
          score: "not-a-number",
          reason: "",
          evidence: " ",
          uncertainty: "",
        },
        mvpTestability: null,
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea with no real-world evidence yet.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.painOrDesire).toMatchObject({
      score: 1,
      label: "Very weak",
      evidence: [],
    });
    expect(result.painOrDesire.reason).toBeTruthy();
    expect(result.painOrDesire.uncertainty).toBeTruthy();
    expect(result.mvpTestability).toMatchObject({
      score: 1,
      label: "Very weak",
      evidence: [],
    });
  });

  it("downgrades unsupported high confidence", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        confidenceLevel: "high",
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea that describes a manual test but contains no customer data or payment proof.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.confidenceLevel).toBe("medium");
  });

  it("preserves high confidence when strong real-world proof is provided", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        confidenceLevel: "high",
        commercialPotential: {
          score: 8,
          reason: "Five customers have already paid.",
          evidence: ["Five existing customers paid GBP 100 for the manual service."],
          uncertainty: "Retention is not yet known.",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea with five existing paying customers.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.confidenceLevel).toBe("high");
  });

  it("uses founder-profile context without exposing its source text", async () => {
    const privateProfile = "PRIVATE_FOUNDER_PROFILE_SECRET: organizes a specialist weekly meetup.";
    const performanceLog = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { runIdeaAnalysis, calls } = createRunnerWithResponses(
      [
        readyIntake(),
        completeAnalysis({
          founderFit: {
            score: 7,
            reason: privateProfile,
            evidence: [privateProfile],
            uncertainty: "Customer access outside the meetup is unknown.",
          },
        }),
      ],
      privateProfile
    );

    const result = await runIdeaAnalysis({
      idea: "A detailed idea related to the founder's specialist meetup.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(calls[1].messages.at(-1)?.content).toContain(privateProfile);
    expect(JSON.stringify(result)).not.toContain(privateProfile);
    expect(performanceLog.mock.calls.flat().join(" ")).not.toContain(privateProfile);
    performanceLog.mockRestore();
  });

  it("removes strong proof claims that are not grounded in supplied context", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        confidenceLevel: "high",
        commercialPotential: {
          score: 9,
          reason: "Customers are already paying.",
          evidence: ["Ten customers have already paid GBP 100."],
          uncertainty: "Retention is unknown.",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea with a proposed manual test but no customers or payment evidence yet.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.commercialPotential.evidence).toEqual([]);
    expect(result.confidenceLevel).toBe("medium");
  });

  it("does not recommend a software MVP when confidence and assessment scores are weak", async () => {
    const weakScore = {
      score: 3,
      reason: "Important assumptions remain unproven.",
      evidence: [],
      uncertainty: "Customer behavior is unknown.",
    };
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        confidenceLevel: "low",
        painOrDesire: weakScore,
        mvpTestability: weakScore,
        commercialPotential: weakScore,
        recommendedStrategy: "build_software_mvp",
        strategyReason: "Build the complete application.",
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed software idea with a named customer but no customer evidence or proof.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.recommendedStrategy).toBe("research_first");
    expect(result.recommendedStrategyLabel).toBe("Research first");
    expect(result.strategyReason).toMatch(/unknown|evidence|research/i);
  });

  it("supplies concrete scope guidance when the model omits it", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        strongestVersion: "",
        firstTestableVersion: "",
        smallestViableWedge: "",
        whatNotToBuildYet: [],
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed service idea with a named customer, problem, offer, and manual test.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.strongestVersion).toMatch(/plausible|focused/i);
    expect(result.firstTestableVersion).toContain(result.paymentValidation.offer);
    expect(result.whatNotToBuildYet).toEqual(
      expect.arrayContaining([expect.stringMatching(/full|beyond|premature/i)])
    );
  });

  it("reduces an unproven software MVP to a tiny prototype", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        confidenceLevel: "medium",
        firstTestableVersion: "Build a clickable scheduling prototype and test task completion.",
        recommendedStrategy: "build_software_mvp",
        strategyReason: "The full software product should be built.",
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed scheduling software idea with a clear workflow but no customer proof yet.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.recommendedStrategy).toBe("build_tiny_prototype");
    expect(result.recommendedStrategyLabel).toBe("Build a tiny prototype");
    expect(result.strategyReason).toMatch(/prototype|evidence|proof/i);
  });

  it("preserves a software MVP strategy when strong evidence justifies it", async () => {
    const strongScore = {
      score: 8,
      reason: "The paid manual service has demonstrated repeat demand.",
      evidence: ["Five existing customers paid and repeatedly used the manual service."],
      uncertainty: "Software retention is not yet known.",
    };
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        confidenceLevel: "high",
        painOrDesire: strongScore,
        mvpTestability: strongScore,
        commercialPotential: strongScore,
        firstTestableVersion: "Build the smallest self-service workflow used by existing customers.",
        recommendedStrategy: "build_software_mvp",
        strategyReason:
          "Existing paying customers repeatedly use the manual workflow, and software is needed to test self-service retention.",
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed workflow service with five existing paying customers and repeated manual use.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.recommendedStrategy).toBe("build_software_mvp");
    expect(result.recommendedStrategyLabel).toBe("Build a software MVP");
    expect(result.strategyReason).toMatch(/paying customers|software/i);
  });

  it("does not recommend clarification after completing the analysis", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        recommendedStrategy: "clarify_more",
        strategyReason: "Clarify the idea.",
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea with a target customer, problem, solution, and test.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.recommendedStrategy).toBe("research_first");
    expect(result.strategyReason).toMatch(/analysis|unknown|research/i);
  });

  it("preserves organizational buyer and commitment constraints for a B2B idea", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        targetCustomer: "Operations managers at small UK food manufacturers",
        paymentValidation: {
          goal: "Test whether a manufacturer will commit to a compliance audit.",
          offer: "A two-week compliance audit for GBP 150.",
          steps: ["Approach five manufacturers", "Ask for a paid pilot", "Deliver the audit"],
          decisionRule: "Progress after one manufacturer signs a paid pilot within 7 days.",
          constraints: [
            "The manufacturer must approve secure handling of compliance documents.",
            "Manual delivery must take less than eight hours.",
          ],
          timeRequired: "7 days",
          costEstimate: "GBP 0-30",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed managed compliance deadline service for small food manufacturers.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.targetCustomer).toContain("food manufacturers");
    expect(result.paymentValidation.decisionRule).toMatch(/paid pilot/i);
    expect(result.paymentValidation.constraints).toContain(
      "The manufacturer must approve secure handling of compliance documents."
    );
  });

  it("preserves an explicitly justified non-payment validation experiment", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        paymentValidation: {
          goal: "Test whether the core technical result is achievable before selling it.",
          offer: "Run the customer's anonymized sample through the manual process.",
          steps: ["Recruit three design partners", "Process one anonymized sample for each"],
          decisionRule: "Progress if at least two of three samples meet the agreed accuracy threshold.",
          constraints: ["Do not request payment until the technical feasibility threshold is met."],
          timeRequired: "7 days",
          costEstimate: "GBP 0-50",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A regulated technical service where feasibility must be proven before accepting payment.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.paymentValidation.decisionRule).toMatch(/two of three samples/i);
    expect(result.paymentValidation.decisionRule).not.toMatch(/pays|deposit|financial commitment/i);
  });

  it("reports malformed model JSON as a clear analysis failure", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      { assistantText: "This is not JSON.", metrics: {} },
    ]);

    await expect(
      runIdeaAnalysis({
        idea: "poop recycling",
        model: "qwen3:8b",
        deepThinking: false,
      })
    ).rejects.toMatchObject<IdeaAnalysisRunError>({
      kind: "analysis_failed",
      message: expect.stringContaining("did not contain valid JSON"),
    });
  });

  it("handles missing and zero-duration performance metrics safely", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      modelJson(completeAnalysisValue(), {
        promptEvalCount: 100,
        promptEvalDurationNs: 0,
        evalCount: 50,
        evalDurationNs: 0,
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea with enough context to analyze.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.performance.ollamaTotalMs).toBeNull();
    expect(result.performance.modelLoadMs).toBeNull();
    expect(result.performance.promptTokens).toBe(100);
    expect(result.performance.outputTokens).toBe(50);
    expect(result.performance.promptTokensPerSecond).toBeNull();
    expect(result.performance.outputTokensPerSecond).toBeNull();
  });
});
