---
phase: 02-witness-reaction-ordering
plan: 04
subsystem: docs (CLAUDE.md / PERSON-MODEL.md doc-sync) and testing (human browser checkpoint, pending)
tags: [doc-sync, witness-ordering, checkpoint, verification-infrastructure]

# Dependency graph
requires:
  - phase: 02-witness-reaction-ordering (plan 01)
    provides: "event.witnessOrder provenance, ORDER_SPEC/buildOrderingScenario/orderingSnapshot/runOrderingCheck, scripts/order-prefix.json frozen pre-fix fixture"
  - phase: 02-witness-reaction-ordering (plan 02)
    provides: "Sim.scoreCandidates(world, witness, event, appraisal, priorRelationship) -- pure, RNG-free, idempotent, pre-ranked candidate scorer; resolveGossipTell() named helper"
  - phase: 02-witness-reaction-ordering (plan 03)
    provides: "orderWitnesses(world, event, witnessIds) wired into performAction; four ORDER-01 qualitative checks; re-blessed golden masters"
provides:
  - "CLAUDE.md action-pipeline flow and decide/act description brought back in sync with sim.js's post-Plan-02-03 behavior (orderWitnesses named in the flow, scoreCandidates/resolve()/resolveGossipTell() documented)"
  - "CLAUDE.md verification-command sentence corrected in both places it appeared (both the hand-authored 'Running it' section and the generated Technology Stack/Frameworks bullet)"
  - "PERSON-MODEL.md's Decision provenance section extended with a subsection covering the pure scorer, the two-pass ordering design, event.witnessOrder provenance, and the deferred gossip resolve() hook"
  - "(pending human) confirmation that reordered witness dispatch reads correctly in a real browser's event log and mind inspector"
affects: ["Phase 3 (Belief Decay/Needs) -- reads CLAUDE.md/PERSON-MODEL.md as authoritative going forward; this plan is what keeps that true after Phase 2's dispatch-order change"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Doc-sync obligations spanning a hand-authored section and a generated section within the same file (CLAUDE.md's 'Running it' prose vs. its appended 'Technology Stack' bullet list) both need the same grep-checkable claim fixed -- a whole-file acceptance grep does not distinguish which section a stale sentence lives in"

key-files:
  created: []
  modified:
    - CLAUDE.md
    - PERSON-MODEL.md

key-decisions:
  - "CLAUDE.md contains the retired 'There is no test suite, linter, or build command in this repo' sentence twice in this worktree: once in the hand-authored §\"Running it\", and once inside a generated 'Technology Stack' -> 'Frameworks' bullet appended to the bottom of the file (a quote of the same sentence, attributed to CLAUDE.md itself). The plan's own acceptance criterion (`grep -c '...' CLAUDE.md` outputs `0`) and Task 1's `<automated>` verify (`!c.includes(...)`) are both whole-file checks, so both occurrences needed fixing. The plan's prohibition on hand-editing generated docs is scoped to files under `.planning/codebase/` (the source STACK.md); this second occurrence lives inside CLAUDE.md itself, which is explicitly in this plan's `files_modified`, so rewording it (pointing at `scripts/verify.js` instead of quoting the retired sentence) is in scope and required, not a violation of the generated-doc-hands-off rule. `.planning/codebase/STACK.md`'s own copy of this sentence was left untouched -- per the standing 01-03-SUMMARY precedent (follow-up c), that gets corrected by a future `/gsd:map-codebase` regeneration, never by hand."
  - "Verified `buildOrderingScenario()` actually returns `{ world, eventId }` (sim.js:1651) before handing the checkpoint's step-3 one-liner to the human -- confirmed by running it directly: prints `garrick, elena, mara, tomas, ives`, matching Plan 02-03's recorded post-fix dispatch order exactly."
  - "The 'tell a confidant' RNG deferral is documented as living in a `resolve()` hook backed by the named top-level `resolveGossipTell()` helper, not an inline closure -- matching Plan 02-02's actual shipped design (a Rule 3 deviation documented in 02-02-SUMMARY.md), not the plan text's literal 'resolve() closure' wording, so the claim is true of the code as it stands."

requirements-completed: []  # ORDER-01/ORDER-02 both already marked complete by Plan 02-03; Task 2 (human-verify) has not yet returned a disposition, so this plan's own completion is pending

# Metrics
duration: ~35min to Task 1 completion + checkpoint pause (Task 2 pending human return)
completed: 2026-08-12 (Task 1 only; Task 2 pending)
---

# Phase 02 Plan 04: Doc-Sync + Human Browser Verification (Task 2 PENDING) Summary

**Brought `CLAUDE.md` and `PERSON-MODEL.md` back in sync with the witness-ordering fix landed across Plans 02-01 through 02-03 (naming `orderWitnesses` in the documented action-pipeline flow, documenting the pure `scoreCandidates()`/`resolve()`/`resolveGossipTell()` split, and correcting the stale "no test suite" claim in both places it appeared in `CLAUDE.md`); the plan's Task 2 human browser checkpoint is reached and the local server is confirmed serving, but the human is currently away — disposition is PENDING, not yet recorded.**

## Performance

- **Duration:** ~35 min of active execution work on Task 1, plus checkpoint-prep verification
- **Completed:** 2026-08-12 (Task 1); Task 2 awaiting human return
- **Tasks:** 1 of 2 complete (`auto`); Task 2 (`checkpoint:human-verify`, gate="blocking") reached and paused
- **Files modified:** 2 (`CLAUDE.md`, `PERSON-MODEL.md`)

## Accomplishments

- `CLAUDE.md`'s Action pipeline paragraph now reads `checkPreconditions` → `applyEffects` → push an `event` → `computeWitnesses` → `orderWitnesses` → `perceiveEvent` for each witness, highest urgency first, with a new sentence naming the pure `scoreCandidates()` scorer, the no-reaction-band bottom bucket, the no-randomness stable tiebreak, and `event.witnessOrder` provenance.
- `CLAUDE.md`'s Decide/act paragraph now documents `scoreCandidates()` as the separate pure function both `decideAndAct()` and `orderWitnesses()` call, and the gossip candidate's deferred `resolve()` hook (backed by the named `resolveGossipTell()` helper) that defers the honesty-flip and scapegoat-pick RNG draws until the candidate wins.
- `CLAUDE.md`'s stale "There is no test suite, linter, or build command in this repo" sentence is corrected in **both** places it appeared: the hand-authored §"Running it" (now points at `node scripts/verify.js`'s `--update-baseline` golden-master workflow and its witness-ordering checks/diff), and a generated "Technology Stack" → "Frameworks" bullet that quoted the same retired sentence (reworded to point at the same command without hand-editing any file under `.planning/codebase/`).
- `PERSON-MODEL.md`'s "Decision provenance" section gained a new subsection ("Witness reaction ordering and scoring purity (Phase 2)") covering: `scoreCandidates()`'s pure/pre-sorted/never-empty contract and its `reacts` band; witness dispatch order and `event.witnessOrder` provenance; the two-pass design (pre-pass score decides queue position only, `perceiveEvent` cascade recomputes fresh) and its accepted "sorted first, then takes no action" consequence; the deferred gossip `resolve()`/`resolveGossipTell()` RNG and its effect on the mind inspector's `considered`/`chose` labels.
- Every added claim (`orderWitnesses`, `scoreCandidates`, `witnessOrder`, `resolve`) confirmed present in `sim.js` by grep; the plan's exact `<automated>` verify snippet run and returns `doc sync: OK`.
- `node scripts/verify.js` re-run after the doc edits: `OVERALL: PASS`, all 11 checks green, confirming the documentation-only change did not disturb the engine.
- Local static server started (`python -m http.server 8000` from the repo root — `python3` is a Microsoft Store alias stub on this machine per 01-03-SUMMARY's precedent, and was not used), confirmed `http://localhost:8000/index.html` returns HTTP 200, and confirmed the served `sim.js` contains the ordering fix (`orderWitnesses` present).
- Checkpoint step-3 one-liner run directly against `Sim.buildOrderingScenario()`/`w.world.events.find(e => e.id === w.eventId).witnessOrder`: prints `garrick, elena, mara, tomas, ives` — confirmed to match the exact shape the checkpoint hands the human (`buildOrderingScenario()` does return `{ world, eventId }`), and confirmed to begin with `garrick` and end with `ives` as the checkpoint's acceptance criteria require.
- `Sim.runOrderingCheck({})` run via Node: `pass: true`, all four ORDER-01 qualitative checks (`dispatch-order-differs-from-agent-list`, `victim-dispatched-first`, `victim-retaliates-first`, `indifferent-witness-dispatched-last`) individually `pass: true`.

## Task Commits

| Task | Commit | Files |
|------|--------|-------|
| 1 | `2436abf` | `CLAUDE.md`, `PERSON-MODEL.md` |

**Task 2 (`checkpoint:human-verify`, gate="blocking"):** no code change; paused, awaiting human disposition. Per this plan's own instructions and the calling context, the human is currently away and this pause is expected — the orchestrator is continuing other work and will hold this checkpoint for the human's return, not wait synchronously.

## Files Created/Modified

- `CLAUDE.md` — action-pipeline flow, decide/act paragraph, and both occurrences of the stale verification-command sentence corrected to match post-Plan-02-03 `sim.js` behavior.
- `PERSON-MODEL.md` — new "Witness reaction ordering and scoring purity (Phase 2)" subsection appended to "Decision provenance".

## Decisions Made

See `key-decisions` in frontmatter for full rationale. Summary:

1. **Fixed the stale verification-command sentence in both its occurrences in `CLAUDE.md`**, not just the one the plan's `<action>` text explicitly named, because the plan's own acceptance criterion is a whole-file grep and the file (in this worktree) contains a generated section quoting the same sentence a second time. This is documented as a Rule 3 (blocking) fix below, since the plan's own literal acceptance check is unsatisfiable otherwise.
2. **Documented the gossip RNG deferral as `resolve()` backed by `resolveGossipTell()`**, matching the actual shipped code from Plan 02-02 (which itself deviated from an inline-closure design to a named top-level helper for its own acceptance-check reasons) rather than the plan text's "resolve() closure" phrasing verbatim — the doc claim needed to be true of `sim.js` as it stands, and `grep -c 'resolve()' PERSON-MODEL.md` still returns `1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected a second, generated-section occurrence of the retired "no test suite" sentence in `CLAUDE.md`**
- **Found during:** Task 1, immediately after editing the hand-authored §"Running it" sentence, while re-running the plan's acceptance-criteria greps as instructed
- **Issue:** `grep -c 'There is no test suite, linter, or build command in this repo' CLAUDE.md` returned `1` after fixing only §"Running it" — a generated "Technology Stack" → "Frameworks" bullet appended later in the same file quoted the identical sentence verbatim (`` `CLAUDE.md` states explicitly: "There is no test suite..." ``). The plan's acceptance criterion and Task 1's `<automated>` verify are both whole-file checks against `CLAUDE.md`, so this second occurrence would have failed both.
- **Fix:** Reworded the generated bullet to state that no test suite/runner/assertion library exists and to point at `node scripts/verify.js` (documented in §"Running it") as the committed regression check, without quoting the retired sentence. Did not touch `.planning/codebase/STACK.md` (the source of the generated section) — that file is corrected by `/gsd:map-codebase` regeneration per the standing 01-03-SUMMARY precedent, and the plan's hands-off rule for `.planning/codebase/` files was respected (`git status --short -- .planning/codebase/` confirmed empty both before and after).
- **Files modified:** `CLAUDE.md` (part of Task 1's single commit — no separate commit for this fix)
- **Verification:** Re-ran `grep -c 'There is no test suite, linter, or build command in this repo' CLAUDE.md` after the second edit — returns `0`. Re-ran all of Task 1's other acceptance-criteria greps (`orderWitnesses` ≥1, `scoreCandidates` ≥1, stale adjacency =0, new adjacency ≥1, `scripts/verify.js` ≥1) and the plan's exact `<automated>` node verify snippet — all pass. `git show --stat HEAD` confirmed the commit touches exactly `CLAUDE.md` and `PERSON-MODEL.md`.
- **Committed in:** `2436abf` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 - blocking, forced by the plan's own whole-file acceptance grep encountering a second, generated-section occurrence of the sentence it required removed)
**Impact on plan:** Documentation-only; no behavior change; `node scripts/verify.js` unaffected (`OVERALL: PASS` before and after). No scope creep — the fix only rewords a bullet already inside this plan's `files_modified` scope.

## Issues Encountered

None beyond the deviation above, resolved during Task 1 itself before committing.

## User Setup Required

**External human action required to close this plan.** Task 2 is a blocking human-verify checkpoint. See "Checkpoint Details" below for exactly what the human needs to do; this plan cannot be marked complete until that disposition is recorded.

## Next Phase Readiness

- Task 1 (doc-sync) is fully complete and committed; `CLAUDE.md` and `PERSON-MODEL.md` are grep-verifiable against `sim.js` as it stands after Plan 02-03.
- Task 2 is blocked on human availability, not on any remaining engineering work. The local server is confirmed reachable at the time of this checkpoint pause but will not remain running across a session boundary — the human (or the resuming agent) must restart it with `python -m http.server 8000` from the repo root before verification steps 1, 4, 5, and 6 (steps 2 and 3 use the dev console only and do not require the UI, but do require the page to be loaded).
- Once Task 2's disposition is recorded (via a continuation agent resuming this plan), this SUMMARY should be updated/replaced with the verbatim disposition, the exact `witnessOrder` string the human reports, and any code change made in response, per the plan's `<output>` spec — this version documents progress up to the pause only.
- Phase 3 (Belief Decay/Needs) depends on this plan's doc-sync per STATE.md context, and can proceed reading `CLAUDE.md`/`PERSON-MODEL.md` as accurate for the engine's current dispatch behavior regardless of Task 2's outcome, since Task 2 verifies *presentation*, not the engine change itself (already proven correct by `scripts/verify.js`).

## Self-Check: PASSED

- `CLAUDE.md` — FOUND (modified)
- `PERSON-MODEL.md` — FOUND (modified)
- Commit `2436abf` — FOUND
- `node scripts/verify.js` exits 0, prints `OVERALL: PASS` — CONFIRMED
- `grep -c 'orderWitnesses' CLAUDE.md` ≥ 1 — CONFIRMED (3)
- `grep -c 'scoreCandidates' CLAUDE.md` ≥ 1 — CONFIRMED (3)
- `grep -c 'computeWitnesses. → .perceiveEvent' CLAUDE.md` = 0 — CONFIRMED
- `grep -c 'orderWitnesses. → .perceiveEvent' CLAUDE.md` ≥ 1 — CONFIRMED (1)
- `grep -c 'There is no test suite, linter, or build command in this repo' CLAUDE.md` = 0 — CONFIRMED
- `grep -c 'scripts/verify.js' CLAUDE.md` ≥ 1 — CONFIRMED (2)
- `grep -c 'witnessOrder' PERSON-MODEL.md` ≥ 1 — CONFIRMED (1)
- `grep -c 'scoreCandidates' PERSON-MODEL.md` ≥ 1 — CONFIRMED (2)
- `grep -c 'resolve()' PERSON-MODEL.md` ≥ 1 — CONFIRMED (1)
- `git status --short -- .planning/codebase/` empty — CONFIRMED

---
*Phase: 02-witness-reaction-ordering*
*Completed: Task 1 only — 2026-08-12; Task 2 PENDING human return*
