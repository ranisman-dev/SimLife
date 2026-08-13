---
phase: 03-belief-decay-needs-regeneration
plan: 01
subsystem: engine
tags: [beliefs, decay, pruning, verification, sim.js]

# Dependency graph
requires:
  - phase: 01-verification-infrastructure
    provides: "runRegressionCheck/runOrderingCheck contract, TUNING block, DEFAULT_SEED/seedRng, snapshotWorld"
  - phase: 02-witness-reaction-ordering
    provides: "orderWitnesses/scoreCandidates extraction that later Phase 3 plans touch for the retreat-gate hysteresis"
provides:
  - "beliefConfidence(belief, tick) — pure, memoryStrength-identical decay formula for beliefs"
  - "TUNING.beliefPruneFloor (0.03), the belief-side mirror of addMemory's memory floor"
  - "Prune-on-push at both belief push sites (perceiveEvent witnessed push, applyClaimBelief claim push), with a known-false exemption"
  - "Sim.runDecayCheck() — four qualitative DECAY-01/DECAY-02 checks, gating scripts/verify.js's exit code and --update-baseline refusal"
affects: [03-02, 03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy-computed-live decay (mirrors memoryStrength/activeEmotionIntensity) applied to a second mind-box (beliefs)"
    - "Prune-on-push (mirrors addMemory's filter-immediately-before-push), with a tag-based exemption instead of a blanket length cap"

key-files:
  created: []
  modified:
    - sim.js
    - scripts/verify.js

key-decisions:
  - "beliefConfidence() is byte-identical in shape to memoryStrength() with belief.confidence substituted for mem.importance (D-01), verified to agree to within 1e-12 across four sample ticks"
  - "known false-tagged beliefs are exempt from pruning regardless of age (D-02); no length cap was added to mind.beliefs (unlike addMemory's shift()) because shift() would evict a protected known-false belief"
  - "Prune filters run immediately before each belief push, no new sweep loop (D-03), matching addMemory's exact template"
  - "Decision-path belief.confidence reads (findConflictingBeliefs, believesDead) are deliberately NOT rewired to the live beliefConfidence() accessor this plan — decay reaches decision logic only via the record disappearing on prune, same contract memoryStrengthForEvent already uses"
  - "Confidence-discount writes in applyClaimBelief's contested-claim branch do not re-stamp belief.tick — a downward revision is not reinforcement, so the decay clock keeps running from formation"

requirements-completed: [DECAY-01, DECAY-02]

# Metrics
duration: 12min
completed: 2026-08-12
---

# Phase 3 Plan 01: Belief Decay Summary

**`beliefConfidence()` gives beliefs the same lazy-decay + prune-on-push lifecycle memories already have, with a "known false" exemption so contradicted claims never get pruned; `runDecayCheck()` wires four DECAY-01/DECAY-02 checks into `scripts/verify.js`'s gating exit code.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-12T21:12:07-05:00 (worktree base commit)
- **Completed:** 2026-08-12T21:17:09-05:00
- **Tasks:** 2
- **Files modified:** 2 (`sim.js`, `scripts/verify.js`)

## Accomplishments
- Added `beliefConfidence(belief, currentTick)`, a pure function that mirrors `memoryStrength`'s exact formula shape, so `mind.beliefs` decays the same way `mind.memories` already does
- Added prune-on-push at both belief-push sites (witnessed beliefs in `perceiveEvent`, claimed beliefs in `applyClaimBelief`), with a `known false` substring exemption that protects contradicted-claim records regardless of staleness
- Added `Sim.runDecayCheck()` (four checks) and wired it into `scripts/verify.js` as a new gating batch, so a regression in belief decay/pruning now blocks both the plain exit code and `--update-baseline`

## Task Commits

Each task was committed atomically:

1. **Task 1: beliefConfidence() + known-false-exempt prune-on-push at both belief push sites** - `adb8f2d` (feat)
2. **Task 2: runDecayCheck() with DECAY-01/DECAY-02 checks, wired into verify.js as a gating batch** - `7615b4b` (feat)

**Plan metadata:** committed together with this SUMMARY.md (see final commit)

## Files Created/Modified
- `sim.js` - Added `TUNING.beliefPruneFloor`, `beliefConfidence()`, prune-on-push filters at the two belief-push sites, a one-line comment on the confidence-discount writes not re-stamping `belief.tick`, `runDecayCheck()`, and the `Sim` export additions (`beliefConfidence`, `runDecayCheck`)
- `scripts/verify.js` - Calls `Sim.runDecayCheck()`, prints its batch under a `Belief decay & needs regeneration (DECAY-01..05)` header, and folds its checks into the `allChecks` concat that gates `--update-baseline`

## Decisions Made
None beyond what 03-CONTEXT.md's D-01/D-02/D-03 already locked — plan executed as written. The plan's own scope-boundary note (decision-path gates like `findConflictingBeliefs`'s `confidence <= 0.2` and `believesDead`'s `confidence > 0.4` are not rewired to the live accessor this phase) was followed exactly; verified by `grep -n "beliefConfidence" sim.js | grep -E "829|845|991"` returning nothing (no matches at the actual current line numbers of those gates either, confirmed by inspection).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verbatim Verification Evidence

### The four DECAY-01/DECAY-02 check lines from `node scripts/verify.js`

```
Belief decay & needs regeneration (DECAY-01..05)
PASS belief-decay-matches-memory-formula :: t=5: beliefConfidence=0.8 memoryStrength=0.8, t=10: beliefConfidence=0.7153799465421251 memoryStrength=0.7153799465421251, t=25: beliefConfidence=0.5115370405306076 memoryStrength=0.5115370405306076, t=60: beliefConfidence=0.23388615311953742 memoryStrength=0.23388615311953742
PASS belief-confidence-decays-with-age :: tick5=0.8 (stored confidence=0.8), tick10=0.7153799465421251, tick60=0.23388615311953742
PASS known-false-belief-survives-pruning :: belief count before=2, after=2; known-false id "decay-check-known-false" survived the push
PASS stale-belief-is-pruned :: computed beliefConfidence at push tick=0.003125, TUNING.beliefPruneFloor=0.03; stale id "decay-check-stale" was pruned
```

`node scripts/verify.js` overall result: `OVERALL: PASS`, exit code 0. No baseline diff appeared for either `snapshot-matches-baseline` or `order-matches-baseline` — belief pruning was a no-op against the short existing fixtures, as the plan anticipated. No baseline JSON files were modified (`git status --short scripts/` showed nothing before this SUMMARY was added).

### Negative-control output (deliberately broken floor)

Temporarily set `TUNING.beliefPruneFloor = 0` in `sim.js`, re-ran `node scripts/verify.js`:

```
Belief decay & needs regeneration (DECAY-01..05)
PASS belief-decay-matches-memory-formula :: ...
PASS belief-confidence-decays-with-age :: ...
PASS known-false-belief-survives-pruning :: belief count before=2, after=3; known-false id "decay-check-known-false" survived the push
FAIL stale-belief-is-pruned :: computed beliefConfidence at push tick=0.003125, TUNING.beliefPruneFloor=0; stale id "decay-check-stale" was NOT pruned
OVERALL: FAIL
EXIT CODE: 1
```

Confirms the check genuinely gates rather than passing vacuously. The floor was restored to `0.03` immediately after, and `git diff sim.js` showed no residue of the temporary change before committing.

No baseline diff appeared at any point during this plan's execution.

## Next Phase Readiness
- `beliefConfidence()` is exported on `Sim` and ready for Plan 03-02's `presentation.js` consumption (belief display/decay in the mind inspector)
- `runDecayCheck()`'s check array is deliberately easy to extend — later Phase 3 plans (needs regeneration, retreat-gate hysteresis) append more checks to the same runner rather than creating a new one
- No blockers for 03-02 through 03-05

---
*Phase: 03-belief-decay-needs-regeneration*
*Completed: 2026-08-12*

## Self-Check: PASSED

- FOUND: sim.js
- FOUND: scripts/verify.js
- FOUND: .planning/phases/03-belief-decay-needs-regeneration/03-01-SUMMARY.md
- FOUND commit: adb8f2d (Task 1)
- FOUND commit: 7615b4b (Task 2)
