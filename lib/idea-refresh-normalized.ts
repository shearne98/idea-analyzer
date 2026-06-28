import { checkIdeaReadiness, type IdeaReadinessResult } from "@/lib/idea-readiness";
import {
  NORMALIZED_IDEA_SCHEMA_VERSION,
  parseNormalizedIdeaMarkdown,
  type NormalizedIdea,
  type NormalizedIdeaFields,
  type NormalizedIdeaSection,
} from "@/lib/normalized-idea";

export const REFRESH_NORMALIZED_SCHEMA_VERSION = 1;

type NormalizedField = Extract<keyof NormalizedIdeaFields, string>;

export type RefreshNormalizedProposedUpdate = {
  section: NormalizedIdeaSection;
  field: NormalizedField;
  currentValue: string;
  proposedValue: string;
  source: "updated_source_material";
  rationale: string;
};

export type RefreshNormalizedWarning = {
  code: "source_conflicts_with_normalized_content";
  section: NormalizedIdeaSection;
  field: NormalizedField;
  currentValue: string;
  sourceValue: string;
  message: string;
};

export type RefreshNormalizedQuestion = {
  id: string;
  section: NormalizedIdeaSection;
  field: NormalizedField;
  question: string;
  reason: string;
};

export type RefreshNormalizedInput = {
  existingNormalizedIdea: string | NormalizedIdea;
  updatedSourceMaterial: string;
};

export type RefreshNormalizedResult = {
  contract: "refresh-normalized";
  schemaVersion: typeof REFRESH_NORMALIZED_SCHEMA_VERSION;
  normalizedIdeaSchemaVersion: typeof NORMALIZED_IDEA_SCHEMA_VERSION;
  generatedAt: string;
  readiness: IdeaReadinessResult;
  proposedUpdates: RefreshNormalizedProposedUpdate[];
  warnings: RefreshNormalizedWarning[];
  questions: RefreshNormalizedQuestion[];
  normalizedIdeaAfterProposedUpdates?: NormalizedIdea;
  readinessAfterProposedUpdates?: IdeaReadinessResult;
};

type Candidate = {
  section: NormalizedIdeaSection;
  field: NormalizedField;
  value: string;
  rationale: string;
};

const SECTION_TO_FIELD: Record<NormalizedIdeaSection, NormalizedField> = {
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

const FIELD_TO_SECTION = Object.fromEntries(
  Object.entries(SECTION_TO_FIELD).map(([section, field]) => [field, section])
) as Record<NormalizedField, NormalizedIdeaSection>;

const EXPLICIT_SECTION_PATTERNS: Array<{
  section: NormalizedIdeaSection;
  pattern: RegExp;
}> = [
  { section: "Target Customer", pattern: /target customer\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Problem Or Desire", pattern: /problem(?: or desire)?\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Proposed Solution", pattern: /(?:proposed )?solution\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Value Outcome", pattern: /value outcome\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Payer", pattern: /payer\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Current Alternative", pattern: /current alternative\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "First Testable Version", pattern: /first testable version\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Evidence", pattern: /evidence\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Assumptions", pattern: /assumptions?\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
  { section: "Open Questions", pattern: /open questions?\s*:\s*([^\n.]+(?:\.[^\n]*)?)/i },
];

function parseExistingNormalizedIdea(input: string | NormalizedIdea) {
  return typeof input === "string" ? parseNormalizedIdeaMarkdown(input) : input;
}

function normalizeComparable(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9£$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordSet(value: string) {
  return new Set(normalizeComparable(value).split(" ").filter((word) => word.length > 2));
}

function hasMeaningfulOverlap(left: string, right: string) {
  const leftWords = wordSet(left);
  const rightWords = wordSet(right);
  if (leftWords.size === 0 || rightWords.size === 0) return false;
  const overlap = Array.from(rightWords).filter((word) => leftWords.has(word)).length;
  return overlap >= Math.min(4, rightWords.size) || overlap / rightWords.size >= 0.45;
}

function sourceAlreadyCovered(existingValue: string, candidateValue: string) {
  const existing = normalizeComparable(existingValue);
  const candidate = normalizeComparable(candidateValue);
  return existing.includes(candidate) || candidate.includes(existing) || hasMeaningfulOverlap(existing, candidate);
}

function isConflictCandidate(source: string, value: string) {
  return /\b(?:not|instead of|rather than|no longer|changed from|but not)\b/i.test(source) ||
    /\bnot\b/i.test(value);
}

function sentenceMatching(source: string, pattern: RegExp) {
  const match = source.match(pattern);
  return match?.[0].trim();
}

function collectSourceCandidates(source: string): Candidate[] {
  const candidates: Candidate[] = [];

  for (const { section, pattern } of EXPLICIT_SECTION_PATTERNS) {
    const match = source.match(pattern);
    const value = match?.[1]?.trim();
    if (value) {
      candidates.push({
        section,
        field: SECTION_TO_FIELD[section],
        value,
        rationale: `Updated source material explicitly mentions ${section}.`,
      });
    }
  }

  const firstTest = sentenceMatching(
    source,
    /(?:smallest test|first test|test should be|mvp|pilot)[^.!?]*(?:[.!?]|$)/i
  );
  if (firstTest) {
    candidates.push({
      section: "First Testable Version",
      field: "firstTestableVersion",
      value: firstTest,
      rationale:
        "Updated source material adds a concrete first-test detail that may improve the normalized idea.",
    });
  }

  const evidence = sentenceMatching(
    source,
    /(?:evidence|paid|pay|offered to pay|customer|interview|observed|tested)[^.!?]*(?:[.!?]|$)/i
  );
  if (evidence) {
    candidates.push({
      section: "Evidence",
      field: "evidence",
      value: evidence,
      rationale:
        "Updated source material adds evidence-like detail that may improve the normalized idea.",
    });
  }

  return dedupeCandidates(candidates);
}

function dedupeCandidates(candidates: Candidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.field}:${normalizeComparable(candidate.value)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeFieldValue(currentValue: string, newValue: string) {
  const trimmedNewValue = newValue.trim();
  if (!currentValue.trim()) return trimmedNewValue;
  return `${currentValue.trim()}\n- Refreshed source detail: ${trimmedNewValue}`;
}

function candidateToWarning(parsed: NormalizedIdea, candidate: Candidate): RefreshNormalizedWarning {
  const currentValue = parsed.fields[candidate.field];
  return {
    code: "source_conflicts_with_normalized_content",
    section: candidate.section,
    field: candidate.field,
    currentValue,
    sourceValue: candidate.value,
    message: `Updated source material appears to conflict with the mature normalized ${candidate.section} content; review before changing it.`,
  };
}

function warningToQuestion(warning: RefreshNormalizedWarning): RefreshNormalizedQuestion {
  return {
    id: `refresh-confirm-${warning.field}`,
    section: warning.section,
    field: warning.field,
    question: `Please confirm whether ${warning.section} should change from the current normalized content to the updated source detail, or whether the source note should be ignored.`,
    reason: warning.message,
  };
}

function applyUpdatesToParsedIdea(parsed: NormalizedIdea, updates: RefreshNormalizedProposedUpdate[]) {
  if (updates.length === 0) return undefined;

  const fields = { ...parsed.fields };
  for (const update of updates) {
    fields[update.field] = update.proposedValue;
  }
  return { ...parsed, fields };
}

function buildUpdatesAndWarnings(parsed: NormalizedIdea, source: string) {
  const proposedUpdates: RefreshNormalizedProposedUpdate[] = [];
  const warnings: RefreshNormalizedWarning[] = [];

  for (const candidate of collectSourceCandidates(source)) {
    const currentValue = parsed.fields[candidate.field];
    if (sourceAlreadyCovered(currentValue, candidate.value)) continue;

    if (isConflictCandidate(source, candidate.value) && currentValue.trim()) {
      warnings.push(candidateToWarning(parsed, candidate));
      continue;
    }

    proposedUpdates.push({
      section: FIELD_TO_SECTION[candidate.field],
      field: candidate.field,
      currentValue,
      proposedValue: mergeFieldValue(currentValue, candidate.value),
      source: "updated_source_material",
      rationale: candidate.rationale,
    });
  }

  return { proposedUpdates, warnings };
}

export function createRefreshNormalized(input: RefreshNormalizedInput): RefreshNormalizedResult {
  const parsed = parseExistingNormalizedIdea(input.existingNormalizedIdea);
  const readiness = checkIdeaReadiness(parsed);
  const source = input.updatedSourceMaterial.trim();
  const { proposedUpdates, warnings } = source
    ? buildUpdatesAndWarnings(parsed, source)
    : { proposedUpdates: [], warnings: [] };
  const normalizedIdeaAfterProposedUpdates = applyUpdatesToParsedIdea(parsed, proposedUpdates);

  return {
    contract: "refresh-normalized",
    schemaVersion: REFRESH_NORMALIZED_SCHEMA_VERSION,
    normalizedIdeaSchemaVersion: NORMALIZED_IDEA_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    readiness,
    proposedUpdates,
    warnings,
    questions: warnings.map((warning) => warningToQuestion(warning)),
    normalizedIdeaAfterProposedUpdates,
    readinessAfterProposedUpdates: normalizedIdeaAfterProposedUpdates
      ? checkIdeaReadiness(normalizedIdeaAfterProposedUpdates)
      : undefined,
  };
}
