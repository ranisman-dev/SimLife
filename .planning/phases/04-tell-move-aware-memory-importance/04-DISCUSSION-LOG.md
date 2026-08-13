# Phase 4: Tell/Move-Aware Memory Importance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-13
**Phase:** 4-Tell/Move-Aware Memory Importance
**Mode:** `--auto` (autonomous, no user prompts — user explicitly authorized continued autonomous execution through Phases 2-4)
**Areas discussed:** Tell impact severity scaling, Tell care-scaling (who the claim is about), Move impact scaling, Importance ceiling

---

## Tell impact scaling

[auto] Q: "What formula scales a Tell's memory impact by 'severity of what's claimed'?" → Selected: "A new per-predicate base-severity table calibrated against applyClaimBelief's existing relationship-effect magnitudes, multiplied by the same direct/overheard confidence formula perceiveEvent already computes" (recommended default — the only existing severity signal in the codebase to calibrate against; duplicating the confidence formula inline keeps appraiseEvent callable identically from both purity-bound call sites, per Phase 2's contract)

[auto] Q: "Does Tell's generic isVictim/care-scaling block use the listener or the claim's subject?" → Selected: "Extend the existing block to also scale by affection toward claim.subject (who the claim is about), not just the listener" (recommended default — the block's existing purpose is 'this matters more if it happened to someone I care about'; claim.subject is the closer analog to Take/Attack's targetId for that meaning)

## Move impact scaling

[auto] Q: "What severity signal can a Move event use, given it carries no 'claim'?" → Selected: "Stay at the existing flat floor unless event.causedBy traces to a witnessed Attack/non-consented Take where the mover was the target — then apply a moderate negative impact for the flight reaction" (recommended default — event.causedBy is already a first-class, always-populated causal-chain field from Phase 2; this avoids reading the mover's private mind state, which would violate the perceive/believe boundary)

## Importance ceiling

[auto] Q: "How does a severity-scaled Tell (or an already-underestimated severe Attack) actually persist longer than the current ~38-tick/190-tick cap?" → Selected: "Raise perceiveEvent's addMemory clamp upper bound from 1 to TUNING.maxMemoryImportance = 1.5, applied uniformly to every event type" (recommended default — the only generic way to satisfy MEMORY-02's 'any event type' wording; the old literal 1 was already silently clamping some witnessed Attack impacts today, so this is a strict widening, not a new mechanism)

---

## Claude's Discretion

- Exact `TUNING.maxMemoryImportance` value beyond "greater than 1" (1.5 suggested)
- Exact per-predicate severity constants in the new severity table, beyond the stated relative ordering
- D-04's exact Move flight-impact magnitude (-0.5 suggested)
- Whether the severity table lives as a new constant object or named TUNING entries

## Deferred Ideas

None.
