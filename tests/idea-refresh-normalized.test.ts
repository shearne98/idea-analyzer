import { describe, expect, it } from "vitest";
import { createRefreshNormalized } from "@/lib/idea-refresh-normalized";

const matureNormalizedMarkdown = `idea_analyzer_schema_version: 1

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

describe("refresh-normalized contract", () => {
  it("proposes targeted updates for new source details without restarting intake", () => {
    const result = createRefreshNormalized({
      existingNormalizedIdea: matureNormalizedMarkdown,
      updatedSourceMaterial:
        "New Notion detail: the smallest test should be a paid done-for-you pilot for three consultants before software is built. Evidence: one consultant offered to pay £50 for a manually prepared recap pack.",
    });

    expect(result).toMatchObject({
      contract: "refresh-normalized",
      schemaVersion: 1,
      normalizedIdeaSchemaVersion: 1,
    });
    expect(result.questions).toEqual([]);
    expect(result.proposedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "firstTestableVersion",
          source: "updated_source_material",
        }),
        expect.objectContaining({
          field: "evidence",
          source: "updated_source_material",
        }),
      ])
    );
    expect(result.readiness.readyForFinalAnalysis).toBe(true);
    expect(result.readinessAfterProposedUpdates?.readyForFinalAnalysis).toBe(true);
  });

  it("returns no proposed updates for no-op source refreshes", () => {
    const result = createRefreshNormalized({
      existingNormalizedIdea: matureNormalizedMarkdown,
      updatedSourceMaterial:
        "Imported from Notion: two consultants described follow-up admin as a weekly bottleneck and already paste notes into AI tools.",
    });

    expect(result.proposedUpdates).toEqual([]);
    expect(result.normalizedIdeaAfterProposedUpdates).toBeUndefined();
    expect(result.warnings).toEqual([]);
    expect(result.questions).toEqual([]);
  });

  it("reports conflicting source information as warnings and questions instead of overwriting", () => {
    const result = createRefreshNormalized({
      existingNormalizedIdea: matureNormalizedMarkdown,
      updatedSourceMaterial:
        "Notion update: Target Customer: enterprise sales teams with RevOps managers, not independent B2B consultants.",
    });

    expect(result.proposedUpdates).not.toContainEqual(
      expect.objectContaining({ field: "targetCustomer" })
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "source_conflicts_with_normalized_content",
        field: "targetCustomer",
      })
    );
    expect(result.questions).toContainEqual(
      expect.objectContaining({
        field: "targetCustomer",
        question: expect.stringMatching(/confirm/i),
      })
    );
  });

  it("preserves mature normalized content when source lacks a clear improvement", () => {
    const result = createRefreshNormalized({
      existingNormalizedIdea: matureNormalizedMarkdown,
      updatedSourceMaterial:
        "Random extra note: this still feels interesting and could be useful someday. Maybe AI can help with sales admin.",
    });

    expect(result.proposedUpdates).toEqual([]);
    expect(result.normalizedIdeaAfterProposedUpdates).toBeUndefined();
    expect(result.readiness.readyForFinalAnalysis).toBe(true);
  });
});
