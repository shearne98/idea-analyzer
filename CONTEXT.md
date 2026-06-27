# Idea Analyzer

The Idea Analyzer helps a founder turn an early business idea into a clarification interview or a product decision brief.

## Language

**Idea analysis run**:
One complete evaluation of an idea, including automatic founder-profile context, clarification intake, an Idea Assessment, strategy guidance, and performance measurement.
_Avoid_: Analysis request, analyzer pipeline

**Idea Assessment**:
A concise assessment of an idea across Founder Fit, Pain / Desire, MVP Testability, and Commercial Potential. Each area explains its score and its biggest uncertainty.
_Avoid_: Evidence Scores, How To Improve The Evidence

**Validation Plan**:
The single immediate next action recommended by an Idea analysis run. It explicitly addresses the primary Critical Risk or Unknown through the strongest practical real-world test before the founder makes a larger commitment. When plausible, it should be a 7-Day Payment Validation that asks target customers for payment, a deposit, or an equivalent binding financial commitment.
_Avoid_: Recommended next move, Recommended Next Action

**7-Day Payment Validation**:
The preferred Validation Plan when payment or a binding financial commitment can plausibly be requested within seven days. Interest or free engagement alone does not satisfy this form of validation.

**After Validation**:
The conditional proof-building cycle that begins after the Validation Plan succeeds. Its stable principles are to fulfil the validated promise appropriately, learn from real usage, and seek measurable repeated proof that gates the next investment; it names both the proof that unlocks an investment addressing observed friction or customer value and the result that means revise, pause, or stop.
_Avoid_: Roadmap, Next steps, If Validation Succeeds

**Critical Risks & Unknowns**:
The main skeptical diagnosis of the idea: one primary concern most likely to change the current recommendation, plus a small set of secondary known risks or unresolved assumptions that could change a later investment. Each concern explains its decision impact and the stage responsible for addressing it, without creating a separate action plan.
_Avoid_: Key Unknowns, Risks & Assumptions, Most Dangerous Assumption, User Questions, Evidence Needed Before Building

## Development-only evaluation

Human-readable test cases, saved analysis JSON files, model/settings controls, run metadata, and performance metrics support development comparison work. They remain subordinate controls and are out of scope for the intended final customer experience.

## Hearne OS file workflow boundary

Hearne OS owns Business idea workspaces and the workspace artifacts `source.md`, `normalized.md`, `analysis.json`, `analysis.md`, and `workspace.md`. Hearne OS owns Notion import, workspace scaffolding, normalization interviews that produce `normalized.md`, and future ranking workflows.

Idea Analyzer owns the reusable `normalized.md -> analysis.json -> analysis.md` transition: it reads an explicit normalized markdown path, runs the shared Idea analysis run core, writes the canonical JSON response, and renders markdown from that same structured output. The website remains a secondary surface over the same analyzer core and canonical response contract.

Idea Analyzer also owns the v1 normalized idea schema: `idea_analyzer_schema_version: 1` plus the required sections One-Sentence Idea, Target Customer, Problem Or Desire, Proposed Solution, Value Outcome, Payer, Current Alternative, First Testable Version, Evidence, Assumptions, and Open Questions. `Founder Fit Notes` is deprecated because Founder Profile input is supplied explicitly during final analysis; Hearne OS owns where `normalized.md` lives, not the schema.
