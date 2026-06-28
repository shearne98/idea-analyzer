import {
  NORMALIZED_IDEA_SCHEMA_VERSION,
  type NormalizedIdea,
  type NormalizedIdeaSection,
  type NormalizedIdeaValidationIssue,
  validateNormalizedIdeaMarkdown,
} from "@/lib/normalized-idea";

export const IDEA_READINESS_SCHEMA_VERSION = 1;

export type IdeaReadinessSeverity = "blocker" | "warning" | "suggestion";

export type IdeaReadinessIssueCode =
  | NormalizedIdeaValidationIssue["code"]
  | "generic_one_sentence_idea"
  | "generic_target_customer"
  | "generic_problem_or_desire"
  | "generic_proposed_solution"
  | "generic_value_outcome"
  | "generic_payer"
  | "generic_current_alternative"
  | "generic_first_testable_version"
  | "generic_assumptions"
  | "uncertain_required_field"
  | "no_evidence_yet"
  | "thin_evidence"
  | "thin_open_questions"
  | "legacy_section_cleanup"
  | "next_step_ready";

export type IdeaReadinessIssue = {
  severity: IdeaReadinessSeverity;
  code: IdeaReadinessIssueCode;
  section?: string;
  message: string;
  suggestion?: string;
};

export type IdeaReadinessResult = {
  contract: "idea-readiness";
  schemaVersion: typeof IDEA_READINESS_SCHEMA_VERSION;
  normalizedIdeaSchemaVersion: typeof NORMALIZED_IDEA_SCHEMA_VERSION;
  generatedAt: string;
  readyForFinalAnalysis: boolean;
  blockers: IdeaReadinessIssue[];
  warnings: IdeaReadinessIssue[];
  suggestions: IdeaReadinessIssue[];
};

type FieldRule = {
  section: NormalizedIdeaSection;
  field: keyof NormalizedIdea["fields"];
  genericCode: IdeaReadinessIssueCode;
  genericPatterns: RegExp[];
  minimumWords?: number;
  suggestion: string;
};

const UNCERTAINTY_PATTERN = /\b(?:unknown|not sure|unsure|tbd|to be determined|unclear|don't know|do not know|not decided|need to figure out)\b/i;
const NO_EVIDENCE_PATTERN = /\b(?:no evidence|none yet|no data|not validated|only a hypothesis|just a hypothesis|pure hypothesis)\b/i;

const FIELD_RULES: FieldRule[] = [
  {
    section: "One-Sentence Idea",
    field: "oneSentenceIdea",
    genericCode: "generic_one_sentence_idea",
    genericPatterns: [/^an?\s+(?:app|tool|platform|service)$/i, /^ai\s+(?:app|tool|platform)$/i],
    minimumWords: 8,
    suggestion: "State the customer, problem, solution shape, and outcome in one concrete sentence.",
  },
  {
    section: "Target Customer",
    field: "targetCustomer",
    genericCode: "generic_target_customer",
    genericPatterns: [/^everyone$/i, /^anyone$/i, /^people$/i, /\b(consumers|businesses|users)\b\s*$/i],
    minimumWords: 5,
    suggestion: "Name a narrow initial customer segment with context, role, or buying situation.",
  },
  {
    section: "Problem Or Desire",
    field: "problemOrDesire",
    genericCode: "generic_problem_or_desire",
    genericPatterns: [/\bneed productivity\b/i, /^saves? time$/i, /^pain point$/i, /^problem$/i],
    minimumWords: 8,
    suggestion: "Describe the concrete pain, trigger, frequency, and consequence for the target customer.",
  },
  {
    section: "Proposed Solution",
    field: "proposedSolution",
    genericCode: "generic_proposed_solution",
    genericPatterns: [/^an?\s+app\.?$/i, /^an?\s+platform\.?$/i, /^ai\s+tool\.?$/i],
    minimumWords: 7,
    suggestion: "Describe what the first solution actually does for the customer.",
  },
  {
    section: "Value Outcome",
    field: "valueOutcome",
    genericCode: "generic_value_outcome",
    genericPatterns: [/^saves? time\.?$/i, /^makes? money\.?$/i, /^better productivity\.?$/i],
    minimumWords: 6,
    suggestion: "Make the outcome measurable or observable enough to evaluate later.",
  },
  {
    section: "Payer",
    field: "payer",
    genericCode: "generic_payer",
    genericPatterns: [/^users?$/i, /^customers?$/i, /^businesses$/i],
    minimumWords: 4,
    suggestion: "Specify who pays, their buying context, and likely payment model.",
  },
  {
    section: "Current Alternative",
    field: "currentAlternative",
    genericCode: "generic_current_alternative",
    genericPatterns: [/^none$/i, /^nothing$/i, /^manual process$/i],
    minimumWords: 4,
    suggestion: "Name what the customer does today, including manual workarounds or substitute products.",
  },
  {
    section: "First Testable Version",
    field: "firstTestableVersion",
    genericCode: "generic_first_testable_version",
    genericPatterns: [/^mvp$/i, /^build an mvp$/i, /^launch$/i],
    minimumWords: 7,
    suggestion: "Describe the smallest concrete test, participants, and observable success signal.",
  },
  {
    section: "Assumptions",
    field: "assumptions",
    genericCode: "generic_assumptions",
    genericPatterns: [/^people want this\.?$/i, /^it will work\.?$/i],
    minimumWords: 5,
    suggestion: "List the riskiest beliefs that must be true for this idea to work.",
  },
];

const UNCERTAINTY_BLOCKER_SECTIONS = new Set<NormalizedIdeaSection>([
  "One-Sentence Idea",
  "Target Customer",
  "Problem Or Desire",
  "Proposed Solution",
  "Value Outcome",
  "Payer",
  "Current Alternative",
  "First Testable Version",
]);

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function validationIssueToReadinessIssue(issue: NormalizedIdeaValidationIssue): IdeaReadinessIssue {
  return {
    severity: issue.code === "legacy_section" || issue.code === "extra_section" ? "warning" : "blocker",
    code: issue.code,
    section: issue.section,
    message: issue.message,
    suggestion:
      issue.code === "legacy_section"
        ? "Remove Founder Fit Notes from normalized.md and pass Founder Profile explicitly during final analysis."
        : undefined,
  };
}

function isGeneric(rule: FieldRule, value: string) {
  const normalized = value.trim();
  return (
    (rule.minimumWords !== undefined && wordCount(normalized) < rule.minimumWords) ||
    rule.genericPatterns.some((pattern) => pattern.test(normalized))
  );
}

function evaluateParsedIdea(parsed: NormalizedIdea) {
  const blockers: IdeaReadinessIssue[] = [];
  const warnings: IdeaReadinessIssue[] = [];
  const suggestions: IdeaReadinessIssue[] = [];

  for (const rule of FIELD_RULES) {
    const value = parsed.fields[rule.field];

    if (UNCERTAINTY_PATTERN.test(value) && UNCERTAINTY_BLOCKER_SECTIONS.has(rule.section)) {
      blockers.push({
        severity: "blocker",
        code: "uncertain_required_field",
        section: rule.section,
        message: `${rule.section} contains explicit uncertainty that must be resolved before final analysis.`,
        suggestion: rule.suggestion,
      });
      continue;
    }

    if (isGeneric(rule, value)) {
      blockers.push({
        severity: "blocker",
        code: rule.genericCode,
        section: rule.section,
        message: `${rule.section} is too vague or generic for final analysis.`,
        suggestion: rule.suggestion,
      });
    }
  }

  if (NO_EVIDENCE_PATTERN.test(parsed.fields.evidence)) {
    warnings.push({
      severity: "warning",
      code: "no_evidence_yet",
      section: "Evidence",
      message: "Evidence explicitly says there is no validation evidence yet; analysis can proceed with lower confidence.",
      suggestion: "Capture any customer conversations, observed behavior, search demand, or manual tests as soon as available.",
    });
  } else if (wordCount(parsed.fields.evidence) < 7) {
    warnings.push({
      severity: "warning",
      code: "thin_evidence",
      section: "Evidence",
      message: "Evidence is present but thin, so final analysis confidence may be limited.",
      suggestion: "Add the strongest concrete signal or state explicitly that there is no evidence yet.",
    });
  }

  if (wordCount(parsed.fields.openQuestions) < 5) {
    warnings.push({
      severity: "warning",
      code: "thin_open_questions",
      section: "Open Questions",
      message: "Open Questions is present but may not capture enough known uncertainty.",
      suggestion: "List the biggest unknowns that final analysis should treat carefully.",
    });
  }

  if (parsed.legacySections.length > 0) {
    suggestions.push({
      severity: "suggestion",
      code: "legacy_section_cleanup",
      section: "Founder Fit Notes",
      message: "Clean up legacy Founder Fit Notes when convenient.",
      suggestion: "Keep founder context in the explicit Founder Profile input instead of normalized.md.",
    });
  }

  if (blockers.length === 0) {
    suggestions.push({
      severity: "suggestion",
      code: "next_step_ready",
      message: "Final analysis may run because readiness has zero blockers.",
      suggestion: "Pass the normalized idea plus explicit Founder Profile content/path into the final analysis flow.",
    });
  }

  return { blockers, warnings, suggestions };
}

function emptyResult(generatedAt = new Date().toISOString()): IdeaReadinessResult {
  return {
    contract: "idea-readiness",
    schemaVersion: IDEA_READINESS_SCHEMA_VERSION,
    normalizedIdeaSchemaVersion: NORMALIZED_IDEA_SCHEMA_VERSION,
    generatedAt,
    readyForFinalAnalysis: false,
    blockers: [],
    warnings: [],
    suggestions: [],
  };
}

export function checkIdeaReadiness(input: string | NormalizedIdea): IdeaReadinessResult {
  const result = emptyResult();

  if (typeof input === "string") {
    const validation = validateNormalizedIdeaMarkdown(input);
    result.blockers.push(
      ...validation.errors.map((issue) => validationIssueToReadinessIssue(issue))
    );
    result.warnings.push(
      ...validation.warnings.map((issue) => validationIssueToReadinessIssue(issue))
    );

    if (!validation.parsed) {
      result.readyForFinalAnalysis = false;
      return result;
    }

    const evaluated = evaluateParsedIdea(validation.parsed);
    result.blockers.push(...evaluated.blockers);
    result.warnings.push(...evaluated.warnings);
    result.suggestions.push(...evaluated.suggestions);
  } else {
    const evaluated = evaluateParsedIdea(input);
    result.blockers.push(...evaluated.blockers);
    result.warnings.push(...evaluated.warnings);
    result.suggestions.push(...evaluated.suggestions);
  }

  result.readyForFinalAnalysis = result.blockers.length === 0;
  return result;
}
