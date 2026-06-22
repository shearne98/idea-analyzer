## Parent

Parent PRD: #20

## What to build

Separate the reusable analyzer and rendering boundaries enough that the Idea analysis run core, canonical response contract, markdown rendering, and website rendering can evolve without the website being the only usable surface. Preserve the current website behavior while making it clear where non-browser workflows should plug in.

This is a prefactoring slice: make the later file workflow easy by clarifying ownership boundaries, without changing the scoring rubric or adding the Hearne OS command yet.

## Acceptance criteria

- [ ] The Idea analysis run core remains the single owner of model prompting, response normalization, scoring, strategy guidance, Validation Plan, Critical Risks & Unknowns, After Validation, run metadata, and performance metrics.
- [ ] The canonical analysis response contract is reusable by both browser and file-based callers.
- [ ] Website rendering remains a consumer of the canonical analysis response contract rather than the owner of analyzer behavior.
- [ ] The existing website flow still works for paste-and-analyze, clarification, and completed analysis.
- [ ] Tests cover the reusable boundary without relying on browser UI details.

## Blocked by

None - can start immediately
