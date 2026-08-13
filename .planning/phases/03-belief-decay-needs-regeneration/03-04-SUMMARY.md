---
phase: 03-belief-decay-needs-regeneration
plan: 04
subsystem: engine
tags: [needs, retreat, hysteresis, scoreCandidates, decideAndAct, verification, sim.js]

# Dependency graph
requires:
  - phase: 03-belief-decay-needs-regeneration
    plan: 02
    provides: "NEED_DEFAULTS, the {value, tick} needs shape, needValue(), tick-threaded adjustNeed(agent, needName, delta, tick)"
  - phase: 03-belief-decay-needs-regeneration
    plan: 03
    provides: "runDecayCheck() runner this plan appends four checks to (10 -> 14 total)"
  - phase: 02-witness-reaction-ordering
    plan: 03
    provides: "the pure, twice-called scoreCandidates() contract (orderWitnesses' read-only ranking pre-pass + decideAndAct's real dispatch) this plan's purity constraint depends on; the atReactionDepthCap/hasAlreadyReacted named-guard precedent this plan's isCurrentlyRetreating follows"
provides:
  - "TUNING.retreatSafetyEnter (0.65) / retreatSafetyExit (0.75) — the two-threshold hysteresis band replacing the old flat safety < 0.7 retreat gate (D-07)"
  - "isCurrentlyRetreating(agent) — read-only, exported on Sim, scans mind.log backward for the most recent entry carrying retreatForSafety (presence, not truthiness)"
  - "The safetyDriven flag on the retreat candidate (scoreCandidates) and the retreatForSafety marker on decideAndAct's winner log write — together discriminate a safety-driven retreat from a fear-driven one"
  - "Four more runDecayCheck() checks (hysteresis-enter-threshold-holds, hysteresis-persists-in-band, hysteresis-exit-threshold-holds, fear-driven-retreat-does-not-latch-safety), total now 14"
  - "Verified (not assumed): all four ORDER-01 qualitative checks stay green with D-04 (needs regen) and D-07 (retreat hysteresis) both live together, at the existing TUNING.needRegenRate = 0.02 — no rate tuning needed"
affects: [03-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hysteresis via a log-scan latch, not a new mind-box field: the marker (retreatForSafety) lives on a mind.log ENTRY (not the mind object itself), read backward-only by a named helper placed beside its consumer, written only from the one place (decideAndAct's winner log push) that the pure twice-called scoreCandidates() never reaches"
    - "Hand-built, never-performAction'd probe events for scoring outside perceiveEvent: appraiseEvent/scoreCandidates only ever read an event object's fields, so a synthetic { id, actor, verb, data, tick, location } object scores exactly like a real one without touching world.events/world.tick or triggering a reaction cascade — used for all four hysteresis checks instead of a real Attack"
    - "Setup-vs-write-path distinction in a check: manipulating rel.fear/pushEmotion directly is legitimate harness setup (not a second write path into the mechanism), but the DECISION being tested (which log entry gets written, with what retreatForSafety value) must come from a real decideAndAct call, never a hand-pushed log entry"

key-files:
  created: []
  modified:
    - sim.js

key-decisions:
  - "isCurrentlyRetreating scans strictly by property PRESENCE (retreatForSafety !== undefined), not by 'chose === retreat' label matching — a label-only scan cannot tell a fear-driven retreat from a safety-driven one, which is exactly the bug this plan's revision exists to prevent (verified by a negative control that reintroduces the label-only rule and turns fear-driven-retreat-does-not-latch-safety red)"
  - "No-reaction log entries (do-nothing/barely-noticed) deliberately never carry retreatForSafety at all, so the backward scan skips them — an indifferent reaction cannot silently clear a real retreating latch"
  - "Accepted, documented residue: if a latched witness's safety rises above Exit and every subsequent decision produces only a no-reaction entry (or nothing, whenever appraisal.impact >= 0), the latch stays true until the next winner entry. Nothing that writes only from decideAndAct can close that unlogged window; a mind field would have the identical hole. Recorded in a comment rather than chased with a sweep or a write from scoreCandidates."
  - "fear-driven-retreat-does-not-latch-safety's witness is the lowest-boldness NPC selected dynamically (Array.reduce over boldness), not hardcoded to 'mara' — matches the personality-values-locked constraint (never assign to personality itself) while staying robust if createWorld's numbers ever change"
  - "The check's fear-driven regime uses rel.fear = 1 and a pushed Fear-emotion intensity of 5 — well beyond the plan's own example (0.8) — because the gossip candidate's fixed (-impact)*0.5 baseline term (~0.59 for this scenario) beats retreat's fear term at fear=0.8; this is the explicitly sanctioned 'if no seeded NPC makes retreat win, raise rel.fear/the Fear emotion further rather than touching personality' escape hatch, exercised for real rather than assumed to be unnecessary"
  - "TUNING.needRegenRate's comment was rewritten from 'PROVISIONAL — finalized in Plan 03-05' to record it as verified-not-provisional: Task 3 confirmed all four ORDER-01 checks and all fourteen decay checks pass at 0.02 with no tuning needed, so the rate itself is locked as of this plan (Plan 03-05 still owns the golden-master JSON re-bless, a separate concern)"

requirements-completed: [DECAY-05]

# Metrics
duration: ~12min
completed: 2026-08-12
---

# Phase 3 Plan 04: Retreat-Gate Hysteresis Summary

**Replaced the flat `safety < 0.7` retreat gate with a two-threshold hysteresis band (Enter 0.65 / Exit 0.75) driven by a pure, backward-scanning `isCurrentlyRetreating()` log helper that reads a `retreatForSafety` marker `decideAndAct` writes only at real dispatch — never during `orderWitnesses`' read-only ranking pre-pass — so `scoreCandidates` stays provably pure while a fear-driven retreat is demonstrably never mistaken for a safety-driven one.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-08-12T21:40:00-05:00 (worktree base commit `af1ce23`)
- **Completed:** 2026-08-12T21:51:47-05:00
- **Tasks:** 3
- **Files modified:** 1 (`sim.js`)

## Accomplishments
- `TUNING.retreatSafetyEnter` (0.65) / `TUNING.retreatSafetyExit` (0.75) — symmetric ±0.05 band around the old flat 0.7 cutoff (D-07), with a comment naming which threshold does what so the pair can't be transposed by a later reader
- `scoreCandidates`'s retreat gate now computes a named `safetyGate` local via `isCurrentlyRetreating(witness) ? safety < TUNING.retreatSafetyExit : safety < TUNING.retreatSafetyEnter`, substituted for the old `safety < 0.7` term — the other two disjuncts (`rel.fear > 0.3`, `fearEmotion > 0.2`) are untouched
- The retreat candidate now carries a `safetyDriven: safetyGate` field (plain returned data, not a write) recording WHY the gate opened; `decideAndAct`'s existing winner log write gains exactly one new property, `retreatForSafety: best.label === 'retreat' && best.safetyDriven === true` — the only write in the whole mechanism, living where log writes already live so the pre-pass can never trigger it
- `isCurrentlyRetreating(agent)` — new read-only helper, exported on `Sim`, scans `mind.log` backward for the most recent entry carrying `retreatForSafety` (tested by presence, `!== undefined`, not truthiness) and returns its boolean value, or `false` for a null/absent mind or empty log
- `runDecayCheck()` grew from 10 to 14 checks: `hysteresis-enter-threshold-holds`, `hysteresis-persists-in-band` (the direct ROADMAP Phase 3 success criterion 5 statement — zero retreat/non-retreat transitions across a five-tick in-band oscillation), `hysteresis-exit-threshold-holds`, and `fear-driven-retreat-does-not-latch-safety` (the discrimination check, driven through a real `decideAndAct` call rather than a hand-pushed log entry)
- Verified, not assumed: all four ORDER-01 qualitative checks and all fourteen decay checks pass simultaneously at the pre-existing `TUNING.needRegenRate = 0.02` — no tuning was needed, confirming D-04 (needs regeneration) and D-07 (this plan's hysteresis) don't destabilize Phase 2's locked witness-dispatch-order fixture when both are live together for the first time

## Task Commits

Each task was committed atomically:

1. **Task 1: two-threshold retreat gate + safetyDriven/retreatForSafety marker + isCurrentlyRetreating() helper** - `5cd2b6f` (feat)
2. **Task 2: scripted oscillation harness + DECAY-05 checks** - `f56680f` (test)
3. **Task 3: ORDER-01 qualitative regression verification under the live D-04 + D-07 pair** - `12704f6` (docs — no behavior change, comment update only)

**Plan metadata:** committed together with this SUMMARY.md (see final commit)

## Files Created/Modified
- `sim.js` — Added `TUNING.retreatSafetyEnter`/`retreatSafetyExit`; added `isCurrentlyRetreating(agent)` (exported on `Sim`); changed `scoreCandidates`'s retreat gate to a banded `safetyGate` local and added `safetyDriven` to the retreat candidate; added `retreatForSafety` to `decideAndAct`'s winner log write; appended four checks (`hysteresis-enter-threshold-holds`, `hysteresis-persists-in-band`, `hysteresis-exit-threshold-holds`, `fear-driven-retreat-does-not-latch-safety`) to `runDecayCheck()`; rewrote `TUNING.needRegenRate`'s comment from provisional to verified

## Decisions Made
See `key-decisions` in frontmatter. Summarized: the latch is a strict property-presence scan (not label matching) specifically to discriminate a fear-driven retreat from a safety-driven one; no-reaction entries never carry the marker so an indifferent reaction can't clear a real latch; the documented residue (a latched witness whose safety recovers but who then only logs no-reaction entries) is accepted rather than chased with new state; the discrimination check dynamically selects the lowest-boldness NPC and uses a much larger fear/Fear-emotion magnitude than the plan's own example because the gossip candidate's fixed impact-scaled baseline term otherwise outscores retreat at the plan's suggested 0.8; the `needRegenRate` comment now reflects that the rate is verified, not still provisional.

## Deviations from Plan

None requiring a code-behavior change. One acceptance-criterion wording note worth recording precisely:

**Acceptance criterion wording mismatch (not a deviation from the plan's intent):** Task 1's acceptance criteria state `grep -c 'witness.mind.log.push' sim.js` should be `2`. The actual whole-file count is `7` both before and after this plan's edits (confirmed via `git show HEAD:sim.js` on the pre-plan base commit) — `witness.mind.log.push` appears at several other, pre-existing sites in the file unrelated to `decideAndAct` (goal-reassessment logging, gossip-resolution logging, etc.). The criterion's real intent — "the marker was added to the existing winner write, not as a third log write" — was verified the correct way: within `decideAndAct`'s own body there are exactly 2 `witness.mind.log.push` calls (the no-reaction entry and the winner entry), unchanged in count from before this plan, with the new `retreatForSafety` property added to the existing winner-entry object literal rather than as a new call site. No code change resulted from this; it's the same category of stale-context imprecision the plan itself flags elsewhere ("re-grep before editing... exact line may have shifted").

**Finding recorded per the plan's `<output>` instructions:** the plan's context predicted "`retreatForSafety` should produce NO golden-master snapshot diff of its own... since `presentation.js` reads log entries by named field." This held for the UI (presentation.js is unaffected, confirmed by inspection — it reads `d.trigger`/`d.considered`/`d.chose`/`d.why` by name, never iterates keys), but the premise didn't extend to `snapshotWorld()`, which serializes the full raw `agent.mind.log` array via `JSON.stringify` — an entirely different mechanism from presentation.js's rendering, and one that does capture every key on every log entry regardless of whether anything reads it back. So the diff DID grow because of the new property: 17 fields now differ, reconciling exactly as 12 (the pre-existing Plan 03-02 `{value, tick}` needs-shape diff, carried forward unchanged from 03-03-SUMMARY.md's own recorded count) + 5 new (`mind.log.N.retreatForSafety: (absent) -> false`, one per pre-existing logged decision in the two-clone fixture). This plan added exactly one new diff source — the `retreatForSafety` field — and nothing else. See the verbatim `Baseline diff:` block below. This is expected, harmless, and already covered by the plan's explicit "the only FAIL lines are the baseline checks" gate — `order-matches-baseline` in particular stayed green throughout, confirming dispatch order itself is untouched. Plan 03-05 owns the re-bless.

## Issues Encountered

None beyond the two notes above, both resolved by verifying the actual (correct) invariant rather than the literally-worded one.

## User Setup Required

None — no external service configuration required.

## Verbatim Verification Evidence

### All fourteen decay check lines from `node scripts/verify.js`, under "Belief decay & needs regeneration (DECAY-01..05)"

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
PASS hysteresis-enter-threshold-holds :: no-history witness: safety=0.72 -> retreat present=false; safety=0.68 -> retreat present=false; safety=0.60 -> retreat present=true (TUNING.retreatSafetyEnter=0.65)
PASS hysteresis-persists-in-band :: witness-with-history, sequence=0.66,0.72,0.68,0.74,0.66: present=true,true,true,true,true, transitions=0 (TUNING.retreatSafetyEnter=0.65, TUNING.retreatSafetyExit=0.75)
PASS hysteresis-exit-threshold-holds :: witness-with-history: safety=0.78 -> retreat present=false (TUNING.retreatSafetyExit=0.75)
PASS fear-driven-retreat-does-not-latch-safety :: fear-driven decision: safety=0.95, chose="retreat", retreatForSafety=false; quiet-regime sample: fear=0.2, fearEmotion=0, safety=0.70 -> retreat present=false
OVERALL: FAIL
```

`OVERALL: FAIL` is expected — the sole `FAIL` line is `snapshot-matches-baseline` (see below); `order-matches-baseline` stayed `PASS` (dispatch order itself is untouched by this plan). `--update-baseline` was never run; `scripts/known-mismatch.json` does not exist; `git status --short scripts/` showed no changes throughout.

### `Baseline diff:` block for Plan 03-05 (verbatim)

```
FAIL snapshot-matches-baseline :: 17 field(s) differ from the supplied baseline
Baseline diff:
  jungle.agents.ives.mind.log.0.retreatForSafety: (absent) -> false
  jungle.agents.ives.mind.needs.belonging: 0.6 -> {"value":0.6,"tick":0}
  jungle.agents.ives.mind.needs.safety: 1 -> {"value":1,"tick":0}
  jungle.agents.ives.mind.needs.sustenance: 1 -> {"value":1,"tick":0}
  jungle.agents.mara.mind.log.0.retreatForSafety: (absent) -> false
  jungle.agents.mara.mind.log.1.retreatForSafety: (absent) -> false
  jungle.agents.mara.mind.needs.belonging: 0.6 -> {"value":0.6,"tick":0}
  jungle.agents.mara.mind.needs.safety: 0.6 -> {"value":0.6,"tick":0}
  jungle.agents.mara.mind.needs.sustenance: 1 -> {"value":1,"tick":0}
  averse.agents.ives.mind.log.0.retreatForSafety: (absent) -> false
  averse.agents.ives.mind.needs.belonging: 0.6 -> {"value":0.6,"tick":0}
  averse.agents.ives.mind.needs.safety: 1 -> {"value":1,"tick":0}
  averse.agents.ives.mind.needs.sustenance: 1 -> {"value":1,"tick":0}
  averse.agents.mara.mind.log.0.retreatForSafety: (absent) -> false
  averse.agents.mara.mind.needs.belonging: 0.6 -> {"value":0.6,"tick":0}
  averse.agents.mara.mind.needs.safety: 0.6 -> {"value":0.6,"tick":0}
  averse.agents.mara.mind.needs.sustenance: 1 -> {"value":1,"tick":0}
```

Reconciles cleanly as 12 + 5 = 17: the 12 `mind.needs.*` entries (`belonging`/`safety`/`sustenance` × `{jungle,averse}` × `{ives,mara}`) are carried forward unchanged from 03-03-SUMMARY.md's own recorded diff (Plan 03-02's `{value, tick}` needs-shape change) — this plan added zero new diff sources of that kind. The 5 new entries this plan DOES add are exactly the `mind.log.N.retreatForSafety: (absent) -> false` lines, one per pre-existing logged decision in the two-clone `CompetitiveJungle` fixture (`jungle.ives.log.0`, `jungle.mara.log.0`, `jungle.mara.log.1`, `averse.ives.log.0`, `averse.mara.log.0`) — every decision any of those agents made before this plan's `decideAndAct` change now also carries the new property. This is the single new diff source this plan introduces, and it's exactly the `retreatForSafety` field, nothing else.

### All four ORDER-01 qualitative check lines (Task 3)

```
PASS dispatch-order-differs-from-agent-list :: dispatch order: garrick,elena,mara,tomas,ives | agent-list order: mara,ives,tomas,elena,garrick
PASS victim-dispatched-first :: garrick (the victim) is dispatched first
PASS victim-retaliates-first :: first reaction to event #1 is garrick:Attack->player
PASS indifferent-witness-dispatched-last :: ives (appraised impact in decideAndAct's no-reaction band) is dispatched last, despite sitting at index 1 of 5 in agent-list order
```

Dispatch order and first reaction are byte-identical to 02-03-SUMMARY.md's recorded `garrick,elena,mara,tomas,ives` / `garrick:Attack->player` — no difference to explain. `garrick`'s origin-event `mind.log` entry also came out byte-identical to 02-03-SUMMARY.md's pinned margin:

```
garrick considered: attack player=0.74 | tell mara about player=0.58 | press player for an explanation=0.33 | retreat=0.08 | do nothing=0.05
garrick chose: attack player
```

No regeneration-rate tuning was needed or performed — `TUNING.needRegenRate` stayed at `0.02` throughout Task 3, verified (not just left alone) against `ORDER_SPEC`.

### Negative control 1 — collapsed the band (`TUNING.retreatSafetyExit` set equal to `TUNING.retreatSafetyEnter`, 0.65)

```json
{
  "name": "hysteresis-persists-in-band",
  "pass": false,
  "detail": "witness-with-history, sequence=0.66,0.72,0.68,0.74,0.66: present=false,false,false,false,false, transitions=0 (TUNING.retreatSafetyEnter=0.65, TUNING.retreatSafetyExit=0.65)"
}
```

Matches the plan's corrected acceptance criteria exactly: retreat candidate present at ZERO of five samples, transitions=0 — collapsing the band makes `safetyGate` false at every sample (since none of `[0.66,0.72,0.68,0.74,0.66]` is `< 0.65`), not a nonzero-transition failure. Reverted immediately; `git diff --stat sim.js` showed the same 184-insertion diff as before the control, confirming clean revert.

### Negative control 2 — forced `isCurrentlyRetreating` to always return `false`

```json
{
  "name": "hysteresis-persists-in-band",
  "pass": false,
  "detail": "witness-with-history, sequence=0.66,0.72,0.68,0.74,0.66: present=false,false,false,false,false, transitions=0 (TUNING.retreatSafetyEnter=0.65, TUNING.retreatSafetyExit=0.75)"
}
```

Same failure shape as control 1 (present at zero of five, transitions=0) — with the helper always returning `false`, every sample uses the stricter Enter threshold (0.65), which none of the sequence values drop below. Reverted immediately; diff confirmed clean.

### Negative control 3 — dropped the `safetyDriven` conjunct (`retreatForSafety: best.label === 'retreat'`, label-only rule)

```json
{
  "name": "fear-driven-retreat-does-not-latch-safety",
  "pass": false,
  "detail": "fear-driven decision: safety=0.95, chose=\"retreat\", retreatForSafety=true; quiet-regime sample: fear=0.2, fearEmotion=0, safety=0.70 -> retreat present=true"
}
```

Exactly the load-bearing failure the plan calls for: with the label-only rule, the fear-driven retreat gets `retreatForSafety: true`, latching the witness onto the looser Exit threshold; the quiet-regime sample at safety 0.70 (inside the band, below Exit but above Enter) then wrongly produces a retreat candidate. Reverted immediately; diff confirmed clean.

### Negative control 4 — harness preconditions are asserted, not assumed

Two sub-controls, exercising the "precondition failed" branches that don't otherwise run (checks 1-3 and check 4 all pass cleanly on the happy path, so these branches are dead code unless deliberately exercised).

**4a — raised the probe witness's `rel.fear` to `0.5` (above the `<=0.3` precondition) before checks 1-3:**

```json
{"name":"hysteresis-enter-threshold-holds","pass":false,"detail":"harness precondition failed: rel.fear=0.5 (want <=0.3), fearEmotion=0 (want <=0.2), appraisal.impact=-1.2 (want <-0.05)"}
{"name":"hysteresis-persists-in-band","pass":false,"detail":"harness precondition failed: rel.fear=0.5 (want <=0.3), fearEmotion=0 (want <=0.2), appraisal.impact=-1.2 (want <-0.05)"}
{"name":"hysteresis-exit-threshold-holds","pass":false,"detail":"harness precondition failed: rel.fear=0.5 (want <=0.3), fearEmotion=0 (want <=0.2), appraisal.impact=-1.2 (want <-0.05)"}
```

All three report the precondition failure in `detail` rather than passing vacuously. Reverted immediately.

**4b — zeroed check 4's `rel.fear`/Fear-emotion setup (so retreat does NOT win the fear-driven decision):**

```json
{
  "name": "fear-driven-retreat-does-not-latch-safety",
  "pass": false,
  "detail": "retreat did not win the fear-driven decision: chose=\"tell tomas about ives\", considered=tell tomas about ives=0.59 | press ives for an explanation=0.36 | do nothing=0.22 | attack ives=0.19"
}
```

Reports the actual winning label and its score rather than passing. Reverted immediately; `git diff --stat sim.js` confirmed clean (empty, since `sim.js` was already committed) after both sub-controls.

### `git status --short` after all three task commits

```
(clean)
```

## Next Phase Readiness
- The retreat gate's hysteresis is fully wired, checked, and negative-controlled; `PERSON-MODEL.md`'s retreat-gate description (if any references the old flat `0.7` cutoff) is Plan 03-05's doc-sync responsibility, flagged here for awareness, not fixed in this plan (out of this plan's stated scope, which is `sim.js` only per `files_modified`)
- `runDecayCheck()` now carries 14 stable-named checks, ready for Plan 03-05 to run as part of final Phase 3 verification
- `TUNING.needRegenRate` is confirmed compatible with the locked `ORDER_SPEC` fixture under both D-04 and D-07 live together — Plan 03-05 does not need to re-verify this, only re-bless the golden-master JSON files to absorb the `{value, tick}` needs shape (Plan 03-02) and the new `retreatForSafety` log field (this plan)
- No blockers for 03-05

---
*Phase: 03-belief-decay-needs-regeneration*
*Completed: 2026-08-12*

## Self-Check: PASSED

- FOUND: sim.js
- FOUND: .planning/phases/03-belief-decay-needs-regeneration/03-04-SUMMARY.md
- FOUND commit: 5cd2b6f (Task 1)
- FOUND commit: f56680f (Task 2)
- FOUND commit: 12704f6 (Task 3)
