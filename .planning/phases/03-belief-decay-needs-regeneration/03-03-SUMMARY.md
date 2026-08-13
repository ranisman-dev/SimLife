---
phase: 03-belief-decay-needs-regeneration
plan: 03
subsystem: engine
tags: [needs, belonging, give, tell, verification, sim.js]

# Dependency graph
requires:
  - phase: 03-belief-decay-needs-regeneration
    plan: 02
    provides: "NEED_DEFAULTS, the {value, tick} needs shape, needValue(), tick-threaded adjustNeed(agent, needName, delta, tick), runDecayCheck() runner this plan appends to"
provides:
  - "belonging's first-ever triggers: a positive Give and a friendly (is_trustworthy) Tell both raise the actor's own belonging, via adjustNeed(actor, 'belonging', TUNING.belongingGiveGain|belongingVouchGain, world.tick)"
  - "TUNING.belongingGiveGain (0.08) and TUNING.belongingVouchGain (0.05) — the first positive need deltas anywhere in sim.js"
  - "The !actor.isPlayer guard pattern for actor-directed need adjustments (inverse of Take/Attack's !target.isPlayer), proven safe for the player's mind: null via a real try/catch check"
  - "Three more runDecayCheck() checks (belonging-rises-on-give, belonging-rises-on-vouch, player-give-does-not-throw) — total now 10"
  - "A matched-tick-comparison test pattern (snapshot pre-trigger record, regenerate it to the post-action tick via a synthetic { mind: { needs: { <key>: record } } } object, compare against the real post-trigger value at the same tick) for isolating an event-driven need trigger's effect from passive regeneration"
affects: [03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Actor-directed adjustNeed calls guard !actor.isPlayer (not !target.isPlayer) — this plan's hooks are the first adjustNeed call sites in the file that adjust the acting agent's own need rather than the target's, so the guard direction inverts"
    - "Matched-tick test comparison: to prove a trigger's effect isolated from passive regeneration, snapshot the pre-trigger stored record, evaluate needValue() on both the untouched snapshot and the real post-trigger record at the SAME tick (the post-action tick), and compare those two — not a naive before/after read at two different ticks"

key-files:
  created: []
  modified:
    - sim.js

key-decisions:
  - "belongingGiveGain (0.08) > belongingVouchGain (0.05) — giving something you own is a heavier act of connection than speaking well of someone; both are Claude's-discretion magnitudes per CONTEXT.md, chosen once and locked here, not tuned further"
  - "No coercion/consent detection was built for Give's 'no coercive framing' qualifier — every Give already carries consented: true unconditionally in this codebase (Take is the sole coercive-transfer verb, always consented: false), so D-05's qualifier is satisfied by verb identity alone; inventing a consent heuristic would have been unrequested scope"
  - "The Tell hook checks params.claim truthiness before reading .predicate, independently of checkPreconditions' own claim.predicate requirement — defensive, not redundant, since applyEffects doesn't structurally guarantee checkPreconditions already ran with the same params object"
  - "DECAY-04's three new checks use a synthetic { mind: { needs: { belonging: record } } } object (not a full agent) as needValue()'s first argument for the 'no-trigger baseline' half of each matched-tick comparison — needValue only ever reads agent.mind.needs[key], so this minimal shape is sufficient and keeps the test from needing a second full world/agent just to compute a hypothetical passive-regen-only value"
  - "player-give-does-not-throw exercises the player performing both a real Give and a real Tell (is_trustworthy) inside one try/catch, rather than two separate checks — a single guard-direction bug would throw on the very first of either action, so testing both in one check catches the failure mode without doubling the check count for no added coverage"

requirements-completed: [DECAY-04]

# Metrics
duration: 5min
completed: 2026-08-12
---

# Phase 3 Plan 03: Belonging's First Trigger (Give/Tell) Summary

**`belonging` gets its first-ever mutators — giving someone an item or vouching for them (`is_trustworthy` Tell) now raises the giver's/teller's own belonging via two new guarded `adjustNeed` hooks in `applyEffects`, with the guard direction deliberately inverted from every existing hook in the file since these adjust the actor, not the target, and the player has `mind: null`.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-08-12T21:33:22-05:00 (worktree base commit)
- **Completed:** 2026-08-12T21:38:07-05:00
- **Tasks:** 2
- **Files modified:** 1 (`sim.js`)

## Accomplishments
- `TUNING.belongingGiveGain` (0.08) and `TUNING.belongingVouchGain` (0.05) — the first positive need deltas anywhere in `sim.js`; every prior `adjustNeed` call site is a `-0.4` drop
- `Give`'s case in `applyEffects` now raises the actor's own `belonging` after a successful transfer, guarded `!actor.isPlayer` (not `!target.isPlayer` like Take/Attack) — the giver, not the recipient, gains
- `Tell`'s case raises the actor's `belonging` only when `params.claim.predicate === 'is_trustworthy'`, guarded against a missing `params.claim` so a malformed Tell can't throw, and does not touch `applyClaimBelief`'s separate existing `is_trustworthy` relationship branch (the recipient's trust/affection, untouched)
- No coercion-detection logic was built: `Give` already carries `consented: true` unconditionally for every call, and `Take` is the codebase's only coercive-transfer verb — D-05's "no coercive framing" qualifier is satisfied by verb identity alone
- `runDecayCheck()` grew from 7 to 10 checks: `belonging-rises-on-give` and `belonging-rises-on-vouch` (both matched-tick comparisons that isolate the trigger's effect from passive regeneration, plus a non-vouch negative control with an exact-0 delta assertion) and `player-give-does-not-throw` (a real player Give + Tell inside a try/catch, protecting the inverted guard direction)

## Task Commits

Each task was committed atomically:

1. **Task 1: belonging hooks in applyEffects' Give and Tell cases** - `48b4284` (feat)
2. **Task 2: DECAY-04 checks appended to runDecayCheck** - `12939a7` (test)

**Plan metadata:** committed together with this SUMMARY.md (see final commit)

## Files Created/Modified
- `sim.js` — Added `TUNING.belongingGiveGain`/`belongingVouchGain`; added a guarded `belonging`-raising hook to `applyEffects`'s `Give` case (`!actor.isPlayer`) and `Tell` case (`!actor.isPlayer && params.claim?.predicate === 'is_trustworthy'`); appended three checks (`belonging-rises-on-give`, `belonging-rises-on-vouch`, `player-give-does-not-throw`) to `runDecayCheck()`

## Decisions Made
See `key-decisions` in frontmatter. Summarized: gain magnitudes chosen once and locked (give > vouch, reflecting the heavier social cost of giving up an owned item vs. speaking well of someone); no consent/coercion heuristic invented since `Give` vs. `Take` already encodes that distinction; the Tell hook independently guards a missing `params.claim` rather than trusting `checkPreconditions` ran first; the new checks use a minimal synthetic `{ mind: { needs: { belonging: record } } }` object rather than a full agent for the "what would this have been with no trigger" half of each matched-tick comparison; the player-guard check exercises both Give and Tell in one try/catch rather than splitting into two checks.

## Deviations from Plan

None - plan executed exactly as written. Both tasks' automated verify commands, acceptance-criteria greps, and negative controls passed as designed.

## Issues Encountered

One notable empirical finding from the guard-flip negative control, recorded precisely because it differs from the plan's literal prediction: the plan's acceptance criteria expected the guard flip (`!actor.isPlayer` → `!target.isPlayer`) to make `player-give-does-not-throw` FAIL with a caught error message in its own `detail`. What actually happens is more severe — an **earlier**, pre-existing check from Plan 03-01 (`known-false-belief-survives-pruning`, which performs a real `performAction(world, 'player', 'Give', {...})` as an incidental side effect of testing belief pruning, with no try/catch of its own) hits the flipped guard first and throws an **uncaught** `TypeError: Cannot read properties of null (reading 'needs')` that crashes `runDecayCheck()` entirely, before execution ever reaches the `player-give-does-not-throw` check. This is arguably stronger evidence of the guard's correctness (the flip breaks the whole check suite, not just the one check written to test it), but it means the *literal* wording of the acceptance criterion ("makes `player-give-does-not-throw` FAIL with the caught... message in its detail") doesn't describe what's observed. Verified precisely — see Verbatim Verification Evidence below — then reverted cleanly with no residue (`git diff sim.js` showed only Task 2's own additions afterward).

## User Setup Required

None - no external service configuration required.

## Verbatim Verification Evidence

### Ten check lines from `node scripts/verify.js`, under "Belief decay & needs regeneration (DECAY-01..05)"

```
PASS belief-decay-matches-memory-formula :: t=5: beliefConfidence=0.8 memoryStrength=0.8, t=10: beliefConfidence=0.7153799465421251 memoryStrength=0.7153799465421251, t=25: beliefConfidence=0.5115370405306076 memoryStrength=0.5115370405306076, t=60: beliefConfidence=0.23388615311953742 memoryStrength=0.23388615311953742
PASS belief-confidence-decays-with-age :: tick5=0.8 (stored confidence=0.8), tick10=0.7153799465421251, tick60=0.23388615311953742
PASS known-false-belief-survives-pruning :: belief count before=2, after=2; known-false id "decay-check-known-false" survived the push
PASS stale-belief-is-pruned :: computed beliefConfidence at push tick=0.003125, TUNING.beliefPruneFloor=0.03; stale id "decay-check-stale" was pruned
PASS needs-regenerate-over-time :: safety at formation (tick 4)=0.6, at +20=0.7329568112979623, at +100=0.9469521776420988
PASS all-three-needs-regenerate :: sustenance: formation(tick 4)=0.6, +20=0.7329568112979623, +100=0.9469521776420988; belonging: formation=0.6, +20=0.7329568112979623, +100=0.9469521776420988
PASS needvalue-is-pure :: agents=5, reads=75, needs unchanged=true
PASS belonging-rises-on-give :: matched tick=0: no-trigger baseline=0.6, after real Give=0.6799999999999999, TUNING.belongingGiveGain=0.08
PASS belonging-rises-on-vouch :: vouch matched tick=0: no-trigger baseline=0.6, after is_trustworthy Tell=0.65, delta=0.050000000000000044; non-vouch (stole_from) Tell stored record before={"value":0.6,"tick":0}, after={"value":0.6,"tick":0}, delta=0
PASS player-give-does-not-throw :: both player actions completed
OVERALL: FAIL
```

`OVERALL: FAIL` is the expected, correct signal for this plan (and every plan in this phase before Plan 03-05's re-bless) — the sole `FAIL` line is `snapshot-matches-baseline`, carried over unchanged from Plan 03-02's structural `{value, tick}` needs-shape diff. This plan added zero new baseline-diff sources of its own (`belonging`'s trigger doesn't change `NEED_DEFAULTS`, the needs shape, or anything else `snapshotWorld()` serializes differently than Plan 03-02 already changed): the diff is identical in field count (12) and content to Plan 03-02's own recorded diff. `order-matches-baseline` and all four qualitative ordering checks continue to PASS unchanged. No `scripts/*.json` file was modified (`git status --short scripts/` clean throughout); `--update-baseline` was never run, per this plan's explicit prohibition.

### Negative control 1 — Give hook's guard temporarily flipped `!actor.isPlayer` → `!target.isPlayer`

Did **not** produce a caught failure inside `player-give-does-not-throw`'s own `detail` as the acceptance criteria predicted. Instead, `runDecayCheck()` itself threw uncaught, because an earlier check (`known-false-belief-survives-pruning`, Plan 03-01) performs its own real `performAction(world, 'player', 'Give', {...})` with no try/catch around it, and hit the flipped guard first:

```
runDecayCheck() itself threw uncaught: Cannot read properties of null (reading 'needs')
```

Full stack trace observed:
```
TypeError: Cannot read properties of null (reading 'needs')
    at needValue (sim.js:549)
    at adjustNeed (sim.js:564)
    at applyEffects (sim.js:426)
    at performAction (sim.js:334)
    at Object.runDecayCheck (sim.js:1964)
```
(`sim.js:1964` is Plan 03-01's `known-false-belief-survives-pruning` check's own `performAction(world, 'player', 'Give', { targetId: 'ives', item: 'gold', quantity: 1 })` call, not this plan's new checks.)

This is a strictly stronger negative-control result than the plan predicted (an uncaught crash of the entire check runner, rather than one check failing gracefully with a caught message) — the guard direction is proven load-bearing beyond just this plan's own new coverage. Reverted immediately after capturing this output; `git diff sim.js` showed only Task 2's own additions with no `!target.isPlayer` residue in the `Give` case before committing.

### Negative control 2 — `TUNING.belongingGiveGain` temporarily set to `0`

```json
{
  "name": "belonging-rises-on-give",
  "pass": false,
  "detail": "matched tick=0: no-trigger baseline=0.6, after real Give=0.6, TUNING.belongingGiveGain=0"
}
```

Correctly FAILs (the matched-tick comparison collapses to `0.6 === 0.6`, not vacuously true). Restored to `0.08` immediately after; `git diff sim.js` showed no residue before committing.

### `git status --short` after both task commits

```
(clean)
```

## Next Phase Readiness
- `belonging` now has two real, checked triggers — `PERSON-MODEL.md`'s "wired to nothing anywhere — pure stub, permanently" line for `belonging` is factually false as of this plan; Plan 03-05 owns updating that doc (already flagged as owed debt in Plan 03-02's SUMMARY, this plan adds no new doc-sync debt of its own beyond what 03-02 already deferred)
- `TUNING.belongingGiveGain`/`belongingVouchGain` are locked values, not provisional — no further tuning is expected from later plans in this phase
- `runDecayCheck()`'s check array remains easy to extend — 10 checks now, stable names, ready for Plan 03-04's hysteresis checks to append further
- No blockers for 03-04 or 03-05
- Flagged for Plan 03-05's awareness (not a blocker, but worth reading before any further check-suite changes): `known-false-belief-survives-pruning` (Plan 03-01) performs a real player `Give` with no try/catch of its own — harmless today since the guard is correct, but it's the reason the guard-flip negative control in this plan crashed the whole runner instead of failing one check gracefully; any future change to Give's guard logic will surface there first, not in this plan's own checks

---
*Phase: 03-belief-decay-needs-regeneration*
*Completed: 2026-08-12*

## Self-Check: PASSED

- FOUND: sim.js
- FOUND: .planning/phases/03-belief-decay-needs-regeneration/03-03-SUMMARY.md
- FOUND commit: 48b4284 (Task 1)
- FOUND commit: 12939a7 (Task 2)
