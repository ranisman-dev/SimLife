# Phase 1: Verification Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-12
**Phase:** 1-Verification Infrastructure
**Areas discussed:** Regression check surface, RNG seed handling, Constants block granularity, Regression check strictness

---

## Regression check surface

| Option | Description | Selected |
|--------|-------------|----------|
| Node script | `node scripts/verify.js` prints pass/fail to the terminal — fits the existing dual-export pattern | |
| Browser console function | `Sim.runRegressionCheck()` callable from the browser dev console | |
| Both | Same check logic, two entry points | ✓ |

**User's choice:** Both
**Notes:** None beyond the selection.

---

## RNG seed handling

| Option | Description | Selected |
|--------|-------------|----------|
| Overridable with a fixed default | `world.seed` defaults to a hardcoded constant, optional override | ✓ |
| Fixed only | One hardcoded seed, no override path | |

**User's choice:** Overridable with a fixed default
**Notes:** User then asked what exactly the seed generates and what `createWorld()` currently decides. Claude explained `createWorld()` is fully deterministic (5 hand-authored NPCs, no randomness); the seed only affects the three later `Math.random()` call sites (Attack damage, gossip honesty, scapegoat selection), not world creation.

**Follow-up thread — architecture:** User questioned whether `createWorld()` should accept the seed param at all, noting it sounds like an unrelated concern ("you're just putting a random number in a function it isn't relevant to"). Resolved: `createWorld()` stays untouched; a separate `Sim.seedRng(world, seed)` attaches the RNG stream after the fact.

**Follow-up thread — RNG scope discipline (LOCKED, cross-phase):** User raised a broader principle: when world generation eventually becomes non-deterministic (future procedural generation), that initial genesis RNG is the *only* RNG allowed to decide anything important — everything after is cause-and-effect ("even if it's the butterfly effect"). Locked as binding on Phases 5-7 too: `decideAndAct()` and future Snap/reactivation thresholds must never become probabilistic; RNG stays scoped to stochastic texture (damage magnitude, honesty flip, scapegoat pick), never to *what* an NPC does.

---

## Constants block granularity

| Option | Description | Selected |
|--------|-------------|----------|
| Single shared block | One object (e.g. `Sim.TUNING`) holds every new tuning number across all 7 phases | ✓ |
| Per-mechanic blocks | Separate named blocks (`Sim.DRIFT`, `Sim.SNAP`, etc.) per phase/mechanic | |

**User's choice:** Single shared block
**Notes:** Confirmed this doesn't retrofit existing constants (`MAX_REACTION_DEPTH`, `EMOTION_HALFLIFE_TICKS`) — scoped to new Phase 2 numbers only, per VERIF-03's wording.

---

## Regression check strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Full snapshot diff | Capture entire relevant world state, compare field-by-field — most rigorous, most brittle | ✓ |
| Targeted assertions | Check specific things (reaction, event order, final relationship values) — looser, more stable | |

**User's choice:** Full snapshot diff
**Notes:** User asked how to make this less brittle. Claude proposed: (1) scope the snapshot to relevant agents + event log rather than the whole world, (2) golden-master `--update-baseline` re-baseline workflow, (3) human-readable diff output, (4) reuse this same pattern for every later phase's scripted-scenario baseline. User accepted with one correction: don't hardcode the scope to exactly 2 agents — generalize to however many agents a given scenario actually involves (future scenarios, e.g. Phase 2's witness ordering, may involve 3+). Locked as the standard pattern going forward.

---

## Claude's Discretion

- Exact naming for `Sim.seedRng()`, `Sim.TUNING`, and the snapshot/diff function names
- Choice of seeded PRNG algorithm (any deterministic, swappable generator satisfies VERIF-02)
- File layout for `scripts/verify.js` vs. where shared check logic lives

## Deferred Ideas

- Procedural world/NPC generation (replacing the 5 hand-authored NPCs in `createWorld()`) — future milestone, not this one. Surfaced only as the future context for the RNG scope-discipline principle.
