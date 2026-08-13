# Phase 3: Belief Decay & Needs Regeneration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 3-Belief Decay & Needs Regeneration
**Mode:** `--auto` (autonomous, no user prompts — user explicitly authorized continued autonomous execution through Phases 2-4)
**Areas discussed:** Belief decay formula, Known-false pruning exemption, Needs regeneration mechanism, Belonging's first trigger, Retreat-gate hysteresis

---

## Belief decay

[auto] Q: "What formula and mutation idiom for belief confidence decay?" → Selected: "Mirror memoryStrength()'s exact shape, substituting confidence for importance; prune-on-push like addMemory()" (recommended default — research explicitly names this, avoids a second decay-math family)

[auto] Q: "Should contradicted ('known false') beliefs be exempt from pruning?" → Selected: "Yes, always exempt regardless of staleness" (recommended default — PITFALLS research explicitly flags naive pruning as deleting the most protective record)

## Needs regeneration

[auto] Q: "Stored-value-with-live-regen-accessor, or a different mutation idiom?" → Selected: "Track last-adjusted tick per need, compute regenerated value live via an asymptotic-approach accessor" (recommended default — matches the codebase's only existing pattern for time-based change, no game loop exists to hang a sweep pass on)

[auto] Q: "What's belonging's first trigger?" → Selected: "Positive Give or friendly Tell raises the actor's own belonging" (recommended default — most direct existing-verb mapping, no new verb needed)

[auto] Q: "Does DECAY-03's 'and/or' mean passive regen and triggers are alternatives, or both apply?" → Selected: "Both — passive drift for all three needs, plus explicit triggers on top for belonging" (recommended default — reads CONCERNS.md's own fix-approach language as additive, not exclusive)

## Retreat-gate hysteresis

[auto] Q: "How should the safety < 0.7 gate avoid flicker?" → Selected: "Two-threshold band: enter retreat below 0.65, exit only above 0.75" (recommended default — standard hysteresis construction, symmetric around the existing cutoff)

---

## Claude's Discretion

- Exact regeneration rate constant (goes in Sim.TUNING)
- Exact mechanism for tracking "currently retreating" state for the hysteresis band
- Belonging trigger magnitude (Give vs. Tell)
- Prune-floor constant for belief decay (defaults to reusing memory's existing 0.03)

## Deferred Ideas

None.
