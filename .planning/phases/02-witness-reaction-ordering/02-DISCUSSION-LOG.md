# Phase 2: Witness Reaction Ordering - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 2-Witness Reaction Ordering
**Mode:** `--auto` (autonomous, no user prompts — user explicitly authorized continued autonomous execution through Phases 2-4)
**Areas discussed:** Urgency scoring, Dispatch shape, Tick semantics

---

## Urgency scoring

[auto] Urgency scoring — Q: "Should scoreCandidates() be extracted as a pure function reused by decideAndAct() and the new ordering pass?" → Selected: "Yes, extract it" (recommended default per research/SUMMARY.md's explicit build-order note)

[auto] Urgency scoring — Q: "Is urgency the existing decideAndAct() top-candidate score, or a new invented metric?" → Selected: "Reuse the existing score" (recommended default — avoids a second scoring system, matches the architecture's no-special-casing rule)

## Dispatch shape

[auto] Dispatch shape — Q: "Depth-first-per-witness (current) vs. score-all-then-fire-highest-first?" → Selected: "Score-all-then-fire-highest-first" (recommended default — CONCERNS.md's own documented fix approach, verbatim)

[auto] Dispatch shape — Q: "Tie-break on equal urgency scores?" → Selected: "Fall back to existing agentsAt() list order, deterministic" (recommended default — consistent with Phase 1's LOCKED D-05 RNG-scope-discipline decision; no coin-flip tiebreak)

## Tick semantics

[auto] Tick semantics — Q: "Does this phase also address whether same-event reactions share a tick?" → Selected: "Out of scope — deferred" (recommended default — CONCERNS.md itself frames this as a separate, later concern; ORDER-01/ORDER-02 only require correct dispatch order)

---

## Claude's Discretion

- Naming for the extracted `scoreCandidates()` function
- Where the sort-then-dispatch logic is placed in `sim.js`

## Deferred Ideas

- Tick-sharing / sub-ordering field for reactions to the same originating event — explicitly out of scope, noted for a future phase if reaction timing is ever used for more than flavor.
