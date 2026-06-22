## Problem Statement

The Idea Analyzer currently works primarily as a website interaction: Shane pastes a Business idea, optionally answers clarification questions, and receives an Idea Assessment in the web UI. Shane now wants Hearne OS to become the primary way business ideas are analyzed. Business ideas start as rough Notion markdown exports, often too under-specified or inconsistently written to compare fairly. The current website-first shape makes it awkward to take a local `normalized.md` file from a Hearne OS Business idea workspace, run an Idea analysis run, and save durable artifacts that can be read by humans, ingested by AI, and compared against other ideas.

The problem is not that the website is wrong. The existing website view is useful and should be preserved. The problem is that the analyzer needs a file-based path that treats Hearne OS as the main workflow while keeping the website as a secondary surface over the same analyzer core.

## Solution

Add a file-based Idea analysis workflow to Idea Analyzer that accepts a normalized Business idea markdown file, runs the existing Idea analysis run core, writes a canonical structured analysis artifact, and renders a markdown report from that same structured output.

The intended Hearne OS flow is:

1. A Notion Business idea is imported into a Hearne OS Business idea workspace as `source.md`.
2. Shane explicitly runs a normalization interview later, producing a manually editable `normalized.md`.
3. Idea Analyzer reads `normalized.md`.
4. Idea Analyzer writes `analysis.json` as the canonical analysis output.
5. Idea Analyzer writes `analysis.md` as a human-readable markdown rendering of `analysis.json`.
6. The existing website remains available and continues to use the same analyzer core and response contract.

The file workflow should not own Hearne OS importing or workspace scaffolding. Hearne OS owns Business idea workspaces; Idea Analyzer owns analysis execution and rendering from normalized input.

## User Stories

1. As Shane, I want Hearne OS to be the primary surface for business idea analysis, so that I can work from my local knowledge workspace instead of pasting ideas into a website every time.
2. As Shane, I want the existing website analyzer to keep working, so that past work on the interactive report is preserved and remains useful.
3. As Shane, I want to analyze a `normalized.md` file, so that rough Notion dumps can be converted into fair comparable inputs before scoring.
4. As Shane, I want the analyzer to produce `analysis.json`, so that there is a canonical structured output that can be reused by scripts, rankings, tests, and renderers.
5. As Shane, I want the analyzer to produce `analysis.md`, so that I can read the result in Hearne OS or Obsidian without opening the website.
6. As Shane, I want `analysis.md` to be generated from `analysis.json`, so that human-readable reports do not become a second source of truth.
7. As Shane, I want the website view to render from the same analysis shape, so that website and file workflow outputs do not drift.
8. As Shane, I want the analyzer to preserve the current Idea Assessment concepts, so that Founder Fit, Pain / Desire, MVP Testability, and Commercial Potential remain comparable.
9. As Shane, I want the analyzer to preserve Validation Plan behavior, so that each idea still gets a concrete next test rather than only a score.
10. As Shane, I want the analyzer to preserve Critical Risks & Unknowns, so that important uncertainty remains visible in the file-based report.
11. As Shane, I want the analyzer to preserve After Validation guidance, so that a successful first test leads to a disciplined next proof-building cycle.
12. As Shane, I want the analyzer to preserve run metadata, so that I can compare model, code version, thinking mode, seed, and analysis version across runs.
13. As Shane, I want the analyzer to preserve performance metadata, so that development comparison remains possible outside the browser.
14. As Shane, I want the file workflow to fail clearly when the local model service is unavailable, so that I can fix Ollama rather than get a partial artifact.
15. As Shane, I want the file workflow to fail clearly when input paths are missing, so that mistakes in Hearne OS workflow configuration are obvious.
16. As Shane, I want the file workflow to avoid writing misleading analysis files when analysis fails, so that stale reports are not mistaken for current output.
17. As Shane, I want the file workflow to support explicit output paths, so that Hearne OS can place artifacts inside the correct Business idea workspace.
18. As Shane, I want the file workflow to be runnable from the command line, so that Hearne OS workflows and agents can call it without browser interaction.
19. As Shane, I want the markdown renderer to use stable headings, so that future AI ingestion and simple parsing are practical.
20. As Shane, I want the markdown report to be pleasant to read, so that I can use it as a durable artifact rather than a raw JSON dump.
21. As Shane, I want the JSON output to match the existing analysis response contract, so that the website, saved analysis runs, and tests can share behavior.
22. As Shane, I want the file workflow to keep founder-profile behavior consistent with the website, so that Founder Fit is assessed the same way in both surfaces.
23. As Shane, I want missing founder profile behavior to stay conservative, so that Founder Fit is not given a fake numeric score.
24. As Shane, I want the file workflow to use existing analysis modes where practical, so that Balanced and Thorough analysis remain comparable.
25. As Shane, I want the file workflow to support a default model/mode, so that common Hearne OS runs do not require excessive configuration.
26. As Shane, I want file-based analysis to remain compatible with development regression tests, so that quality does not regress as the analyzer is refactored.
27. As a future agent, I want one high-level file workflow seam, so that I can implement and test the feature without scattering behavior across UI internals.
28. As a future agent, I want markdown rendering separated from React rendering, so that `analysis.md` does not require scraping or duplicating browser UI code.
29. As a future agent, I want the website API to call the same analyzer core as the file workflow, so that product logic has one owner.
30. As a future agent, I want the file workflow to be idempotent enough for repeated runs, so that rerunning analysis updates intended outputs without creating surprise duplicate files.
31. As Shane, I want this feature to avoid changing Hearne OS import behavior, so that Notion import remains a separate, cheap scaffolding step.
32. As Shane, I want this feature to avoid auto-filling `normalized.md`, so that normalization remains an explicit interview workflow rather than a side effect of analysis.

## Implementation Decisions

- Hearne OS is the primary product surface for future Business idea analysis work. The existing website remains a secondary surface.
- Idea Analyzer should expose a file-based workflow that reads a normalized Business idea markdown document and writes analysis artifacts.
- The main test seam should be the file workflow: `normalized.md` in, `analysis.json` and `analysis.md` out.
- The existing Idea analysis run core should remain the owner of model prompting, intake behavior, normalization of model output, scoring, strategy guidance, Validation Plan, Critical Risks & Unknowns, After Validation, metadata, and performance metrics.
- `analysis.json` is the canonical analysis output for file-based runs.
- `analysis.md` is generated from `analysis.json`, not directly from the model response.
- The website/HTML view should continue to render from the same structured analysis object, preserving the current interactive report.
- Markdown rendering should be implemented as a reusable renderer from the canonical analysis output.
- The file workflow should be callable without browser interaction, suitable for Hearne OS scripts or agents.
- The file workflow should accept explicit input and output paths.
- The file workflow should preserve conservative founder-profile behavior from the existing analyzer.
- The file workflow should preserve model/settings metadata so development comparison remains possible.
- The file workflow should fail clearly and avoid writing misleading partial artifacts when analysis fails.
- This PRD does not require changing the Hearne OS import workflow; Hearne OS already owns workspace scaffolding and `normalized.md`.
- This PRD does not require generating HTML files. The website view remains the HTML-oriented presentation surface.

## Testing Decisions

- Tests should focus on external behavior: given a normalized markdown input and controlled model responses, the file workflow writes the expected JSON and markdown artifacts.
- The highest-value seam is the file-based Idea analysis run adapter because it represents the feature from Hearne OS's point of view.
- Existing Idea analysis run tests are prior art for mocking model responses and asserting conservative output normalization.
- Existing saved-analysis tests are prior art for validating complete JSON analysis objects across filesystem-backed persistence.
- Renderer tests should assert that a representative analysis object produces markdown with stable headings and key fields, without snapshotting fragile whitespace-heavy reports.
- Error-path tests should assert that missing input, model failure, and non-analysis clarification results are handled clearly.
- Website tests are not the primary focus for this PRD, but existing behavior should remain compatible because the website keeps using the same analyzer core.

## Out of Scope

- Building the Hearne OS normalization interview workflow.
- Filling `normalized.md` from `source.md`.
- Updating the Notion import workflow.
- Publishing analysis artifacts back to Notion.
- Building cross-idea ranking.
- Creating `workspace.md` behavior inside Hearne OS.
- Replacing or removing the existing website interface.
- Generating standalone HTML files from analysis output.
- Changing the scoring rubric beyond what is necessary to support file-based execution.

## Further Notes

The agreed Hearne OS Business idea workspace shape is:

- `source.md`
- `normalized.md`
- `analysis.json`
- `analysis.md`
- `workspace.md`

For this PRD, Idea Analyzer is responsible only for the transition from `normalized.md` to `analysis.json` and `analysis.md`. Hearne OS remains responsible for source import, normalization interviews, workspace ownership, and later ranking workflows.
