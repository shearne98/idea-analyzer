import type { IntakeFieldKey } from "@/lib/analysis-types";
import { checkIdeaReadiness, type IdeaReadinessResult } from "@/lib/idea-readiness";
import {
  NORMALIZED_IDEA_REQUIRED_SECTIONS,
  NORMALIZED_IDEA_SCHEMA_VERSION,
  parseNormalizedIdeaMarkdown,
  type NormalizedIdea,
  type NormalizedIdeaFields,
  type NormalizedIdeaSection,
} from "@/lib/normalized-idea";

export const IDEA_INTAKE_SCHEMA_VERSION = 1;

export type IdeaIntakeQuestion = {
  id: string;
  section: NormalizedIdeaSection;
  field: keyof NormalizedIdeaFields;
  question: string;
  reason: string;
};

export type IdeaIntakeProposedUpdate = {
  section: NormalizedIdeaSection;
  field: keyof NormalizedIdeaFields;
  currentValue: string;
  proposedValue: string;
  source: "user_answer" | "source_material";
  rationale: string;
};

export type IdeaIntakeInput = {
  normalizedIdea: string | NormalizedIdea;
  sourceMaterial?: string;
  answers?: Partial<Record<keyof NormalizedIdeaFields, string>>;
};

export type IdeaIntakeResult = {
  contract: "idea-intake";
  schemaVersion: typeof IDEA_INTAKE_SCHEMA_VERSION;
  normalizedIdeaSchemaVersion: typeof NORMALIZED_IDEA_SCHEMA_VERSION;
  generatedAt: string;
  readiness: IdeaReadinessResult;
  questions: IdeaIntakeQuestion[];
  proposedUpdates: IdeaIntakeProposedUpdate[];
  normalizedIdeaAfterProposedUpdates?: NormalizedIdea;
};

export type IntakeClarification = {
  reason: string;
  missingFields: IntakeFieldKey[];
  clarifyingQuestions: string[];
  possibleDirections: string[];
};

type WebsiteClarificationInput = {
  idea: string;
  reason?: string;
  missingFields?: IntakeFieldKey[];
  modelQuestions?: string[];
  possibleDirections?: string[];
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

const FIELD_TO_SECTION = Object.fromEntries(
  Object.entries(SECTION_TO_FIELD).map(([section, field]) => [field, section])
) as Record<keyof NormalizedIdeaFields, NormalizedIdeaSection>;

const QUESTION_BY_FIELD: Record<keyof NormalizedIdeaFields, string> = {
  oneSentenceIdea:
    "What is the idea in one concrete sentence that names the customer, problem, solution shape, and outcome?",
  targetCustomer:
    "Who is the narrow first target customer, including their role, context, or buying situation?",
  problemOrDesire:
    "What concrete pain, desire, trigger, frequency, and consequence does this customer experience?",
  proposedSolution: "What does the first solution actually do for the customer?",
  valueOutcome: "What measurable or observable outcome improves for the customer?",
  payer: "Who pays, in what buying context, and through what likely payment model?",
  currentAlternative: "What does the customer use or do today instead, including manual workarounds?",
  firstTestableVersion:
    "What is the smallest concrete test, who participates, and what observable signal defines success?",
  evidence: "What evidence exists now, or should this explicitly say there is no evidence yet?",
  assumptions: "What riskiest beliefs must be true for this idea to work?",
  openQuestions: "What are the biggest known unknowns that analysis should treat carefully?",
};

const WEBSITE_FIELD_QUESTIONS: Record<IntakeFieldKey, string> = {
  targetCustomer: "Who specifically experiences this problem or desire?",
  problemOrDesire: "What painful, frequent, or valuable situation are they trying to improve?",
  proposedSolution: "What rough solution are you imagining?",
  valueOutcome: "What would improve for them if this worked?",
  payer: "Who would pay for this, and why would it be worth paying for?",
  currentAlternative: "What do they use or do today instead?",
  mvpAngle: "What is the smallest manual or cheap test you could run first?",
};

function isNormalizedSection(value: string): value is NormalizedIdeaSection {
  return NORMALIZED_IDEA_REQUIRED_SECTIONS.some((section) => section === value);
}

function emptyFields() {
  return Object.fromEntries(
    NORMALIZED_IDEA_REQUIRED_SECTIONS.map((section) => [SECTION_TO_FIELD[section], ""])
  ) as NormalizedIdeaFields;
}

function parseSections(markdown: string) {
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

  return sections;
}

function parseBestEffortNormalizedIdea(input: string | NormalizedIdea): NormalizedIdea {
  if (typeof input !== "string") return input;

  try {
    return parseNormalizedIdeaMarkdown(input);
  } catch {
    const sections = parseSections(input);
    const fields = emptyFields();
    for (const section of NORMALIZED_IDEA_REQUIRED_SECTIONS) {
      fields[SECTION_TO_FIELD[section]] = sections.get(section)?.trim() ?? "";
    }
    return {
      schemaVersion: NORMALIZED_IDEA_SCHEMA_VERSION,
      fields,
      legacySections: sections.has("Founder Fit Notes") ? ["Founder Fit Notes"] : [],
      extraSections: [...sections.keys()].filter(
        (section) => !isNormalizedSection(section) && section !== "Founder Fit Notes"
      ),
    };
  }
}

function dedupeQuestions(questions: IdeaIntakeQuestion[]) {
  const seen = new Set<keyof NormalizedIdeaFields>();
  return questions.filter((question) => {
    if (seen.has(question.field)) return false;
    seen.add(question.field);
    return true;
  });
}

function questionsFromReadiness(readiness: IdeaReadinessResult) {
  return dedupeQuestions(
    [...readiness.blockers, ...readiness.warnings]
      .filter((issue) => issue.section && isNormalizedSection(issue.section))
      .map((issue) => {
        const section = issue.section as NormalizedIdeaSection;
        const field = SECTION_TO_FIELD[section];
        return {
          id: `intake-${field}`,
          section,
          field,
          question: QUESTION_BY_FIELD[field],
          reason: issue.message,
        };
      })
  );
}

function normalizedAnswerUpdates(
  parsed: NormalizedIdea,
  answers: IdeaIntakeInput["answers"]
): IdeaIntakeProposedUpdate[] {
  if (!answers) return [];

  return Object.entries(answers).flatMap(([field, value]) => {
    const typedField = field as keyof NormalizedIdeaFields;
    const proposedValue = value.trim();
    if (!proposedValue || !(typedField in FIELD_TO_SECTION)) return [];
    const currentValue = parsed.fields[typedField];
    if (currentValue.trim() === proposedValue) return [];
    return [
      {
        section: FIELD_TO_SECTION[typedField],
        field: typedField,
        currentValue,
        proposedValue,
        source: "user_answer" as const,
        rationale: "User-provided answer fills or strengthens this normalized idea field.",
      },
    ];
  });
}

function sourceMaterialUpdates(parsed: NormalizedIdea, sourceMaterial?: string): IdeaIntakeProposedUpdate[] {
  const source = sourceMaterial?.trim();
  if (!source) return [];

  const updates: IdeaIntakeProposedUpdate[] = [];
  const firstTestMatch = source.match(
    /(?:first test|smallest test|test should be|mvp|pilot)[^.!?]*(?:[.!?]|$)/i
  );
  if (firstTestMatch) {
    const proposedValue = firstTestMatch[0].trim();
    if (proposedValue && !parsed.fields.firstTestableVersion.includes(proposedValue)) {
      updates.push({
        section: "First Testable Version",
        field: "firstTestableVersion",
        currentValue: parsed.fields.firstTestableVersion,
        proposedValue,
        source: "source_material",
        rationale:
          "Source material mentions a concrete first-test detail; propose it as a targeted update for review.",
      });
    }
  }

  const evidenceMatch = source.match(
    /(?:paid|pay|payment|customer|interview|observed|tested)[^.!?]*(?:[.!?]|$)/i
  );
  if (evidenceMatch && !firstTestMatch?.[0].includes(evidenceMatch[0])) {
    const proposedValue = evidenceMatch[0].trim();
    if (proposedValue && !parsed.fields.evidence.includes(proposedValue)) {
      updates.push({
        section: "Evidence",
        field: "evidence",
        currentValue: parsed.fields.evidence,
        proposedValue,
        source: "source_material",
        rationale:
          "Source material includes evidence-like detail; propose it without overwriting normalized content automatically.",
      });
    }
  }

  return updates;
}

function applyUpdatesToParsedIdea(parsed: NormalizedIdea, updates: IdeaIntakeProposedUpdate[]) {
  if (updates.length === 0) return undefined;

  const fields = { ...parsed.fields };
  for (const update of updates) {
    fields[update.field] = update.proposedValue;
  }
  return { ...parsed, fields };
}

export function createIdeaIntake(input: IdeaIntakeInput): IdeaIntakeResult {
  const readiness = checkIdeaReadiness(input.normalizedIdea);
  const parsed = parseBestEffortNormalizedIdea(input.normalizedIdea);
  const proposedUpdates = [
    ...normalizedAnswerUpdates(parsed, input.answers),
    ...sourceMaterialUpdates(parsed, input.sourceMaterial),
  ];

  return {
    contract: "idea-intake",
    schemaVersion: IDEA_INTAKE_SCHEMA_VERSION,
    normalizedIdeaSchemaVersion: NORMALIZED_IDEA_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    readiness,
    questions: questionsFromReadiness(readiness),
    proposedUpdates,
    normalizedIdeaAfterProposedUpdates: applyUpdatesToParsedIdea(parsed, proposedUpdates),
  };
}

export function renderNormalizedIdeaWithUpdates(
  normalizedIdeaMarkdown: string,
  updates: IdeaIntakeProposedUpdate[]
) {
  let rendered = normalizedIdeaMarkdown;

  for (const update of updates) {
    const sectionPattern = new RegExp(
      `(^#{1,6}\\s+${update.section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n)([\\s\\S]*?)(?=\\n#{1,6}\\s+|$)`,
      "m"
    );
    if (sectionPattern.test(rendered)) {
      rendered = rendered.replace(sectionPattern, `$1${update.proposedValue.trim()}\n`);
    } else {
      rendered = `${rendered.trimEnd()}\n\n# ${update.section}\n${update.proposedValue.trim()}\n`;
    }
  }

  return rendered;
}

export function buildIntakeClarification(input: WebsiteClarificationInput): IntakeClarification {
  const missingFields: IntakeFieldKey[] = input.missingFields?.length
    ? input.missingFields
    : ["targetCustomer", "problemOrDesire", "proposedSolution", "valueOutcome", "payer"];
  const fallbackQuestions = missingFields.map((field) => WEBSITE_FIELD_QUESTIONS[field]);

  const clarifyingQuestions = Array.from(
    new Set([...(input.modelQuestions ?? []), ...fallbackQuestions])
  ).slice(0, Math.max(3, input.modelQuestions?.length ?? 0));

  return {
    reason:
      input.reason?.trim() ||
      "This idea is too vague to analyze without inventing important business assumptions.",
    missingFields,
    clarifyingQuestions,
    possibleDirections:
      input.possibleDirections && input.possibleDirections.length > 0
        ? input.possibleDirections
        : [
            `A consumer-facing version of ${input.idea}`,
            `A service-based version of ${input.idea}`,
            `A business or organization-focused version of ${input.idea}`,
          ],
  };
}

export function combineIdeaWithClarification(originalIdea: string, addedContext: string) {
  return `${originalIdea.trim()}\n\nAdditional context:\n${addedContext.trim()}`;
}
