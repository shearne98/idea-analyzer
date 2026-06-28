import { describe, expect, it } from "vitest";
import {
  buildIntakeClarification,
  combineIdeaWithClarification,
  createIdeaIntake,
  renderNormalizedIdeaWithUpdates,
} from "@/lib/idea-intake";

const specificNormalizedMarkdown = `idea_analyzer_schema_version: 1

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

describe("idea intake contract", () => {
  it("preserves the original idea when clarification context is added", () => {
    const originalIdea = "AI for sports";
    const addedContext =
      "A phone-based highlight service for amateur basketball players, tested manually at one game.";

    expect(combineIdeaWithClarification(originalIdea, addedContext)).toBe(
      `${originalIdea}\n\nAdditional context:\n${addedContext}`
    );
  });

  it("generates guided questions for missing normalized fields", () => {
    const missingCustomer = specificNormalizedMarkdown.replace(
      /# Target Customer\n[\s\S]*?\n\n# Problem Or Desire/,
      "# Target Customer\n\n# Problem Or Desire"
    );

    const result = createIdeaIntake({ normalizedIdea: missingCustomer });

    expect(result).toMatchObject({
      contract: "idea-intake",
      schemaVersion: 1,
      normalizedIdeaSchemaVersion: 1,
    });
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        section: "Target Customer",
        field: "targetCustomer",
      })
    );
    expect(result.questions[0].question).toMatch(/who/i);
    expect(result.proposedUpdates).toEqual([]);
  });

  it("incorporates user answers as proposed normalized field updates without writing files", () => {
    const missingCustomer = specificNormalizedMarkdown.replace(
      /# Target Customer\n[\s\S]*?\n\n# Problem Or Desire/,
      "# Target Customer\n\n# Problem Or Desire"
    );

    const result = createIdeaIntake({
      normalizedIdea: missingCustomer,
      answers: {
        targetCustomer:
          "Independent fractional sales consultants who take 4+ discovery calls per week and currently write every follow-up manually.",
      },
    });

    expect(result.proposedUpdates).toContainEqual(
      expect.objectContaining({
        section: "Target Customer",
        field: "targetCustomer",
        proposedValue:
          "Independent fractional sales consultants who take 4+ discovery calls per week and currently write every follow-up manually.",
        source: "user_answer",
      })
    );
    expect(result.normalizedIdeaAfterProposedUpdates?.fields.targetCustomer).toContain(
      "fractional sales consultants"
    );
  });

  it("uses source material as supporting context while treating normalized content as primary", () => {
    const result = createIdeaIntake({
      normalizedIdea: specificNormalizedMarkdown,
      sourceMaterial:
        "New note: the first test should be a paid done-for-you service for three consultants before software is built.",
    });

    expect(result.proposedUpdates).toContainEqual(
      expect.objectContaining({
        field: "firstTestableVersion",
        source: "source_material",
      })
    );
    expect(result.proposedUpdates).not.toContainEqual(
      expect.objectContaining({ field: "targetCustomer" })
    );
  });

  it("renders proposed updates while preserving unrelated normalized content", () => {
    const updates = createIdeaIntake({
      normalizedIdea: specificNormalizedMarkdown,
      answers: {
        evidence:
          "Three consultants agreed follow-up is a weekly bottleneck; one offered to pay £50 for a manually prepared recap pack.",
      },
    }).proposedUpdates;

    const rendered = renderNormalizedIdeaWithUpdates(specificNormalizedMarkdown, updates);

    expect(rendered).toContain("# One-Sentence Idea\nA concierge service");
    expect(rendered).toContain("# Evidence\nThree consultants agreed follow-up");
    expect(rendered).toContain("# Open Questions\n- Which CRM or notes format");
  });

  it("asks sharper questions for weak or vague normalized input", () => {
    const vague = specificNormalizedMarkdown
      .replace(
        "Independent B2B consultants who sell high-ticket services and personally manage follow-up after discovery calls.",
        "Everyone"
      )
      .replace(
        "A lightweight workflow that ingests call notes and drafts personalized recap emails with next steps within ten minutes.",
        "An app."
      );

    const result = createIdeaIntake({ normalizedIdea: vague });

    expect(result.questions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "targetCustomer" }),
        expect.objectContaining({ field: "proposedSolution" }),
      ])
    );
    expect(result.questions.map((question) => question.question).join(" ")).toMatch(/narrow|specific|actually does/i);
  });

  it("keeps website clarification question generation on the shared intake contract", () => {
    const clarification = buildIntakeClarification({
      idea: "AI for sports",
      reason: "The idea is too broad.",
      missingFields: ["targetCustomer", "problemOrDesire", "proposedSolution"],
      modelQuestions: ["Which sport and level of play is this for?"],
      possibleDirections: ["Highlights for amateur basketball teams"],
    });

    expect(clarification).toMatchObject({
      reason: "The idea is too broad.",
      missingFields: ["targetCustomer", "problemOrDesire", "proposedSolution"],
      possibleDirections: ["Highlights for amateur basketball teams"],
    });
    expect(clarification.clarifyingQuestions).toEqual(
      expect.arrayContaining([
        "Which sport and level of play is this for?",
        "Who specifically experiences this problem or desire?",
      ])
    );
  });
});
