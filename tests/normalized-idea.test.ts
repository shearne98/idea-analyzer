import { describe, expect, it } from "vitest";
import {
  NORMALIZED_IDEA_SCHEMA_VERSION,
  parseNormalizedIdeaMarkdown,
  validateNormalizedIdeaMarkdown,
} from "@/lib/normalized-idea";

const validNormalizedMarkdown = `idea_analyzer_schema_version: 1

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

describe("normalized idea v1 contract", () => {
  it("parses valid normalized markdown into the v1 structured representation", () => {
    const result = parseNormalizedIdeaMarkdown(validNormalizedMarkdown);

    expect(result.schemaVersion).toBe(NORMALIZED_IDEA_SCHEMA_VERSION);
    expect(result.fields.oneSentenceIdea).toContain("concierge service");
    expect(result.fields.targetCustomer).toContain("Independent B2B consultants");
    expect(result.fields.openQuestions).toContain("Which CRM");
    expect(result.legacySections).toEqual([]);
    expect(result.extraSections).toEqual([]);
  });

  it("reports missing required v1 sections", () => {
    const invalid = validNormalizedMarkdown.replace(
      /# Payer\n[\s\S]*?\n\n# Current Alternative/,
      "# Current Alternative"
    );

    const result = validateNormalizedIdeaMarkdown(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "missing_required_section",
      section: "Payer",
      message: "Missing required normalized idea section: Payer",
    });
  });

  it("reports empty required v1 sections", () => {
    const invalid = validNormalizedMarkdown.replace(
      /# Evidence\n[\s\S]*?\n\n# Assumptions/,
      "# Evidence\n\n# Assumptions"
    );

    const result = validateNormalizedIdeaMarkdown(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual({
      code: "empty_required_section",
      section: "Evidence",
      message: "Required normalized idea section is empty: Evidence",
    });
  });

  it("deprecates Founder Fit Notes as a legacy section outside the normalized idea fields", () => {
    const markdown = `${validNormalizedMarkdown}\n# Founder Fit Notes\nFounder context now comes from an explicit Founder Profile input.\n`;

    const result = validateNormalizedIdeaMarkdown(markdown);

    expect(result.valid).toBe(true);
    expect(result.parsed?.legacySections).toEqual(["Founder Fit Notes"]);
    expect(result.warnings).toContainEqual({
      code: "legacy_section",
      section: "Founder Fit Notes",
      message:
        "Founder Fit Notes is deprecated in normalized ideas; pass Founder Profile explicitly during final analysis.",
    });
    expect(result.parsed?.fields).not.toHaveProperty("founderFitNotes");
  });

  it("preserves unknown extra sections without adding them to v1 fields", () => {
    const markdown = `${validNormalizedMarkdown}\n# Distribution Notes\nStart with LinkedIn outreach to consultants.\n`;

    const result = validateNormalizedIdeaMarkdown(markdown);

    expect(result.valid).toBe(true);
    expect(result.parsed?.extraSections).toEqual(["Distribution Notes"]);
    expect(result.warnings).toContainEqual({
      code: "extra_section",
      section: "Distribution Notes",
      message:
        "Extra normalized idea section is preserved as metadata and is not part of the v1 contract: Distribution Notes",
    });
    expect(result.parsed?.fields).not.toHaveProperty("distributionNotes");
  });
});
