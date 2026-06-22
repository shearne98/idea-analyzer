## Parent

Parent PRD: #20

## What to build

Preserve the existing website analyzer behavior on top of the shared analyzer contract after the file-based workflow is added. The website remains a secondary surface, but it should still support paste-and-analyze, clarification intake, completed Idea Assessment display, Validation Plan, Critical Risks & Unknowns, After Validation, and development output tools.

This slice verifies that the new Hearne OS-oriented file path has not split the product logic or degraded the existing website experience.

## Acceptance criteria

- [ ] The website API still calls the shared Idea analysis run core.
- [ ] The website still handles clarification responses.
- [ ] The website still renders completed analysis responses.
- [ ] The website still displays Idea Assessment areas, Validation Plan, Critical Risks & Unknowns, After Validation, and Recommended Strategy.
- [ ] Saved analysis/development tooling remains compatible with the canonical response contract.
- [ ] Regression coverage proves the website path still consumes the shared analysis contract after the file command exists.

## Blocked by

- #23
