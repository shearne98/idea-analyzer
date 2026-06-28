# Idea Analyzer

Idea Analyzer provides a reusable business idea analysis engine, a website surface, and a file-based command for Hearne OS workflows.

## Current capabilities

- Runs an Idea analysis run through the shared analyzer core.
- Produces the canonical structured analysis response contract used by both the website and file workflows.
- Renders completed canonical analysis output to human-readable markdown with stable headings for Obsidian, Hearne OS, future AI ingestion, and lightweight parsing.
- Preserves the website as a secondary surface for paste-and-analyze, clarification intake, completed Idea Assessment display, Validation Plan, Critical Risks & Unknowns, After Validation, Recommended Strategy, and development output tools.

## Hearne OS file workflow boundary

Hearne OS owns Business idea workspaces. The workspace artifacts `source.md`, `normalized.md`, `analysis.json`, and `analysis.md` live in Hearne OS, not inside Idea Analyzer. Idea Analyzer should not create, scaffold, or take ownership of those workspaces.

Idea Analyzer owns `normalized.md -> analysis.json -> analysis.md`: given an explicit Hearne OS `normalized.md` input path, it runs an Idea analysis run through the shared analyzer core, writes canonical `analysis.json`, and renders `analysis.md` from that same structured output.

Hearne OS owns the surrounding workflow responsibilities: Notion import, Business idea workspace scaffolding, normalization interviews that produce `normalized.md`, `workspace.md`, and future ranking workflows. Do not add Notion import behavior or Hearne OS workspace ownership to this repo.

The website remains a secondary surface over the same analyzer core and canonical response contract. It should continue to support paste-and-analyze, clarification intake, completed Idea Assessment display, Validation Plan, Critical Risks & Unknowns, After Validation, Recommended Strategy, and development output tools.

## Normalized idea v1 contract

Idea Analyzer owns the schema for analysis-ready normalized idea markdown. Hearne OS owns the `normalized.md` file location, workspace layout, Notion import, and approval flow around file edits. Other callers can pass normalized markdown directly without matching the Hearne OS folder structure.

A v1 normalized idea must declare:

```markdown
idea_analyzer_schema_version: 1
```

Required sections:

1. One-Sentence Idea
2. Target Customer
3. Problem Or Desire
4. Proposed Solution
5. Value Outcome
6. Payer
7. Current Alternative
8. First Testable Version
9. Evidence
10. Assumptions
11. Open Questions

All required sections must be present and non-empty. Idea Analyzer parses these sections into a structured representation and validates the schema version before file-based analysis and readiness runs. Unknown extra sections are preserved as non-contract metadata warnings rather than v1 fields.

`Founder Fit Notes` is deprecated in normalized markdown because founder context now comes from an explicit Founder Profile input during final analysis. Pass Founder Profile markdown/path explicitly to the final analysis flow instead of embedding founder context in `normalized.md`.

## Readiness checks

Readiness is a first-class Idea Analyzer contract for deciding whether normalized idea content is specific and complete enough for final analysis. It evaluates only normalized idea markdown or a parsed normalized idea object; it does not read `source.md`, Founder Profile, current working directory, or Hearne OS workspace paths.

The callable API is:

```ts
import { checkIdeaReadiness } from "@/lib/idea-readiness";

const readiness = checkIdeaReadiness(normalizedMarkdownOrParsedIdea);
```

The returned `readiness.json`-compatible object includes:

- `contract: "idea-readiness"`
- `schemaVersion: 1`
- `normalizedIdeaSchemaVersion: 1`
- `readyForFinalAnalysis` — true when there are zero blockers
- `blockers` — issues that prevent final analysis
- `warnings` — limitations that allow analysis but lower confidence
- `suggestions` — optional next improvements

Missing or empty required sections become blockers. Vague, generic, or explicitly unresolved core fields such as `Target Customer: everyone`, `Problem Or Desire: they need productivity`, `Proposed Solution: an app`, `Value Outcome: saves time`, or `Payer: unknown` also become blockers. Explicit no-evidence cases are warnings rather than blockers so final analysis can proceed with lower confidence when the rest of the normalized idea is specific.

Use the CLI when Hearne OS or another caller wants a `readiness.json` artifact:

```bash
npm run readiness:check -- \
  --input /path/to/normalized.md \
  --output /path/to/readiness.json
```

## Intake contract

Intake turns readiness gaps into guided questions and proposed normalized-field updates. It treats `normalized.md` as the primary source of truth, may use `source.md` text as supporting context, and never writes Hearne OS files directly.

The callable API is:

```ts
import { createIdeaIntake, renderNormalizedIdeaWithUpdates } from "@/lib/idea-intake";

const intake = createIdeaIntake({
  normalizedIdea: normalizedMarkdownOrParsedIdea,
  sourceMaterial: optionalSourceMarkdown,
  answers: {
    targetCustomer: "Specific answer approved by the user",
  },
});

const draftMarkdown = renderNormalizedIdeaWithUpdates(
  normalizedMarkdown,
  intake.proposedUpdates
);
```

The returned contract includes:

- `contract: "idea-intake"`
- `schemaVersion: 1`
- `readiness` — the underlying readiness result
- `questions` — guided questions for missing, empty, weak, vague, or warning-level normalized fields
- `proposedUpdates` — targeted field updates with `section`, `field`, `currentValue`, `proposedValue`, `source`, and `rationale`
- `normalizedIdeaAfterProposedUpdates` — an in-memory parsed preview when updates exist

Callers are responsible for showing proposed updates to the user and applying approved changes to files. The existing website clarification path uses the shared intake clarification helper so paste-and-analyze still asks for more context before analysis when the raw idea is too vague.

## Refresh-normalized contract

Refresh-normalized handles the workflow where source material is updated later, such as when Hearne OS re-imports a richer `source.md` from Notion, while an existing `normalized.md` is already mature. It compares updated source material against the current normalized idea and returns targeted reviewable changes rather than restarting intake or mutating files directly.

The callable API is:

```ts
import { createRefreshNormalized } from "@/lib/idea-refresh-normalized";

const refresh = createRefreshNormalized({
  existingNormalizedIdea: normalizedMarkdownOrParsedIdea,
  updatedSourceMaterial: updatedSourceMarkdown,
});
```

The returned contract includes:

- `contract: "refresh-normalized"`
- `schemaVersion: 1`
- `readiness` — readiness for the existing normalized idea
- `proposedUpdates` — targeted field updates from new source details with `section`, `field`, `currentValue`, `proposedValue`, `source`, and `rationale`
- `warnings` — conflicts where source material appears to contradict mature normalized content
- `questions` — confirmation questions for conflicts instead of silent overwrites
- `normalizedIdeaAfterProposedUpdates` and `readinessAfterProposedUpdates` when proposed updates exist

Callers should show proposed updates, warnings, and questions to the user for approval. No-op source refreshes return no updates. Mature normalized content is preserved unless the updated source contains a clear new detail or an explicit review question is needed.

## External execution packet contract

External execution packets let a backend such as Hermes/Codex execute Idea Analyzer-defined model tasks without Idea Analyzer importing or depending on that backend. The same contracts can also be used by the website/local-model path, because the packet describes the task, input, prompt, expected response, schema versions, backend metadata, and run identity independently of any execution engine.

The callable API is:

```ts
import {
  buildExternalExecutionPacket,
  validateExternalExecutionResponse,
} from "@/lib/external-execution";

const packet = buildExternalExecutionPacket({
  task: "analysis",
  runId: "run-2026-06-28",
  backend: {
    kind: "external_model",
    id: "hermes-codex",
    label: "Hermes/Codex",
    model: "gpt-5.5",
  },
  input: {
    normalizedIdeaMarkdown,
    founderProfileMarkdown,
    readiness,
  },
});

const validation = validateExternalExecutionResponse(packet, modelResponseJson);
```

Supported packet tasks:

- `readiness` — input: `normalizedIdeaMarkdown`; output contract: `idea-readiness`.
- `intake` — input: `normalizedIdeaMarkdown`, optional `sourceMaterial`, and optional approved `answers`; output contract: `idea-intake`.
- `refresh-normalized` — input: `existingNormalizedIdeaMarkdown` and `updatedSourceMaterial`; output contract: `refresh-normalized`.
- `analysis` — input: `normalizedIdeaMarkdown`, explicit `founderProfileMarkdown`, and optional readiness result; output contract: canonical analysis/clarification response.

Each packet includes:

- `contract: "idea-analyzer.external-execution.packet"`
- `contractVersion: 1`
- `packetId`, `runId`, `task`, and `createdAt`
- `backend` metadata such as backend kind, id, label, and model
- `protocol` metadata for normalized idea, readiness, intake, refresh-normalized, and analysis response schema versions
- `prompt.system` and `prompt.user` generated by Idea Analyzer rather than the external backend
- `expectedResponse` with the external response contract and task-specific output contract

External responses must use `contract: "idea-analyzer.external-execution.response"`, repeat the matching `contractVersion`, `packetId`, `runId`, `task`, and `backend`, include an ISO `generatedAt`, and return the task-specific output object. `validateExternalExecutionResponse` rejects malformed or incomplete responses with clear validation errors, including packet/task/backend mismatches, missing timestamps, wrong schema versions, incomplete readiness arrays, and partial analysis JSON.

This is an adapter boundary only. It introduces no direct Hermes dependency; Hearne OS or another orchestrator is responsible for sending the packet to Hermes/Codex, local Ollama, or any other backend and then storing packet/response artifacts in run history.

## File-based Idea analysis runs

Use the file command when Hearne OS has already produced a normalized Business idea markdown file:

```bash
npm run analyze:file -- \
  --input /path/to/normalized.md \
  --analysis-json /path/to/analysis.json \
  --analysis-md /path/to/analysis.md
```

Optional configuration:

- `--mode <mode-id>` uses one of the supported analysis modes.
- `--model <ollama-model>` overrides the model when supported.
- `--deep-thinking true|false` overrides thinking mode.

The command fails clearly for missing input, unsupported configuration, local model/analysis failures, and clarification responses that are not completed analyses. It writes final artifacts only after both outputs are prepared, so failed runs do not leave misleading new analysis files.

## Development evaluation tools

The collapsed **Development controls** and **Development output tools** are for comparing Idea analysis run quality while building the analyzer. They are not part of the intended final customer experience.

- Add human-readable regression prompts to the root-level `test-cases` file using `Test Case N.` headings. The app reads them automatically.
- The maintained regression set includes the basketball platform, compliance service, and deliberately vague idea.
- Saved outputs are written as complete JSON files under `saved-analyses/`, so they persist across browser and PC restarts.
- Historical saved outputs using retired response fields are migrated to the canonical response contract when they are listed.
- Saved runs can be reopened, downloaded, or deleted from the development output tools.
- Comparison metadata includes analysis version, code version, model, deep-thinking setting, temperature, seed, timings, and token metrics.
- Existing browser-only saves are migrated to project-local files when the saved-runs panel first loads.

## Website development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to use the website surface.

## Verification

Run these before committing analyzer or documentation changes:

```bash
npm test
npm run lint
npm run build
```
