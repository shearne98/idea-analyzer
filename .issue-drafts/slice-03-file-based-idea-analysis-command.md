## Parent

Parent PRD: #20

## What to build

Add a file-based Idea analysis run command for Hearne OS workflows. Given a Hearne OS `normalized.md` file, run the existing Idea analysis run core and write the canonical `analysis.json` plus rendered `analysis.md` to explicit output paths inside the relevant Hearne OS Business idea workspace.

The command should make Hearne OS the primary non-browser workflow without removing or replacing the existing website.

## Acceptance criteria

- [ ] The command accepts an explicit normalized markdown input path.
- [ ] The command accepts explicit output paths for `analysis.json` and `analysis.md`.
- [ ] The command runs the same Idea analysis run core used by the website.
- [ ] On successful completed analysis, the command writes `analysis.json` using the canonical analysis response contract.
- [ ] On successful completed analysis, the command writes `analysis.md` by rendering `analysis.json`.
- [ ] The command supports a sensible default analysis mode while still allowing model/thinking-mode configuration where practical.
- [ ] Missing input paths fail clearly.
- [ ] Local model or analysis failures fail clearly and do not leave misleading new analysis artifacts.
- [ ] Tests cover successful file workflow behavior and key failure paths with controlled model responses.

## Blocked by

- #22
