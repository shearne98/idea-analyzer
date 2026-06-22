## Problem

The current **After Validation** section is usually generic because its prompt and fallback normalization repeatedly prescribe:

- deliver manually
- ask customers what they valued
- repeat before scaling

Those principles are useful, but the current fields are too narrow and do not explain what repeated proof should unlock. The section can read like a generic roadmap rather than an idea-specific investment gate.

## Domain Definition

**After Validation** is the conditional proof-building cycle that begins only after the Validation Plan succeeds.

Its stable principles are:

1. Fulfil the validated promise in the simplest appropriate way.
2. Learn from real usage and delivery.
3. Seek measurable repeated proof before making the next investment.

The actions must adapt to the business model. Manual delivery is often appropriate, but should not be forced when a different approach is safer or more relevant.

## Replace The Current Structure

Replace:

```ts
{
  deliverManually: string;
  learnFromCustomers: string;
  repeatBeforeScaling: string;
}
```

With:

```ts
{
  fulfilValidatedPromise: string;
  learnFromDelivery: string[];
  repeatedProofTarget: string;
  nextInvestmentIfProven: string;
  reviseOrStopIf: string;
}
```

## Field Requirements

### fulfilValidatedPromise

Explain how to fulfil the promise validated by the Validation Plan using the simplest appropriate approach.

- Prefer manual or existing-tool delivery when practical.
- Adapt for other models such as hardware prototypes, marketplaces, content, regulated products, or technical-feasibility experiments.
- Do not recommend building the full product.

### learnFromDelivery

Provide **2–4 concise, decision-relevant learning priorities**.

Each item must help decide at least one of:

- whether the offer should change
- which customer or buyer to prioritize
- which observed delivery friction should be automated
- whether the economics can work

Avoid generic feedback checklists and duplication with Key Unknowns.

### repeatedProofTarget

Define a measurable repeated signal that would justify considering another investment.

- Focus on repetition of the important validated behavior, especially repeat payment when relevant.
- State how many additional customers, purchases, uses, or other signals are required.
- Do not automatically make manual-delivery efficiency the gate when automation is part of the intended solution.

### nextInvestmentIfProven

Name the smallest next investment unlocked by repeated proof.

- Base it on observed customer value or delivery friction.
- Prioritize automation that removes demonstrated friction.
- Do not jump to unrelated features from the long-term vision.

### reviseOrStopIf

State the concise result that means revise the offer, pause, or stop instead of investing.

## Section Boundaries

- **Validation Plan** proves the idea once.
- **Key Unknowns** identifies critical missing information and how to resolve it.
- **After Validation** tests whether the successful signal repeats and determines what investment that proof earns.
- **What Not To Build Yet** remains the explicitly excluded scope.

## Example: Basketball Highlights

- **Fulfil the validated promise:** Record games and manually deliver the purchased highlight package using existing tools.
- **Learn from delivery:** Track which clips buyers value, whether players or organizers are the stronger buyer, and which parts of fulfilment create the greatest friction.
- **Repeated proof target:** Sell the same offer for three additional games, with at least two previous buyers paying again or committing to another recording.
- **Next investment if proven:** Build a tiny prototype that automates the most time-consuming proven part of clip creation.
- **Revise or stop if:** Buyers do not pay again, refer another paying customer, or commit to another recording.

## Acceptance Criteria

- Analysis prompt requests the new five-field After Validation structure.
- Normalization produces complete, idea-specific values without generic fallback repetition.
- `learnFromDelivery` contains 2–4 concise items.
- `repeatedProofTarget` is measurable.
- `nextInvestmentIfProven` names a focused investment justified by repeated proof and observed learning.
- `reviseOrStopIf` provides a clear negative gate.
- Frontend renders the new structure clearly and concisely.
- Historical saved outputs using the old three-field structure remain readable through an explicit migration.
- The old After Validation fields are removed from active analysis responses and consumers.
- Tests cover:
  - basketball highlights with repeat-payment proof and targeted automation
  - compliance managed service with repeat sales or continuation into subscription
  - a non-payment or regulated feasibility experiment where manual service delivery is not forced
- Existing clarification, scoring, Validation Plan, Key Unknowns, saved-output, and performance behavior remains working.
