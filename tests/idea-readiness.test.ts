import { describe, expect, it } from "vitest";
import { parseNormalizedIdeaMarkdown } from "@/lib/normalized-idea";
import { checkIdeaReadiness } from "@/lib/idea-readiness";

const strongNormalizedMarkdown = `idea_analyzer_schema_version: 1

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

function issueCodes(result: ReturnType<typeof checkIdeaReadiness>, severity: "blockers" | "warnings" | "suggestions") {
  return result[severity].map((issue) => issue.code);
}

describe("idea readiness contract", () => {
  it("turns missing normalized idea sections into readiness blockers", () => {
    const missingPayer = strongNormalizedMarkdown.replace(
      /# Payer\n[\s\S]*?\n\n# Current Alternative/,
      "# Current Alternative"
    );

    const result = checkIdeaReadiness(missingPayer);

    expect(result.readyForFinalAnalysis).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        code: "missing_required_section",
        section: "Payer",
      })
    );
  });

  it("turns empty normalized idea sections into readiness blockers", () => {
    const emptyEvidence = strongNormalizedMarkdown.replace(
      /# Evidence\n[\s\S]*?\n\n# Assumptions/,
      "# Evidence\n\n# Assumptions"
    );

    const result = checkIdeaReadiness(emptyEvidence);

    expect(result.readyForFinalAnalysis).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        severity: "blocker",
        code: "empty_required_section",
        section: "Evidence",
      })
    );
  });

  it("flags vague or generic required fields as blockers before final analysis", () => {
    const vague = strongNormalizedMarkdown
      .replace(
        "Independent B2B consultants who sell high-ticket services and personally manage follow-up after discovery calls.",
        "Everyone"
      )
      .replace(
        "They lose momentum after promising follow-up because call notes are scattered and writing a specific recap takes too long.",
        "They need productivity."
      )
      .replace(
        "A lightweight workflow that ingests call notes and drafts personalized recap emails with next steps within ten minutes.",
        "An app."
      )
      .replace(
        "Consultants send better follow-up faster, recover more active opportunities, and reduce post-call admin time.",
        "Saves time."
      );

    const result = checkIdeaReadiness(vague);

    expect(result.readyForFinalAnalysis).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "generic_target_customer", section: "Target Customer" }),
        expect.objectContaining({ code: "generic_problem_or_desire", section: "Problem Or Desire" }),
        expect.objectContaining({ code: "generic_proposed_solution", section: "Proposed Solution" }),
        expect.objectContaining({ code: "generic_value_outcome", section: "Value Outcome" }),
      ])
    );
  });

  it("flags explicit uncertainty in core required fields as blockers", () => {
    const uncertain = strongNormalizedMarkdown.replace(
      "Solo consultants or small consulting firms paying monthly for pipeline admin leverage.",
      "Unknown / not sure yet."
    );

    const result = checkIdeaReadiness(uncertain);

    expect(result.readyForFinalAnalysis).toBe(false);
    expect(result.blockers).toContainEqual(
      expect.objectContaining({
        code: "uncertain_required_field",
        section: "Payer",
      })
    );
  });

  it("allows explicit no-evidence cases with warnings instead of blockers", () => {
    const noEvidence = strongNormalizedMarkdown.replace(
      "Two consultants described follow-up admin as a weekly bottleneck and already paste notes into AI tools.",
      "No evidence yet; this is only a hypothesis from my own experience."
    );

    const result = checkIdeaReadiness(noEvidence);

    expect(result.readyForFinalAnalysis).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        code: "no_evidence_yet",
        section: "Evidence",
      })
    );
  });

  it("returns ready-with-warnings when the idea has no blockers but analysis confidence is limited", () => {
    const warningOnly = `${strongNormalizedMarkdown}
# Founder Fit Notes
Founder context belongs in the explicit Founder Profile.
`;

    const result = checkIdeaReadiness(warningOnly);

    expect(result.readyForFinalAnalysis).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(issueCodes(result, "warnings")).toContain("legacy_section");
    expect(result.suggestions).toContainEqual(
      expect.objectContaining({ code: "legacy_section_cleanup" })
    );
  });

  it("returns ready-without-blockers for a specific and complete parsed normalized idea object", () => {
    const parsed = parseNormalizedIdeaMarkdown(strongNormalizedMarkdown);

    const result = checkIdeaReadiness(parsed);

    expect(result).toMatchObject({
      contract: "idea-readiness",
      schemaVersion: 1,
      normalizedIdeaSchemaVersion: 1,
      readyForFinalAnalysis: true,
      blockers: [],
      warnings: [],
    });
    expect(result.generatedAt).toEqual(expect.any(String));
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
