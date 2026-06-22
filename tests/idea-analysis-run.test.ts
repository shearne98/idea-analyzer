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
    validationPlan: {
      testType: "7_day_payment_validation",
      testTypeLabel: "7-Day Payment Validation",
      addressesConcern: "Will target customers pay for the offer?",
      goal: "Test commitment.",
      offerOrExperiment: "A manually delivered service for GBP 100.",
      steps: ["Approach five buyers", "Ask for payment", "Deliver manually", "Review results"],
      decisionRule: "Progress after one buyer pays GBP 100 within 7 days.",
      constraints: [],
      timeRequired: "7 days",
      costEstimate: "GBP 0-50",
    },
    afterValidation: {
      fulfilValidatedPromise: "Deliver the validated promise using existing tools.",
      learnFromDelivery: ["Observe what creates value.", "Track the greatest delivery friction."],
      repeatedProofTarget: "Sell the same offer to three additional customers.",
      nextInvestmentIfProven: "Automate the most time-consuming proven delivery step.",
      reviseOrStopIf: "Fewer than two additional customers pay for the same offer.",
    },
    criticalRisksAndUnknowns: [
      {
        concern: "Will target customers pay for the offer?",
        decisionImpact: "Determines whether the idea should progress beyond validation.",
        priority: "primary",
        addressedDuring: "validation_plan",
      },
      {
        concern: "Will the successful signal repeat with additional customers?",
        decisionImpact: "Determines whether the next investment is justified.",
        priority: "secondary",
        addressedDuring: "after_validation",
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
          validationPlan: {
            testType: "7_day_payment_validation",
            testTypeLabel: "7-Day Payment Validation",
            goal: "Test whether players will pay for highlights.",
            offerOrExperiment: "Three clips from one game for GBP 5.",
            steps: ["Record one game", "Offer paid highlight packs", "Deliver manually"],
            decisionRule: "Progress after at least two players pay GBP 5 within 7 days.",
            constraints: ["Manual delivery must take under three hours per game."],
            timeRequired: "7 days",
            costEstimate: "GBP 0-20",
          },
          afterValidation: {
            fulfilValidatedPromise: "Edit and send the purchased clips using existing tools.",
            learnFromDelivery: [
              "Track which clips buyers value.",
              "Identify the most time-consuming delivery step.",
            ],
            repeatedProofTarget: "Sell the same offer at two more games.",
            nextInvestmentIfProven: "Automate the most time-consuming proven editing step.",
            reviseOrStopIf: "Players do not pay for the same offer at another game.",
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
    expect(result.validationPlan.decisionRule).toMatch(/two players pay GBP 5/i);
    expect(result.runMetadata.model).toBe("qwen3:8b");
    expect(calls).toHaveLength(2);
    expect(calls[1].messages.at(-1)?.content).toContain(
      "The founder organizes a weekly basketball run."
    );
  });

  it("returns only canonical analysis concepts without legacy compatibility fields", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis(),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed idea with a customer, problem, solution, and Validation Plan.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result).toHaveProperty("validationPlan");
    expect(result).toHaveProperty("criticalRisksAndUnknowns");
    expect(result).toHaveProperty("afterValidation");
    for (const field of [
      "smallestViableWedge",
      "paymentValidation",
      "manualValidationTest",
      "questionsToAskUsers",
      "evidenceNeededBeforeBuilding",
      "recommendedNextAction",
      "mostDangerousAssumption",
      "whyThisMightFail",
      "keyUnknowns",
    ]) {
      expect(result).not.toHaveProperty(field);
    }
  });

  it("links the basketball Validation Plan to one primary Critical Risk or Unknown", async () => {
    const primaryConcern =
      "Will players repeatedly pay for structured highlights instead of using free alternatives?";
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        mostDangerousAssumption: "Players will pay for highlights.",
        whyThisMightFail: ["Players may prefer free alternatives."],
        keyUnknowns: [
          {
            unknown: "Will players pay for highlights?",
            howToResolve: "Offer a paid highlight pack.",
          },
        ],
        criticalRisksAndUnknowns: [
          {
            concern: primaryConcern,
            decisionImpact:
              "Determines whether the idea should progress beyond manual validation and whether editing automation would be justified.",
            priority: "primary",
            addressedDuring: "validation_plan",
          },
          {
            concern: "Can automated editing preserve acceptable clip quality?",
            decisionImpact:
              "Determines whether automation can support the next investment without weakening the paid outcome.",
            priority: "secondary",
            addressedDuring: "after_validation",
          },
        ],
        validationPlan: {
          testType: "7_day_payment_validation",
          testTypeLabel: "7-Day Payment Validation",
          addressesConcern: primaryConcern,
          goal: "Test repeat willingness to pay.",
          offerOrExperiment: "Sell a manually edited highlight pack for EUR 5.",
          steps: ["Record one game", "Offer the pack", "Collect payment"],
          decisionRule: "Progress after at least two players pay EUR 5.",
          constraints: [],
          timeRequired: "7 days",
          costEstimate: "EUR 0-20",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed basketball highlight platform idea.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.criticalRisksAndUnknowns).toHaveLength(2);
    expect(result.criticalRisksAndUnknowns.filter((item) => item.priority === "primary")).toHaveLength(1);
    expect(result.criticalRisksAndUnknowns[0]).toMatchObject({
      concern: primaryConcern,
      priority: "primary",
      addressedDuring: "validation_plan",
    });
    expect(result.validationPlan.addressesConcern).toBe(primaryConcern);
    expect(result).not.toHaveProperty("mostDangerousAssumption");
    expect(result).not.toHaveProperty("whyThisMightFail");
    expect(result).not.toHaveProperty("keyUnknowns");
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

  it("does not present restated idea claims as observed evidence", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        painOrDesire: {
          score: 5,
          reason: "The problem is plausible but unproven.",
          evidence: [
            "The idea describes players wanting footage and highlights.",
            "Players may value sharing clips with friends.",
          ],
          uncertainty: "Whether players will pay for footage.",
        },
        commercialPotential: {
          score: 5,
          reason: "There are plausible buyers but no payment proof.",
          evidence: ["Two organizers have already paid EUR 50 for recorded games."],
          uncertainty: "Whether organizers will purchase repeatedly.",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed basketball footage platform idea with no completed customer tests.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.painOrDesire.evidence).toEqual([]);
    expect(result.commercialPotential.evidence).toEqual([
      "Two organizers have already paid EUR 50 for recorded games.",
    ]);
    expect(result.painOrDesire.uncertainty).toMatch(/pay/i);
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
    expect(result.firstTestableVersion).toContain(result.validationPlan.offerOrExperiment);
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

  it("provides a useful strategy reason when the model omits one", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        recommendedStrategy: "test_manually_first",
        strategyReason: undefined,
        validationPlan: {
          testType: "7_day_payment_validation",
          testTypeLabel: "7-Day Payment Validation",
          goal: "Test whether basketball players will repeatedly pay for highlight packs.",
          offerOrExperiment: "Sell a manually edited highlight pack for EUR 5.",
          steps: ["Record one game", "Offer the pack to players", "Collect payment"],
          decisionRule: "Progress after at least two players pay EUR 5.",
          constraints: [],
          timeRequired: "7 days",
          costEstimate: "EUR 0-20",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed basketball highlight platform idea.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.strategyReason).toMatch(/payment|highlight pack|manually/i);
    expect(result.strategyReason).not.toBe("This strategy matches the current evidence and uncertainty level.");
  });

  it("preserves organizational buyer and commitment constraints for a B2B idea", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        targetCustomer: "Operations managers at small UK food manufacturers",
        validationPlan: {
          testType: "7_day_payment_validation",
          testTypeLabel: "7-Day Payment Validation",
          goal: "Test whether a manufacturer will commit to a compliance audit.",
          offerOrExperiment: "A two-week compliance audit for GBP 150.",
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
    expect(result.validationPlan.decisionRule).toMatch(/paid pilot/i);
    expect(result.validationPlan.constraints).toContain(
      "The manufacturer must approve secure handling of compliance documents."
    );
  });

  it("returns a canonical 7-Day Payment Validation plan when payment is plausible", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        validationPlan: {
          testType: "7_day_payment_validation",
          testTypeLabel: "7-Day Payment Validation",
          goal: "Test whether league organizers will buy game recording.",
          offerOrExperiment:
            "Offer one local league organizer a recorded game and highlight pack for GBP 150, payable by Stripe invoice.",
          steps: ["Contact five league organizers", "Send the paid offer", "Request payment"],
          decisionRule: "Progress after one organizer pays the GBP 150 Stripe invoice within 7 days.",
          constraints: ["Manual delivery must take less than four hours."],
          timeRequired: "7 days",
          costEstimate: "GBP 0-30",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed basketball recording service for local league organizers.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.validationPlan).toMatchObject({
      testType: "7_day_payment_validation",
      testTypeLabel: "7-Day Payment Validation",
      goal: "Test whether league organizers will buy game recording.",
      offerOrExperiment: expect.stringMatching(/organizer.*GBP 150.*Stripe invoice/i),
      decisionRule: expect.stringMatching(/organizer pays.*GBP 150.*within 7 days/i),
    });
  });

  it("keeps only distinct operational constraints in the Validation Plan", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        validationPlan: {
          testType: "7_day_payment_validation",
          testTypeLabel: "7-Day Payment Validation",
          goal: "Test whether players will buy highlights.",
          offerOrExperiment: "Sell three clips to basketball players for GBP 5 by payment link.",
          steps: ["Offer the clips", "Request payment", "Deliver manually"],
          decisionRule: "Progress after two players pay GBP 5 within 7 days.",
          constraints: [
            "Manual editing must take less than three hours per game.",
            "Fail if fewer than two players pay.",
            "Players must say they like the clips.",
          ],
          timeRequired: "7 days",
          costEstimate: "GBP 0-20",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed paid basketball highlight service.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.validationPlan.constraints).toEqual([
      "Manual editing must take less than three hours per game.",
    ]);
  });

  it("does not treat free engagement or compliments as payment validation", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        validationPlan: {
          testType: "7_day_payment_validation",
          testTypeLabel: "7-Day Payment Validation",
          goal: "Test whether players like the clips.",
          offerOrExperiment: "Send free clips to ten players.",
          steps: ["Send free clips", "Ask whether players like them"],
          decisionRule: "Progress if eight players say they like the clips.",
          constraints: [],
          timeRequired: "7 days",
          costEstimate: "GBP 0",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed basketball highlight idea with no payment evidence.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.validationPlan.testType).toBe("non_payment_experiment");
    expect(result.validationPlan.testTypeLabel).toBe("Behavioral Validation Experiment");
  });

  it("preserves an explicitly justified non-payment validation experiment", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        validationPlan: {
          testType: "non_payment_experiment",
          testTypeLabel: "Behavioral Validation Experiment",
          goal: "Test whether the core technical result is achievable before selling it.",
          offerOrExperiment: "Run the customer's anonymized sample through the manual process.",
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
    expect(result.validationPlan.decisionRule).toMatch(/two of three samples/i);
    expect(result.validationPlan.decisionRule).not.toMatch(/pays|deposit|financial commitment/i);
    expect(result.validationPlan).toMatchObject({
      testType: "non_payment_experiment",
      testTypeLabel: "Behavioral Validation Experiment",
      goal: expect.stringMatching(/technical result|feasibility/i),
      offerOrExperiment: expect.stringMatching(/anonymized sample/i),
      decisionRule: expect.stringMatching(/two of three samples.*accuracy threshold/i),
    });
  });

  it("returns two to five decision-critical concerns without embedding resolution steps", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        criticalRisksAndUnknowns: [
          {
            concern: "Commercial potential is unknown.",
            decisionImpact: "Conduct market research.",
            priority: "primary",
            addressedDuring: "validation_plan",
          },
          {
            concern: "Will operations leaders pay for the managed service?",
            decisionImpact: "Determines whether the offer is worth repeating beyond the first test.",
            priority: "primary",
            addressedDuring: "validation_plan",
          },
          {
            concern: "Will customers renew after the first delivery?",
            decisionImpact: "Determines whether recurring investment is justified.",
            priority: "secondary",
            addressedDuring: "after_validation",
          },
          {
            concern: "Which buyer segment should receive the first offer?",
            decisionImpact: "Run a broad survey before deciding.",
            priority: "secondary",
            addressedDuring: "after_validation",
          },
        ],
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed managed service for operations teams with a concrete paid validation offer.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.criticalRisksAndUnknowns.length).toBeGreaterThanOrEqual(2);
    expect(result.criticalRisksAndUnknowns.length).toBeLessThanOrEqual(5);
    expect(result.criticalRisksAndUnknowns.filter((item) => item.priority === "primary")).toHaveLength(1);
    expect(result.criticalRisksAndUnknowns.map((item) => item.concern).join(" ")).not.toMatch(
      /commercial potential is unknown/i
    );
    expect(result.criticalRisksAndUnknowns.map((item) => item.decisionImpact).join(" ")).not.toMatch(
      /conduct market research|run a survey|build a prototype/i
    );
    expect(result.criticalRisksAndUnknowns.map((item) => item.concern).join(" ")).not.toMatch(
      /which buyer segment/i
    );
    expect(result.validationPlan.addressesConcern).toBe(
      result.criticalRisksAndUnknowns.find((item) => item.priority === "primary")?.concern
    );
  });

  it("keeps a material regulatory concern until before a larger investment", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        criticalRisksAndUnknowns: [
          {
            concern: "Will regulated buyers make a paid commitment after the feasibility test?",
            decisionImpact: "Determines whether the service should progress beyond validation.",
            priority: "primary",
            addressedDuring: "validation_plan",
          },
          {
            concern: "Will the larger deployment require regulatory approval?",
            decisionImpact: "Determines whether a larger product investment is viable.",
            priority: "secondary",
            addressedDuring: "before_larger_investment",
          },
        ],
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed regulated technical service with a paid feasibility offer.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.criticalRisksAndUnknowns).toContainEqual(
      expect.objectContaining({
        concern: expect.stringMatching(/regulatory approval/i),
        addressedDuring: "before_larger_investment",
      })
    );
  });

  it("turns basketball validation into a repeated-payment investment gate", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        afterValidation: {
          fulfilValidatedPromise: "Record games and manually deliver the purchased highlight package.",
          learnFromDelivery: [
            "Track which clips buyers value.",
            "Compare whether players or organizers are the stronger buyer.",
            "Identify the most time-consuming part of fulfilment.",
          ],
          repeatedProofTarget:
            "Sell the same offer for three additional games, with at least two previous buyers paying again.",
          nextInvestmentIfProven:
            "Build a tiny prototype that automates the most time-consuming proven part of clip creation.",
          reviseOrStopIf:
            "Buyers do not pay again, refer another paying customer, or commit to another recording.",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed basketball highlight service with a concrete paid Validation Plan.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.afterValidation.fulfilValidatedPromise).toMatch(/purchased highlight package/i);
    expect(result.afterValidation.learnFromDelivery).toHaveLength(3);
    expect(result.afterValidation.repeatedProofTarget).toMatch(/three additional games.*two previous buyers/i);
    expect(result.afterValidation.nextInvestmentIfProven).toMatch(/automates.*clip creation/i);
    expect(result.afterValidation.nextInvestmentIfProven).not.toMatch(/full product|analytics|rankings/i);
    expect(result.afterValidation.reviseOrStopIf).toMatch(/do not pay again/i);
  });

  it("gates a compliance service investment on repeat sales or subscription conversion", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        afterValidation: {
          fulfilValidatedPromise:
            "Complete the paid compliance audit and action plan using the customer's documents.",
          learnFromDelivery: [
            "Track which deadlines and documents create the most urgent value.",
            "Measure which follow-up work customers request after the audit.",
          ],
          repeatedProofTarget:
            "Sell the audit to three additional manufacturers and convert at least two into the monthly managed service.",
          nextInvestmentIfProven:
            "Automate the recurring document and deadline extraction that consumes the most delivery effort.",
          reviseOrStopIf:
            "Fewer than two customers continue into the monthly managed service after receiving the audit.",
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
    expect(result.afterValidation.repeatedProofTarget).toMatch(/three additional manufacturers.*two.*monthly/i);
    expect(result.afterValidation.nextInvestmentIfProven).toMatch(/automate.*document.*deadline/i);
    expect(result.afterValidation.reviseOrStopIf).toMatch(/fewer than two.*continue/i);
  });

  it("adapts incomplete post-validation guidance for a regulated feasibility experiment", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        firstTestableVersion:
          "Process anonymized customer samples and verify the result against an agreed safety threshold.",
        validationPlan: {
          testType: "non_payment_experiment",
          testTypeLabel: "Behavioral Validation Experiment",
          goal: "Prove technical feasibility before accepting payment.",
          offerOrExperiment:
            "Process anonymized customer samples and compare the results with the agreed safety threshold.",
          steps: ["Recruit three design partners", "Process one anonymized sample for each"],
          decisionRule: "Progress if at least two of three samples meet the agreed safety threshold.",
          constraints: ["Do not accept payment before feasibility is established."],
          timeRequired: "7 days",
          costEstimate: "GBP 0-50",
        },
        afterValidation: {},
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A regulated technical product that must prove safe sample processing before customer delivery.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.afterValidation.fulfilValidatedPromise).toMatch(/anonymized customer samples|safety threshold/i);
    expect(result.afterValidation.fulfilValidatedPromise).not.toMatch(/manual service/i);
    expect(result.afterValidation.learnFromDelivery.length).toBeGreaterThanOrEqual(2);
    expect(result.afterValidation.learnFromDelivery.length).toBeLessThanOrEqual(4);
    expect(result.afterValidation.repeatedProofTarget).toMatch(/\d|at least|additional/i);
    expect(result.afterValidation.nextInvestmentIfProven).toBeTruthy();
    expect(result.afterValidation.reviseOrStopIf).toBeTruthy();
  });

  it("rejects a premature full-product investment after a single validation success", async () => {
    const { runIdeaAnalysis } = createRunnerWithResponses([
      readyIntake(),
      completeAnalysis({
        afterValidation: {
          fulfilValidatedPromise: "Build the full product for the first validated customer.",
          learnFromDelivery: ["Ask whether customers liked it."],
          repeatedProofTarget: "Scale immediately after one successful test.",
          nextInvestmentIfProven: "Build the full platform with every planned feature.",
          reviseOrStopIf: "",
        },
      }),
    ]);

    const result = await runIdeaAnalysis({
      idea: "A detailed service idea with one successful Validation Plan.",
      model: "qwen3:8b",
      deepThinking: false,
    });

    expect(result.status).toBe("analysis");
    if (result.status !== "analysis") throw new Error("Expected analysis response.");
    expect(result.afterValidation.fulfilValidatedPromise).not.toMatch(/build the full product/i);
    expect(result.afterValidation.learnFromDelivery.length).toBeGreaterThanOrEqual(2);
    expect(result.afterValidation.repeatedProofTarget).not.toMatch(/scale immediately|one successful/i);
    expect(result.afterValidation.nextInvestmentIfProven).not.toMatch(/full platform|every planned feature/i);
    expect(result.afterValidation.reviseOrStopIf).toBeTruthy();
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
