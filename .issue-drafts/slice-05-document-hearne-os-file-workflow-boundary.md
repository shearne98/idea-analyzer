## Parent

Parent PRD: #20

## What to build

Document the Hearne OS file workflow boundary for Business idea analysis. Make it clear that `source.md`, `normalized.md`, `analysis.json`, and `analysis.md` live inside Hearne OS Business idea workspaces, while Idea Analyzer provides the reusable analysis engine, file-based command, canonical JSON output, markdown renderer, and website surface.

The documentation should prevent future agents from moving Hearne OS workspace ownership into Idea Analyzer or adding Notion import behavior to this repo.

## Acceptance criteria

- [ ] Documentation states that Hearne OS owns Business idea workspaces.
- [ ] Documentation states that `source.md`, `normalized.md`, `analysis.json`, and `analysis.md` live in Hearne OS, not inside Idea Analyzer.
- [ ] Documentation states that Idea Analyzer owns `normalized.md -> analysis.json -> analysis.md`.
- [ ] Documentation states that Hearne OS owns Notion import, workspace scaffolding, normalization interviews, `workspace.md`, and future ranking workflows.
- [ ] Documentation preserves the website as a secondary surface over the same analyzer core.
- [ ] Documentation uses the project glossary terms: Idea analysis run, Idea Assessment, Validation Plan, After Validation, and Critical Risks & Unknowns where relevant.

## Blocked by

- #23
