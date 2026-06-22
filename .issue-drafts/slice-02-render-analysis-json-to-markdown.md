## Parent

Parent PRD: #20

## What to build

Add a reusable markdown renderer for the canonical analysis output. Given a completed canonical analysis object or JSON artifact, produce a human-readable `analysis.md` report with stable headings suitable for Hearne OS, Obsidian, future AI ingestion, and lightweight parsing.

The markdown report is a rendered artifact. It must be generated from the canonical structured analysis output, not directly from model text and not by scraping the website UI.

## Acceptance criteria

- [ ] A completed canonical analysis output can be rendered to markdown.
- [ ] The markdown includes stable headings for the major existing concepts: verdict, Strongest Version, First Testable Version, Idea Assessment, Critical Risks & Unknowns, Validation Plan, After Validation, and Recommended Strategy.
- [ ] The markdown includes the four Idea Assessment areas: Founder Fit, Pain / Desire, MVP Testability, and Commercial Potential.
- [ ] The markdown includes enough run metadata to compare analysis version, code version, model, thinking mode, seed, and temperature.
- [ ] Renderer tests assert meaningful sections and representative content without snapshotting fragile full-report whitespace.

## Blocked by

- #21
