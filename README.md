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
