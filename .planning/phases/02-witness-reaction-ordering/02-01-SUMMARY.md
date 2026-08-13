---
phase: 02-witness-reaction-ordering
plan: 01
subsystem: engine (witness dispatch provenance + scripted ordering scenario) and testing (verify.js ordering check + frozen ORDER-02 "before" fixture)
tags: [witness-ordering, provenance, golden-master, cli, node, verification-infrastructure]

# Dependency graph
requires:
  - phase: 01-verification-infrastructure (plan 01)
    provides: "Sim.seedRng(world, seed) / world.rng stream, Sim.DEFAULT_SEED, Sim.isDriftEnabled(world)"
  - phase: 01-verification-infrastructure (plan 03)
    provides: "scripts/verify.js CLI pattern (loadJsonIfPresent, loadKnownMismatch, --update-baseline refusal-gate workflow) and scripts/baseline.json"
provides:
  - "event.witnessOrder — dispatch-order provenance on every event (sim.js performAction), display/inspection only, never read back into scoring/preconditions/beliefs"
  - "Sim.ORDER_SPEC (module-private) / Sim.buildOrderingScenario / Sim.orderingSnapshot / Sim.runOrderingCheck — the deterministic, seeded, drift-off five-witness scenario the whole phase is judged on"
  - "scripts/order-prefix.json — frozen ORDER-02 'before' side (pre-fix computeWitnesses agent-list dispatch order and its full reaction cascade)"
  - "scripts/order-baseline.json — live golden-master fixture for the ordering scenario, diffed against order-prefix.json on every verify.js run"
  - "scripts/verify.js --capture-prefix-order flag, ordering-check printing, NON_ACKNOWLEDGEABLE_CHECK_NAMES set"
affects: ["Plan 02-02 (RNG stream shift, re-captures order-prefix.json without changing ORDER_SPEC)", "Plan 02-03 (urgency-sorted dispatch fix, diffs against order-prefix.json/order-baseline.json, forbidden from re-tuning ORDER_SPEC)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "witnessOrder provenance field follows the same display-only convention as event.causedBy/event.why — never read back into any scoring/precondition/belief path"
    - "buildOrderingScenario()/orderingSnapshot()/runOrderingCheck() mirror buildCloneVariant()/runRegressionCheck()'s shapes exactly (named spec constant, isolated seeded drift-off world, one scripted performAction, result-object idiom that never prints/throws)"
    - "NON_ACKNOWLEDGEABLE_CHECK_NAMES generalizes Phase 1's single BASELINE_CHECK_NAME string into a Set covering both snapshot-matches-baseline and order-matches-baseline — both rejected by name at known-mismatch.json load time, both excluded from the --update-baseline refusal gate"
    - "printCheckResults() is the one shared loop body both the regression-check and ordering-check printing call, so PASS/FAIL/KNOWN-MISMATCH/STALE-ACK formatting can't drift between the two"

key-files:
  created:
    - scripts/order-prefix.json
    - scripts/order-baseline.json
  modified:
    - sim.js
    - scripts/verify.js
    - scripts/baseline.json

key-decisions:
  - "ORDER_SPEC needed no tuning: garrick's pre-fix considered/chose margin for the origin event came out at attack player=0.74 vs tell mara about player=0.58 (0.16 margin, well above the ~0.04 unwidened baseline), and ives landed in the impact >= -0.05 early-return bucket with zero mind.log entries on the first build — no victimBoldness field was needed."
  - "runOrderingCheck()'s checks array only ever contains order-matches-baseline (added only when opts.baseline is supplied) — no ORDER-01 qualitative checks are added in this plan, matching the plan's explicit instruction that Plan 02-03 adds those together with the fix that makes them true."

requirements-completed: [ORDER-02]

# Metrics
duration: ~55min
completed: 2026-08-13
---

# Phase 02 Plan 01: Witness Ordering Provenance + Scripted Scenario + Frozen Prefix Fixture Summary

**Added `event.witnessOrder` dispatch-order provenance, built the scripted five-witness ordering scenario (`ORDER_SPEC`/`buildOrderingScenario`/`orderingSnapshot`/`runOrderingCheck`), and froze the current `forEach`-order reaction cascade into a committed `scripts/order-prefix.json` — all before any dispatch-order behavior changes, so ORDER-02's before/after diff is confirmed against pre-fix code, not assumed.**

## Performance

- **Duration:** ~55 min of active execution work across Tasks 1-3
- **Completed:** 2026-08-13
- **Tasks:** 3 (all `auto`)
- **Files modified:** 5 (`sim.js`, `scripts/verify.js`, `scripts/baseline.json`, `scripts/order-prefix.json` new, `scripts/order-baseline.json` new)

## Accomplishments

- `event.witnessOrder = witnesses.slice()` added in `performAction` immediately after `computeWitnesses`, as display/inspection-only provenance in the same family as `causedBy`/`why`. `scripts/baseline.json` re-blessed; the re-bless diff was confined to exactly 6 new `witnessOrder` additions (all `from: absent`), and all five Phase 1 qualitative checks stayed `PASS`.
- `ORDER_SPEC`/`buildOrderingScenario()`/`orderingSnapshot()`/`runOrderingCheck()` added to `sim.js` and exported on `Sim` (`ORDER_SPEC` stays module-private, mirroring `CLONE_SPEC`). The scenario keeps all six agents in `'square'` (garrick as victim, last in `createWorld`'s insertion order for maximum ORDER-01 contrast; ives tuned via `agreeableness`/`CompetitiveJungle` weight/affection-to-victim overrides into `decideAndAct`'s `impact >= -0.05` early-return bucket), deterministic under `DEFAULT_SEED` with drift off.
- `scripts/verify.js` extended: `NON_ACKNOWLEDGEABLE_CHECK_NAMES` generalizes the single `BASELINE_CHECK_NAME`, a new `--capture-prefix-order` flag writes `scripts/order-prefix.json`, and every run now prints the ordering check status plus a permanent `Ordering fix effect (... -> current):` diff line. Both `scripts/order-prefix.json` and `scripts/order-baseline.json` were captured from this pre-fix `HEAD` and are byte-identical in their `snapshot` content.

## Task Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 | `ba23bb8` | `sim.js`, `scripts/baseline.json` |
| 2 | `7e5e9ae` | `sim.js` |
| 3 | `13c4b4e` | `scripts/verify.js`, `scripts/order-prefix.json`, `scripts/order-baseline.json` |

## ORDER-02 "Before" Evidence (verbatim)

**Pre-fix `witnessOrder`** (plain `computeWitnesses`/`agentsAt` insertion order):

```
mara,ives,tomas,elena,garrick
```

**Full pre-fix reaction sequence** (`node -e` against `buildOrderingScenario()`/`orderingSnapshot()`, actor:verb->target, in dispatch/array order — capped by `MAX_REACTION_DEPTH = 4`):

```
mara:Tell->player | tomas:Attack->player | mara:Tell->tomas | elena:Tell->mara | garrick:Tell->tomas | elena:Tell->mara | garrick:Attack->player | mara:Tell->garrick | tomas:Attack->garrick | mara:Tell->tomas | elena:Tell->ives | garrick:Attack->tomas | mara:Tell->garrick | tomas:Tell->ives | elena:Tell->garrick | elena:Tell->garrick
```

Note the maximum-contrast case this fixture is built for: `garrick` (the victim) is dispatched dead last in agent-list order, so his own `attack player` reaction (event above, `garrick:Attack->player`) fires only after four other witnesses' cascades have already run — exactly the pre-fix defect ORDER-01/ORDER-02 exist to fix. Plan 02-03's urgency-sorted dispatch must instead put him first.

## `garrick`'s considered/chose (origin event, pre-fix)

```
garrick considered: attack player=0.74 | tell mara about player=0.58 | press player for an explanation=0.33 | retreat=0.08 | do nothing=0.05
garrick chose: attack player
```

The `Honor: 0.6` value widening (appended to garrick's existing Justice/Honesty/Loyalty values) produced a 0.16 margin between `attack player` (0.74) and the next-highest candidate `tell mara about player` (0.58) — comfortably above the ~0.04 unwidened baseline the plan flagged as too thin. No further tuning (e.g. `victimBoldness`) was needed.

## Per-witness no-reaction-bucket table (origin event, pre-fix)

| Witness | mind.log entries for origin event | `chose` |
|---|---|---|
| mara | 1 | `press player for an explanation` |
| **ives** | **0** | *(no entry — impact clamps to `-0`, fails `impact < 0` guard, no log push at all)* |
| tomas | 1 | `attack player` |
| elena | 1 | `tell mara about player (misattributed)` |

`ives` is confirmed as the sole witness in `decideAndAct`'s no-reaction bucket: `generalCareOf(ives) = clamp(0.15 + 0.1*0.3 + 0 - 0.9*0.25, 0, 1)` evaluates to `-0.045` before the clamp (`0` after), and `appraiseEvent`'s non-victim branch multiplies `impact` by `generalCare * 0.3` (the `victimAffection <= 0` path, reached because affection toward the victim is `-0.4`), giving `impact = -0` — which satisfies `appraisal.impact >= -0.05` and also fails `appraisal.impact < 0`, so no `mind.log` entry is pushed at all (not even the `barely noticed` entry, which requires `impact < 0` strictly).

## Final `ORDER_SPEC` values

No tuning was required — the first `buildOrderingScenario()` build already satisfied both pinned assertions (garrick's `chose === 'attack player'` and ives as the sole no-reaction-bucket witness), so `ORDER_SPEC` shipped exactly as planned:

```js
{
  attackerId: 'player',
  victimId: 'garrick',
  indifferentId: 'ives',
  agentListOrder: ['mara', 'ives', 'tomas', 'elena', 'garrick'],
  victimValue: { value: 'Honor', weight: 0.6 },
  indifferent: { agreeableness: 0.1, competitiveJungleWeight: 0.9, affectionToVictim: -0.4 },
}
```

No `victimBoldness` field was added — the `Honor: 0.6` value alone bought a comfortable margin (0.16 vs. the ~0.04 unwidened baseline).

## `scripts/baseline.json` re-bless diff (Task 1)

```
  jungle.events.0.witnessOrder: (absent) -> ["mara","ives"]
  jungle.events.1.witnessOrder: (absent) -> ["player","ives"]
  jungle.events.2.witnessOrder: (absent) -> ["player","mara"]
  jungle.events.3.witnessOrder: (absent) -> ["player","ives"]
  averse.events.0.witnessOrder: (absent) -> ["mara","ives"]
  averse.events.1.witnessOrder: (absent) -> ["player","ives"]
```

All 6 entries are additions (`from: absent`), all matching `^(jungle|averse)\.events\.[0-9]+\.witnessOrder$` — no other path changed, confirming the field addition was order-neutral. All five Phase 1 qualitative checks (`clone-specs-differ-in-exactly-one-field`, `drift-disabled`, `positive-clone-attacks-player`, `negative-clone-takes-no-action`, `reactions-diverge`) stayed `PASS` throughout.

## Tamper / acknowledgement round-trip outputs (Task 3, verbatim)

**Tamper (corrupted `witnessOrder[0]` in `scripts/order-baseline.json`):**

```
FAIL order-matches-baseline :: 1 field(s) differ from the supplied baseline
Ordering baseline diff:
  witnessOrder.0: TAMPERED -> mara
OVERALL: FAIL
```
(exit 1)

**`--update-baseline` against the tampered baseline** (prints the same diff, then re-blesses and exits 0):

```
FAIL order-matches-baseline :: 1 field(s) differ from the supplied baseline
Ordering baseline diff:
  witnessOrder.0: TAMPERED -> mara
OVERALL: FAIL
Captured scripts/baseline.json (0 diff entries accepted) and scripts/order-baseline.json.
```
(exit 0)

**After restoring the pre-tamper backup:**

```
PASS order-matches-baseline :: live ordering snapshot matches the supplied baseline exactly
Ordering fix effect (pre-fix (computeWitnesses agent-list dispatch order) -> current):
no differences
OVERALL: PASS
```
(exit 0)

**Acknowledgement rejection** (temporary `scripts/known-mismatch.json` with `{"approved":true,"acknowledged":["order-matches-baseline"]}`):

```
ERROR: scripts/known-mismatch.json acknowledges "order-matches-baseline" — a golden-master baseline check may never be acknowledged (acknowledging it would neuter the entire regression gate). Remove it from scripts/known-mismatch.json and re-run.
```
(exit 1). The temporary file was deleted afterward; `git status --short` showed no untracked files.

## Deviations from Plan

None — plan executed exactly as written. `ORDER_SPEC` required no tuning (the "Claude's Discretion" tuning path in Task 2 was available but not needed), and no architectural or scope deviations occurred.

## Self-Check: PASSED

- `sim.js` — FOUND
- `scripts/verify.js` — FOUND
- `scripts/order-prefix.json` — FOUND
- `scripts/order-baseline.json` — FOUND
- `scripts/baseline.json` — FOUND
- Commit `ba23bb8` — FOUND
- Commit `7e5e9ae` — FOUND
- Commit `13c4b4e` — FOUND
- `node scripts/verify.js` exits 0, prints `OVERALL: PASS` — CONFIRMED
