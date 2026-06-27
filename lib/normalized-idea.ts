export const NORMALIZED_IDEA_SCHEMA_VERSION = 1;

export const NORMALIZED_IDEA_REQUIRED_SECTIONS = [
  "One-Sentence Idea",
  "Target Customer",
  "Problem Or Desire",
  "Proposed Solution",
  "Value Outcome",
  "Payer",
  "Current Alternative",
  "First Testable Version",
  "Evidence",
  "Assumptions",
  "Open Questions",
] as const;

export type NormalizedIdeaSection = (typeof NORMALIZED_IDEA_REQUIRED_SECTIONS)[number];

export type NormalizedIdeaFields = {
  oneSentenceIdea: string;
  targetCustomer: string;
  problemOrDesire: string;
  proposedSolution: string;
  valueOutcome: string;
  payer: string;
  currentAlternative: string;
  firstTestableVersion: string;
  evidence: string;
  assumptions: string;
  openQuestions: string;
};

export type NormalizedIdea = {
  schemaVersion: typeof NORMALIZED_IDEA_SCHEMA_VERSION;
  fields: NormalizedIdeaFields;
  legacySections: string[];
  extraSections: string[];
};

export type NormalizedIdeaValidationIssue = {
  code:
    | "missing_schema_version"
    | "unsupported_schema_version"
    | "missing_required_section"
    | "empty_required_section"
    | "legacy_section"
    | "extra_section";
  section?: string;
  message: string;
};

export type NormalizedIdeaValidationResult = {
  valid: boolean;
  parsed?: NormalizedIdea;
  errors: NormalizedIdeaValidationIssue[];
  warnings: NormalizedIdeaValidationIssue[];
};

type ParsedMarkdownSections = {
  schemaVersion: number | null;
  sections: Map<string, string>;
};

const SECTION_TO_FIELD: Record<NormalizedIdeaSection, keyof NormalizedIdeaFields> = {
  "One-Sentence Idea": "oneSentenceIdea",
  "Target Customer": "targetCustomer",
  "Problem Or Desire": "problemOrDesire",
  "Proposed Solution": "proposedSolution",
  "Value Outcome": "valueOutcome",
  Payer: "payer",
  "Current Alternative": "currentAlternative",
  "First Testable Version": "firstTestableVersion",
  Evidence: "evidence",
  Assumptions: "assumptions",
  "Open Questions": "openQuestions",
};

const REQUIRED_SECTION_SET = new Set<string>(NORMALIZED_IDEA_REQUIRED_SECTIONS);
const LEGACY_SECTIONS = new Set(["Founder Fit Notes"]);

function extractSchemaVersion(markdown: string) {
  const match = markdown.match(/^idea_analyzer_schema_version:\s*(\d+)\s*$/m);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseMarkdownSections(markdown: string): ParsedMarkdownSections {
  const schemaVersion = extractSchemaVersion(markdown);
  const sections = new Map<string, string>();
  const headingPattern = /^#{1,6}\s+(.+?)\s*$/gm;
  const headings = [...markdown.matchAll(headingPattern)];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const title = heading[1].trim();
    const contentStart = (heading.index ?? 0) + heading[0].length;
    const contentEnd = index + 1 < headings.length ? headings[index + 1].index ?? markdown.length : markdown.length;
    sections.set(title, markdown.slice(contentStart, contentEnd).trim());
  }

  return { schemaVersion, sections };
}

function buildFields(sections: Map<string, string>) {
  return NORMALIZED_IDEA_REQUIRED_SECTIONS.reduce((fields, section) => {
    fields[SECTION_TO_FIELD[section]] = sections.get(section)?.trim() ?? "";
    return fields;
  }, {} as NormalizedIdeaFields);
}

function buildParsedIdea(parsedMarkdown: ParsedMarkdownSections): NormalizedIdea {
  const sectionNames = [...parsedMarkdown.sections.keys()];

  return {
    schemaVersion: NORMALIZED_IDEA_SCHEMA_VERSION,
    fields: buildFields(parsedMarkdown.sections),
    legacySections: sectionNames.filter((section) => LEGACY_SECTIONS.has(section)),
    extraSections: sectionNames.filter(
      (section) => !REQUIRED_SECTION_SET.has(section) && !LEGACY_SECTIONS.has(section)
    ),
  };
}

export function validateNormalizedIdeaMarkdown(markdown: string): NormalizedIdeaValidationResult {
  const parsedMarkdown = parseMarkdownSections(markdown);
  const errors: NormalizedIdeaValidationIssue[] = [];
  const warnings: NormalizedIdeaValidationIssue[] = [];

  if (parsedMarkdown.schemaVersion === null) {
    errors.push({
      code: "missing_schema_version",
      message: "Missing normalized idea schema version: idea_analyzer_schema_version: 1",
    });
  } else if (parsedMarkdown.schemaVersion !== NORMALIZED_IDEA_SCHEMA_VERSION) {
    errors.push({
      code: "unsupported_schema_version",
      message: `Unsupported normalized idea schema version: ${parsedMarkdown.schemaVersion}`,
    });
  }

  for (const section of NORMALIZED_IDEA_REQUIRED_SECTIONS) {
    if (!parsedMarkdown.sections.has(section)) {
      errors.push({
        code: "missing_required_section",
        section,
        message: `Missing required normalized idea section: ${section}`,
      });
      continue;
    }

    if (!parsedMarkdown.sections.get(section)?.trim()) {
      errors.push({
        code: "empty_required_section",
        section,
        message: `Required normalized idea section is empty: ${section}`,
      });
    }
  }

  const parsed = buildParsedIdea(parsedMarkdown);

  for (const section of parsed.legacySections) {
    warnings.push({
      code: "legacy_section",
      section,
      message:
        "Founder Fit Notes is deprecated in normalized ideas; pass Founder Profile explicitly during final analysis.",
    });
  }

  for (const section of parsed.extraSections) {
    warnings.push({
      code: "extra_section",
      section,
      message: `Extra normalized idea section is preserved as metadata and is not part of the v1 contract: ${section}`,
    });
  }

  return {
    valid: errors.length === 0,
    parsed: errors.length === 0 ? parsed : undefined,
    errors,
    warnings,
  };
}

export function parseNormalizedIdeaMarkdown(markdown: string) {
  const result = validateNormalizedIdeaMarkdown(markdown);

  if (!result.parsed) {
    throw new Error(result.errors.map((error) => error.message).join("; "));
  }

  return result.parsed;
}
