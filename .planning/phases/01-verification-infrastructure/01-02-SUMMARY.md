---
phase: 01-verification-infrastructure
plan: 02
subsystem: testing (engine-side regression harness, sim.js)
tags: [snapshot-diff, regression-check, competitivejungle, verification-infrastructure]

# Dependency graph
requires:
  - phase: 01-verification-infrastructure (plan 01)
    provides: "Sim.seedRng(world, seed) / world.rng stream, Sim.DEFAULT_SEED, Sim.isDriftEnabled(world), Sim.TUNING"
provides:
  - "Sim.scenarioParticipants(world) — derives the involved-agent set from the event log and per-agent perception state, never a hardcoded count"
  - "Sim.snapshotWorld(world, agentIds) — plain, Set-safe, JSON-round-trippable scenario snapshot"
  - "Sim.diffSnapshots(before, after) / Sim.formatDiff(diffs) — pure, deterministic, human-readable field-by-field diff"
  - "Sim.runRegressionCheck(opts) — reproduces PERSON-MODEL.md's two-clone CompetitiveJungle case as a seeded, drift-off, repeatable check; optional baseline diffing"
affects: ["01-03 (scripts/verify.js consumer)", "Phase 2 witness-ordering baseline (reuses scenarioParticipants/snapshotWorld/diffSnapshots verbatim)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two isolated worlds per scenario variant (not one shared world with two clones) to keep a qualitative behavioral assertion independent of witness-reaction ordering"
    - "Result-object idiom (never throw, never print) extended to a whole-scenario check function, not just a single action"
    - "Snapshot scoping derived from event log + per-agent perception state (scenarioParticipants), reused unmodified by Phase 2's witness-ordering baseline per D-09.1 (LOCKED)"

key-files:
  created: []
  modified:
    - sim.js

key-decisions:
  - "CLONE_SPEC used exactly the plan's suggested starting values (W=0.8, boldness 0.6, neuroticism 0.4, rest OCEAN 0.5, Justice value weight 0.3) — all five checks passed on the first run, so no tuning iteration was needed."
  - "clone-specs-differ-in-exactly-one-field check compares clones' mind.personality/mind.values by JSON.stringify equality and mind.worldview by exact sign-normalized weight match, rather than a generic deep-diff, since the clone spec's shape is small and fully known."
  - "positive-clone-attacks-player and negative-clone-takes-no-action are both scoped by causedBy === <the player's Attack event id>, symmetric, per D-09/plan spec — this is what makes the negative check correct even though the victim mara reacts (gossips) before the clone perceives the original event in each isolated world."
  - "reactions-diverge matches mind.log entries by an exact trigger string (\`ev#<id> Attack by player\`), not a substring match, avoiding any ev#1/ev#10-style collision risk in later phases."

requirements-completed: [VERIF-01]

# Metrics
duration: ~15min (execution work; excludes the Task 4 human checkpoint pause)
completed: 2026-08-12
---

# Phase 01 Plan 02: Regression Harness + Two-Clone CompetitiveJungle Reproduction Summary

**Built `Sim.scenarioParticipants`/`snapshotWorld`/`diffSnapshots`/`formatDiff`/`runRegressionCheck` in sim.js; the two-clone CompetitiveJungle case reproduced cleanly on the plan's starting tuning values (Branch A), human-approved, no `scripts/known-mismatch.json` written.**

## Performance

- **Duration:** ~15 min of active execution work across Tasks 1-3, plus a Task 4 checkpoint pause for human review
- **Completed:** 2026-08-12
- **Tasks:** 4 (3 `auto`, 1 `checkpoint:human-verify`)
- **Files modified:** 1 (`sim.js`)

## Accomplishments

- `Sim.scenarioParticipants(world)` derives which agents a scenario actually involved (actors, targets, and any perceiving-but-inactive bystander) with no hardcoded count — D-09.1, LOCKED, built explicitly for reuse by Phase 2's witness-ordering baseline.
- `Sim.snapshotWorld(world, agentIds)` produces a plain, `Set`-safe, JSON-round-trippable scenario snapshot (`{ seed, rngCalls, tick, nextEventId, events, agents }`), scoped by `scenarioParticipants` when no explicit id list is given, without mutating `world`.
- `Sim.diffSnapshots(before, after)` / `Sim.formatDiff(diffs)` give a pure, deterministic, field-by-field diff (dotted paths, sorted key order, ASCII `->` arrows) rather than a raw JSON comparison.
- `Sim.runRegressionCheck(opts)` reproduces PERSON-MODEL.md's two-clone `CompetitiveJungle` case as a repeatable, seeded (`DEFAULT_SEED`), drift-off check, returning a structured `{ pass, checks, snapshots }` (plus `diffs` when a baseline is supplied), and lands cleanly in **Branch A**: the documented claim reproduces, all five checks pass, no mismatch file was ever written.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add scenarioParticipants and snapshotWorld** — `34c53e5` (feat)
2. **Task 2: Add diffSnapshots and formatDiff** — `defbc33` (feat)
3. **Task 3: Add runRegressionCheck reproducing the two-clone CompetitiveJungle case** — `c1fc4d4` (feat)
4. **Task 4: checkpoint (human-verify)** — no code change; disposition recorded below.

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `sim.js` — added `scenarioParticipants`, `snapshotWorld`, `diffSnapshots`, `formatDiff`, `CLONE_SPEC`, `buildCloneVariant`, `runRegressionCheck`; all five new public functions registered on the `Sim` object literal. No other file touched. `createWorld()` unmodified (confirmed by diff-hunk inspection: all changes are additive, appended after `pickScapegoat`/`clamp`, none inside `createWorld()`'s body).

## The Final CLONE_SPEC and Reproduction Result

```js
const CLONE_SPEC = {
  cloneId: 'ives',
  victimId: 'mara',
  weightMagnitude: 0.8,
  personality: {
    openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
    agreeableness: 0.5, neuroticism: 0.4, boldness: 0.6,
  },
  values: [{ value: 'Justice', weight: 0.3 }],
};
```

This is exactly the plan's suggested starting spec — no tuning iteration was required. The two isolated worlds (`jungle`: `CompetitiveJungle` weight `+0.8`; `averse`: `-0.8`), each seeded with `DEFAULT_SEED` and `driftEnabled: false`, both had the player Attack `mara`; each scenario's snapshot resolved to participants `ives, mara, player` (via `scenarioParticipants` — `tomas`/`elena`/`garrick` were relocated to `'away'` and excluded, as intended).

**Both clones' verbatim `mind.log` `chose` labels for the judged event:**
- Positive clone (`jungle`, `CompetitiveJungle: +0.8`): **`"attack player"`**
- Negative clone (`averse`, `CompetitiveJungle: -0.8`): **`"do nothing"`**

Full check output:

```
PASS clone-specs-differ-in-exactly-one-field :: personality and values are identical between clones; worldview differs only in the CompetitiveJungle weight sign (+0.8 vs -0.8)
PASS drift-disabled :: jungle isDriftEnabled=false, averse isDriftEnabled=false
PASS positive-clone-attacks-player :: ives attacked player as event #3, caused by #1
PASS negative-clone-takes-no-action :: ives took no action in response to event #1
PASS reactions-diverge :: positive clone chose "attack player"; negative clone chose "do nothing"
pass=true
```

**Outcome branch taken: Branch A** — all five checks passed; `scripts/known-mismatch.json` was never created (confirmed by `git status --short` showing no untracked/modified paths outside `sim.js` at every commit point).

## Task 4 Checkpoint — Human Disposition

The human was shown the full verbatim check list above (Branch A — no `scripts/known-mismatch.json` contents to show, since none was written) and replied **`approved`**: all five checks passed, no implementation defect was identified, nothing in `sim.js` needed to change in response to the checkpoint.

Task 4's post-condition `<automated>` check was then run and confirmed the disposition programmatically:

```
checkpoint outcome: approved (documented claim reproduces)
```

No changes were made to `sim.js` or the check logic as a result of this checkpoint, and no second differing field was introduced between the two clone variants.

## Decisions Made

- Used the plan's exact suggested `CLONE_SPEC` starting values without adjustment — the reproduction succeeded on the first run, so the plan's "tuning procedure with hard guardrails" and its structural lever (`world.agents[victimId].mind.reactedEventIds.add(1)`) were never invoked. This keeps the fixture as close to the plan's own suggested spec as possible.
- `positive-clone-attacks-player` / `negative-clone-takes-no-action` are both scoped by `causedBy === <the player's Attack event id>` rather than "any/no event by the clone" — the victim (`mara`) does react first in each isolated world (she gossips), and that intervening event is not the variable under test; scoping by `causedBy` keeps both checks symmetric and correct regardless of that intervening reaction.
- `reactions-diverge` matches `mind.log` entries by an *exact* `trigger` string (`` `ev#${id} Attack by player` ``), not a substring test — avoids any risk of `ev#1` matching `ev#10` once more events exist in later-phase scenarios.

## Deviations from Plan

None — plan executed exactly as written. The plan's own text anticipated both outcome branches (reproduction vs. tuning-then-mismatch-escalation); Branch A held on the first run with the plan's own suggested starting values, so no tuning, no `scripts/known-mismatch.json`, and no deviation from the specified procedure was needed.

## Issues Encountered

**Worktree base drift (caught before any file write).** At the start of this session, this worktree's branch (`worktree-agent-ae4d4ad5251f3b149`) was still based on the pre-Wave-1 commit (`e8925a3`, "docs: map existing codebase") rather than the Wave-1-completion commit (`8afb545bf58ebd7f1577138847c7f992b5714c39`) named in the mandatory `worktree_branch_check` step. An initial round of file reads was (harmlessly) done against the main checkout path instead of the worktree path before this was caught. Corrected by running the plan's mandated `worktree_branch_check` step (`git reset --hard 8afb545bf58ebd7f1577138847c7f992b5714c39`, after confirming HEAD was on the expected `worktree-agent-*` branch, not detached, not a protected ref) before any Edit/Write call. All subsequent reads, edits, and verification commands were run with `cwd` explicitly set to the worktree root on every Bash call. No code was written before this correction; no impact on the delivered work.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `scripts/verify.js` (Plan 01-03) can now call `Sim.runRegressionCheck()` directly and has everything it needs: a pass/fail structure, human-readable diff formatting via `Sim.formatDiff`, and scenario snapshots ready to persist as `scripts/baseline.json`.
- `Sim.scenarioParticipants`/`Sim.snapshotWorld`/`Sim.diffSnapshots` are general-purpose and unmodified by any scenario-specific logic — Phase 2's witness-ordering baseline can reuse them verbatim with a 3+-agent scenario (attacker, victim, multiple bystanders), per D-09.1.
- No blockers. `scripts/known-mismatch.json` does not exist in this worktree — there is nothing for Plan 01-03's `verify.js` to special-case as `KNOWN-MISMATCH` when it lands.

---
*Phase: 01-verification-infrastructure*
*Completed: 2026-08-12*
