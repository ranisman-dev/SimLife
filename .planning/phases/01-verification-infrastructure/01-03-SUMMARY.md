---
phase: 01-verification-infrastructure
plan: 03
subsystem: testing (committed CLI + browser entry points for the engine-side regression check)
tags: [regression-check, golden-master, cli, node, verification-infrastructure, doc-sync]

# Dependency graph
requires:
  - phase: 01-verification-infrastructure (plan 01)
    provides: "Sim.seedRng(world, seed) / world.rng stream, Sim.DEFAULT_SEED, Sim.isDriftEnabled(world), Sim.TUNING"
  - phase: 01-verification-infrastructure (plan 02)
    provides: "Sim.scenarioParticipants, Sim.snapshotWorld, Sim.diffSnapshots, Sim.formatDiff, Sim.runRegressionCheck — the two-clone CompetitiveJungle case, landed in Branch A (no scripts/known-mismatch.json)"
provides:
  - "scripts/verify.js — committed Node CLI: prints per-check status lines, a field-by-field baseline diff, and an OVERALL line; --update-baseline golden-master re-baseline workflow"
  - "scripts/baseline.json — the first committed golden-master snapshot, captured from current HEAD, that Phases 2-7 diff against"
  - "Corrected Phase 2 citation in PERSON-MODEL.md (Roberts/Walton/Viechtbauer 2006, Sherif's Social Judgment Theory, Prochaska & DiClemente's relapse stage)"
affects: ["Phase 2 witness-ordering baseline (reuses the same scripts/verify.js CLI pattern and the D-09 strictness pattern)"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "scripts/ is the repo's first subdirectory and first committed fixture file (scripts/baseline.json) — no package.json, no dependency, plain process.argv.includes('--update-baseline') flag parsing"
    - "--update-baseline refusal is scoped to the five qualitative checks only, never to snapshot-matches-baseline itself — otherwise the golden-master re-baseline workflow (D-09.2) would be permanently unreachable the moment behavior legitimately diverges from a stored baseline, since that check can never be acknowledged either"
    - "known-mismatch.json handling is load-time and name-based (reject snapshot-matches-baseline by name before running anything), not conditioned on whether that check happens to appear in the live result"

key-files:
  created:
    - scripts/verify.js
    - scripts/baseline.json
  modified:
    - PERSON-MODEL.md
    - .planning/PROJECT.md

key-decisions:
  - "Refusal gate under --update-baseline excludes snapshot-matches-baseline by name (confirmed via the tamper-then-rebless test in Task 2: --update-baseline against a deliberately corrupted baseline printed the diff and wrote successfully, proving the review-gate workflow stays reachable)."
  - "The 'unapproved, ignoring' and load-time rejection messages avoid the literal substrings the plan's own verifiers grep against (KNOWN-MISMATCH reserved for real acknowledged failures; no 'document.'/'window.' substrings; no 'Math.random =' substring) — same grep-collision hazard 01-01's SUMMARY first flagged."

requirements-completed: [VERIF-01]

# Metrics
duration: ~50min (execution work across Tasks 1-3, plus a Task 4 human checkpoint pause)
completed: 2026-08-12
---

# Phase 01 Plan 03: scripts/verify.js CLI + Golden-Master Baseline + Citation Fix Summary

**Committed `node scripts/verify.js` (with `--update-baseline` golden-master workflow and known-mismatch.json handling), captured the first `scripts/baseline.json` from current HEAD, and corrected `PERSON-MODEL.md`'s Phase 2 citation from the non-existent "Phelps-Roper framework" to Roberts/Walton/Viechtbauer (2006), Sherif's Social Judgment Theory, and Prochaska & DiClemente's relapse stage.**

## Performance

- **Duration:** ~50 min of active execution work across Tasks 1-3, plus a Task 4 checkpoint pause for human browser verification
- **Completed:** 2026-08-12
- **Tasks:** 4 (3 `auto`, 1 `checkpoint:human-verify`)
- **Files modified:** 4 (`scripts/verify.js` new, `scripts/baseline.json` new, `PERSON-MODEL.md`, `.planning/PROJECT.md`)

## Accomplishments

- `scripts/verify.js` — the repo's first subdirectory and first committed CLI script — requires `sim.js` directly via its dual-export guard, resolves `scripts/baseline.json`/`scripts/known-mismatch.json` via `__dirname` (works from any CWD), and implements the full D-01/D-08/D-09 spec: per-check `PASS`/`FAIL`/`KNOWN-MISMATCH` lines, `STALE-ACK` for resolved acknowledgements, a field-by-field `Sim.formatDiff`-rendered baseline diff, and an `OVERALL: PASS`/`FAIL` line.
- `scripts/baseline.json` — the repo's first committed fixture — captured via `--update-baseline` from current `HEAD`, with the exact top-level shape `{ jungle: {...}, averse: {...} }`, each carrying `agents` and a numeric `seed`, trailing-newline-terminated.
- Full round trip proven: a clean run is green (`OVERALL: PASS`, exit 0); corrupting one nested value (`jungle.agents.ives.health` set to `-999`) makes the plain run fail (exit 1) and print `jungle.agents.ives.health: -999 -> 100`; `--update-baseline` against that same tampered file printed the identical diff *before* writing, proving the re-baseline workflow is a genuine review gate, not a silent overwrite; restoring the backup returned the plain run to green.
- Known-mismatch semantics verified against three synthetic fixtures (all removed afterward — `scripts/known-mismatch.json` does not exist on disk, confirming Plan 02 Branch A held): acknowledging `snapshot-matches-baseline` by name is rejected at load time with exit 1 before anything runs; an acknowledged check that currently passes (`drift-disabled`) prints `STALE-ACK ... remove it from scripts/known-mismatch.json`; a file with `approved: false` is reported as ignored and suppresses nothing.
- `PERSON-MODEL.md`'s Phase 2 gap note (line 301) no longer asserts "The Phelps-Roper framework" — it now cites Roberts, Walton & Viechtbauer (2006)'s cumulative-continuity meta-analysis (slow personality drift), Sherif's Social Judgment Theory (resistance to change/ego-involvement), and Prochaska & DiClemente's relapse stage as a structural parallel (the regression trap) — mirroring `.planning/PROJECT.md:130`'s already-corrected wording, with all surrounding design content (intentional/unintentional change, sustained pressure, regression trap, neuroticism-modulated settling) unchanged.
- `.planning/PROJECT.md`'s now-satisfied "`PERSON-MODEL.md` needs the same correction when Phase 2 lands" clause is removed; the rest of that Key Decisions row (including its record of the incorrect original name) is untouched.
- Task 4 (D-01's second entry point) confirmed by human in a real browser: `Sim.runRegressionCheck()` returns `pass: true` with all five checks `pass: true`, `snapshots.jungle`/`snapshots.averse` present, no `diffs` key; `Sim.formatDiff([])` returns `"no differences"`; `world.seed` is a number.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/verify.js, the committed Node CLI entry point** — `099f595` (feat)
2. **Task 2: Capture the golden-master baseline and prove the round trip** — `7966cbb` (feat)
3. **Task 3: Retire the non-existent Phelps-Roper citation in PERSON-MODEL.md** — `678b7f7` (docs)
4. **Task 4: checkpoint (human-verify)** — no code change; disposition recorded below.

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified

- `scripts/verify.js` — Node-only CLI entry point; owns all printing and filesystem access for the regression check (`sim.js` performs zero I/O, unchanged).
- `scripts/baseline.json` — golden-master snapshot, the reference every later phase's `node scripts/verify.js` diffs against.
- `PERSON-MODEL.md` — corrected Phase 2 gap-note citation.
- `.planning/PROJECT.md` — removed the now-satisfied trailing clause on the Key Decisions row that already carried the correct citation.

## The Green Run (captured baseline, no known-mismatch.json)

```
Seed: 1337
PASS clone-specs-differ-in-exactly-one-field :: personality and values are identical between clones; worldview differs only in the CompetitiveJungle weight sign (+0.8 vs -0.8)
PASS drift-disabled :: jungle isDriftEnabled=false, averse isDriftEnabled=false
PASS positive-clone-attacks-player :: ives attacked player as event #3, caused by #1
PASS negative-clone-takes-no-action :: ives took no action in response to event #1
PASS reactions-diverge :: positive clone chose "attack player"; negative clone chose "do nothing"
PASS snapshot-matches-baseline :: live snapshots match the supplied baseline exactly
OVERALL: PASS
```
Exit code: `0`.

**Participant set each scenario snapshot resolved to:** `ives`, `mara`, `player` (via `Sim.scenarioParticipants` — `tomas`/`elena`/`garrick` relocated to `'away'` and excluded), consistent with 01-02-SUMMARY.md.

**Which of Plan 02's two branches this phase landed in:** Branch A — `scripts/known-mismatch.json` does not exist anywhere in this worktree at the end of this plan; confirmed immediately before Task 2's baseline capture and again after all synthetic test fixtures were removed. There is no approved mismatch in force, so no `KNOWN-MISMATCH` line appears in the captured baseline's reference run, and nothing further needs to be tracked here for that branch.

## Decisions Made

- **`--update-baseline`'s refusal gate excludes `snapshot-matches-baseline` by name.** The plan's exit-code rule for a *plain* run ("acknowledgement never excuses a non-empty diff") is a separate rule from `--update-baseline`'s refusal rule ("refuse to write if any [qualitative] failing check is not covered by an approved acknowledgement"). Scoping refusal to the five qualitative checks only — never to the baseline-diff check itself — is what keeps D-09.2's re-baseline workflow reachable: since `snapshot-matches-baseline` can never be acknowledged (must_haves requirement), including it in the refusal set would make `--update-baseline` permanently unable to write once a baseline first diverges from any later legitimate behavior change. Verified directly in Task 2's tamper test: `--update-baseline` against a deliberately corrupted baseline printed the diff and wrote successfully (did not print `REFUSED`), proving the workflow stays reachable when only the baseline-diff check is failing.
- **Missing-baseline and `--update-baseline`'s "print everything above, including the full diff, before writing" both apply on first capture.** The first `--update-baseline` run (no baseline present yet) prints `OVERALL: FAIL` (a plain-run-shaped summary is always computed and printed first, per the plan's literal "run the check exactly as above" instruction) immediately followed by `Captured scripts/baseline.json (0 diff entries accepted).` and exits `0`. This looks like a contradiction at a glance but is intentional: the FAIL line describes the state *before* the write (no stored baseline exists to compare against yet), and the capture confirmation is the separate, subsequent action. Recorded here so a future reader isn't surprised by it.
- **Optional citation-correction parenthetical avoids the exact grep-tested substring.** `PERSON-MODEL.md` now reads `previously mis-cited a "Phelps-Roper framework"` rather than `The Phelps-Roper framework`, keeping `grep -c 'The Phelps-Roper framework' PERSON-MODEL.md` at 0 while still leaving a correction trail, per the plan's acceptance criteria.

## Deviations from Plan

None — plan executed exactly as written. `01-PATTERNS.md` and `.planning/research/STACK.md`, which 01-01-SUMMARY.md's deviations section flagged as absent in that plan's worktree, were both present in this worktree (confirmed present and read in full before implementation) — no doc-reference substitution was needed here.

## Issues Encountered

- **`python3` on this Windows box resolves to a Microsoft Store execution-alias stub**, not a real interpreter — `python3 -m http.server 8000` printed "Python was not found; run without arguments to install from the Microsoft Store..." and served nothing. Worked around by using `python -m http.server 8000` instead (resolves to a real `C:\Python314\python.exe` on this machine), confirmed serving `index.html` with `HTTP 200` before handing the checkpoint to the human. Not a code change; noted here in case a future agent on this same box hits the same stub.
- **One console error during Task 4's browser verification, reported by the human:** `"A listener indicated an asynchronous response..."`, stack-tracing generically to `index.html:1` rather than to `sim.js` or `presentation.js`. This is a known Chrome/Chromium browser-extension messaging artifact (a content script's `sendResponse` callback firing after its message channel closed), not a defect in this codebase — it does not originate from any file this project owns, and the human's approval was not blocked on it. Recorded here for transparency per the disposition instructions.

## Known Stubs

None.

## Threat Flags

None. All items in this plan's threat register (T-01-08 through T-01-13) map directly onto verified behavior: `--update-baseline` prints the full diff before writing and refuses to write while a qualitative check is unacknowledged-failing (T-01-08, proven by Task 2's tamper-then-rebless round trip); `scripts/baseline.json` is a committed, pretty-printed, newline-terminated fixture with hand-editing forbidden by convention (T-01-09); `scripts/verify.js` writes exactly one hardcoded `__dirname`-relative path with no user-supplied path input (T-01-10, accept); the committed snapshot contains only fictional local NPC simulation state (T-01-11, accept); `snapshot-matches-baseline` is rejected by name at load time and unapproved files are ignored entirely (T-01-13). No new network endpoints, auth paths, file-access patterns, or schema changes were introduced beyond what the threat model already scoped.

## Task 4 Checkpoint — Human Disposition

The human served `http://localhost:8000/index.html` (started by this agent per the checkpoint-automation rule — `python -m http.server 8000`, confirmed reachable before handing off) and confirmed, verbatim from the coordinator's relay:

> Sim.runRegressionCheck() returned pass:true with all 5 checks passing, snapshots.jungle/averse present, no diffs key. Sim.formatDiff([]) returned "no differences" exactly. world.seed was a number (Date.now()-based, as expected for a live session per D-04). One console error appeared ("A listener indicated an asynchronous response...") — this is a known browser-extension messaging artifact, its stack traces to index.html:1 generically, not to sim.js or presentation.js, so it's not a defect in this codebase.

**Disposition: approved.** No code changes were made as part of this task, per its own scope. The browser-extension console message is documented above under "Issues Encountered" for transparency but did not block approval and requires no fix in this codebase.

## Follow-ups (out of scope, not fixed)

Per `01-CONTEXT.md`'s Claude's Discretion section, this phase's doc-sync scope is `PERSON-MODEL.md` only. The following three statements are now stale as a direct result of this plan landing, quoted verbatim with the precise replacement direction, so each is actionable without re-deriving it:

**(a) `CLAUDE.md` §"Running it"** states:
> "There is no test suite, linter, or build command in this repo."

This is now false: `node scripts/verify.js` is a committed, repeatable verification command with a `--update-baseline` golden-master workflow. Still true: there is still no linter and no build step, and still no test *suite* in the conventional sense — what now exists is a single committed regression-check command. The sentence needs narrowing (e.g. to something like "There is no linter or build command in this repo, and no test *suite* — but `node scripts/verify.js` is a committed, repeatable regression check with a `--update-baseline` golden-master workflow"), not deletion.

**(b) `.planning/codebase/TESTING.md`** §"De Facto Verification Approach: Ad Hoc Node Driver Scripts" states that driver scripts "live outside this repo, in a scratch/temp directory... never inside `SimLife/`" and that "the script and its output are discarded after use — nothing is committed back to `SimLife/`." This is superseded by D-01, which deliberately reverses that convention: `scripts/verify.js` **is** committed, inside the repo, specifically to formalize what this document describes as an ad hoc practice.

**(c) `.planning/codebase/CONCERNS.md:141`** still names "the Phelps-Roper framework, per `PERSON-MODEL.md`". This is a generated codebase-map document (produced by `/gsd:map-codebase`), not application source or a hand-authored planning doc — CONTEXT.md's Claude's Discretion section scopes this phase's fix to `PERSON-MODEL.md` only, so the correct remediation is a future `/gsd:map-codebase` regeneration picking up `PERSON-MODEL.md`'s corrected text, not a hand edit here.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `scripts/verify.js` and `scripts/baseline.json` are both committed and green; any later phase can run `node scripts/verify.js` from the repo root as its regression gate, and reuse the D-09 strictness pattern (scoped snapshot, golden-master re-baseline workflow, human-readable diff) for its own scripted-scenario baseline per `01-CONTEXT.md`'s D-09 (LOCKED).
- D-01's two entry points are both confirmed working: `node scripts/verify.js` (Tasks 1-2, fully automated) and `Sim.runRegressionCheck()` from the browser dev console (Task 4, human-confirmed).
- VERIF-01 is closed end to end. The three follow-ups above are the only known remaining doc-sync debt from this plan, and none of them block Phase 2.
- No blockers.

---
*Phase: 01-verification-infrastructure*
*Completed: 2026-08-12*
