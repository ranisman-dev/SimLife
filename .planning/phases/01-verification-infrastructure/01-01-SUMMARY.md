---
phase: 01-verification-infrastructure
plan: 01
subsystem: engine (sim.js) + presentation entry points
tags: [rng, determinism, seeding, tuning-constants, verification-infrastructure]
dependency-graph:
  requires: []
  provides:
    - "Sim.seedRng(world, seed) / Sim.rngOf-backed world.rng stream"
    - "Sim.TUNING (empty, documented Phase 2+ constants block)"
    - "Sim.isDriftEnabled(world)"
    - "Sim.DEFAULT_SEED"
  affects:
    - "sim.js Attack/gossip/scapegoat randomness"
    - "presentation.js world creation (module init + reset button)"
tech-stack:
  added: []
  patterns:
    - "mulberry32 seeded PRNG closure attached to world.rng, draw-counted via world.rngCalls"
    - "RNG state lives on world, never as new module-level mutable state (D-03)"
key-files:
  created: []
  modified:
    - sim.js
    - presentation.js
decisions:
  - "DEFAULT_SEED = 1337 (fixed integer, used whenever seedRng()/rngOf() falls back with no explicit seed)"
metrics:
  duration: "~35 minutes"
  completed: "2026-08-12"
---

# Phase 01 Plan 01: Seeded RNG + Sim.TUNING + isDriftEnabled Summary

One-liner: gave the engine a single seeded mulberry32 RNG stream on `world`, rewired all three existing `Math.random()` call sites through it, added the (deliberately empty) `Sim.TUNING` constants block Phases 2-7 will fill in, and added the `driftEnabled` `!== false` read accessor — with `createWorld()` left byte-identical throughout.

## What Was Built

**Task 1 — `Sim.TUNING` and `isDriftEnabled` (commit `6783d48`)**
- Added `const TUNING = {};` to the top-of-file constant block, immediately after `EMOTION_HALFLIFE_TICKS`, with a comment documenting it's the single shared home for every new Phase 2-7 tuning number (D-06) and is deliberately empty this phase (D-07) — `MAX_REACTION_DEPTH`/`EMOTION_HALFLIFE_TICKS` are explicitly not retrofitted into it.
- Added `function isDriftEnabled(world) { return world.driftEnabled !== false; }` near the other shared helpers (`getAgent`/`coLocated`/`agentsAt`), with a comment recording why the `!== false` comparison (not a truthiness fallback) is load-bearing, and why `createWorld()` staying untouched (D-02) is what makes "unset reads as enabled" correct.
- Both added to the `Sim` object literal.

**Task 2 — `mulberry32`, `DEFAULT_SEED`, `seedRng`, `rngOf` (commit `1797f3e`)**
- `const DEFAULT_SEED = 1337;` added to the top-of-file constant block, explicitly kept out of `TUNING` per D-04.
- `mulberry32(seed)` copied verbatim from `.planning/codebase/TESTING.md:31-38` (see Deviations — the plan's cited `01-PATTERNS.md` does not exist in this worktree; TESTING.md is the source the plan itself names as the origin of that algorithm, so it was used as the referent).
- `seedRng(world, seed = DEFAULT_SEED)` always re-seeds (no lazy-init guard), sets `world.seed`, `world.rngCalls = 0`, and installs a `world.rng` closure that increments `rngCalls` on every draw. A comment above it records the LOCKED D-05 cross-phase RNG scope rule (binds Phases 5-7) and the D-03 rationale for keeping this state on `world` rather than as a new module-level `let`.
- `rngOf(world)` — defensive accessor, lazily calls `seedRng(world)` (installing the `DEFAULT_SEED` stream) if `world.rng` is absent.
- `DEFAULT_SEED` and `seedRng` added to `Sim`; `mulberry32` and `rngOf` stay module-private.

**Task 3 — Wiring the three call sites and both app entry points (commit `5fa8449`)**
- `sim.js` `applyEffects` Attack damage roll, `decideAndAct` gossip honest/lying flip, and `pickScapegoat`'s weighted roll all switched from the unseeded global RNG to `rngOf(world)()`. Surrounding arithmetic/comments unchanged; no function signatures changed.
- `parser.js:96`'s unrelated random-example-command call left untouched — confirmed out of scope, not in this plan's `files_modified`.
- `presentation.js` now calls `Sim.seedRng(world, Date.now())` immediately after both `Sim.createWorld()` calls (module-level init and the reset-button handler), so every live session gets a distinct, recorded stream (`world.seed`) instead of silently falling through to the `DEFAULT_SEED` safety net.

## Verification Performed

All plan-specified `<automated>` checks were run and passed:
- Task 1: `node -e` type/shape/empty-object/`driftEnabled` semantics check — passed. `grep -c 'driftEnabled ||' sim.js` = 0.
- Task 2: determinism (`node -e`, same-seed reproduction / different-seed divergence / draw range / `rngCalls` tracking / re-seed reset) — passed. Serialization (`JSON.stringify` survival of `seed`/`rngCalls`, drop of `rng`) — passed. `grep -cE '^(let|var) ' sim.js` = 1 (only pre-existing `reactionDepth`).
- Task 3: `grep -c 'Math\.random' sim.js` = 0. `grep -c 'rngOf(world)()' sim.js` = 3. `grep -c 'Math\.random' parser.js` = 1 (untouched, confirmed out of scope). `grep -c 'Sim\.seedRng(world' presentation.js` = 2. Same-seed reproducibility smoke run via `node -e` (`S.performAction(w, 'player', 'Attack', ...)` twice at seed 11) — byte-identical event data, `rngCalls >= 1`.

Plan-level `<verification>`:
1. `node -e "const S=require('./sim.js'); console.log(Object.keys(S).join(','))"` →
   `LOCATIONS,VERBS,VALUES,WORLDVIEW_BELIEFS,PREDICATE_LABELS,TUNING,isDriftEnabled,DEFAULT_SEED,seedRng,createWorld,performAction,getAgent,memoryStrength`
   — includes all four new exports (`TUNING`, `isDriftEnabled`, `DEFAULT_SEED`, `seedRng`) alongside every pre-existing export.
2. `git diff --stat` across all three task commits (base `5226b78a` → `HEAD`): exactly two files changed — `sim.js` (88 lines), `presentation.js` (2 lines).
3. **Not performed as specified.** The plan's step 3 asks to open `index.html` in a browser. This agent has no browser access. Substituted: a headless `node -e` smoke run (`Sim.createWorld()` → `Sim.seedRng(w, 42)` → `Sim.performAction(w, 'player', 'Take', ...)`) confirming the app's core action pipeline still works end-to-end and `world.seed`/`world.rngCalls` are populated correctly. **The actual browser load/typed-command check was not performed and should be verified manually or by a subsequent agent with browser access.**

`createWorld()` byte-identical confirmation: inspected every diff hunk across all three commits (`git diff 5226b78a HEAD -- sim.js`) — hunks touch lines 41-61 (top constant block), 180-263 (shared-helpers section, driftEnabled/mulberry32/seedRng/rngOf), 353 (Attack damage line only), 1016 (gossip line only), 1094 (scapegoat line only), and 1034 (`Sim` object literal). `createWorld()` itself starts at line 132 in the final file (was 117 pre-plan) — no hunk falls within its body; the function shifted position only because content was inserted above it, not because it was edited.

**`DEFAULT_SEED` chosen: `1337`** (fixed integer literal, always reproducible for the regression harness Plan 02 builds on).

## Deviations from Plan

### Auto-fixed / Adapted Issues

**1. [Rule 3 - blocking issue, doc reference] `01-PATTERNS.md` does not exist in this worktree**
- **Found during:** Task read_first steps for all three tasks; the plan cites `01-PATTERNS.md` as the verbatim source for the mulberry32 body, the `Sim.TUNING` comment style, the `driftEnabled` toggle pattern, and the RNG call-site swap pattern.
- **Issue:** Only `01-01-PLAN.md`, `01-02-PLAN.md`, `01-03-PLAN.md`, `01-CONTEXT.md`, and `01-DISCUSSION-LOG.md` exist in `.planning/phases/01-verification-infrastructure/` — no `01-PATTERNS.md`.
- **Resolution:** The plan itself names `.planning/codebase/TESTING.md:31-38` as the origin of the mulberry32 algorithm ("it is the algorithm already documented for this repo in `.planning/codebase/TESTING.md:31-38`"), so that file was read and used as the verbatim source instead. All other guidance the plan attributes to `01-PATTERNS.md` (TUNING comment content, `driftEnabled` rationale, RNG scope-discipline comment) was reconstructed directly from the CONTEXT.md decisions (D-02 through D-07) and the plan's own `<action>` prose, which fully specify the required content independent of the missing file.
- **Files affected:** none (documentation-lookup issue only, no code impact).
- **Impact on acceptance criteria:** Task 2's acceptance criterion "The mulberry32 body in sim.js is character-identical to the block in 01-PATTERNS.md" could not be checked against the named file; it was checked against TESTING.md's block instead, which the mulberry32 implementation matches exactly (character-for-character, aside from indentation).

**2. Two grep-sensitive comment-wording adjustments**
- **Found during:** Task 1 and Task 3 planning, before writing any comment text.
- **Issue:** The plan's own verification greps for `driftEnabled ||` (must be 0) and `Math\.random` (must be 0 in sim.js), but the plan's `<action>` prose for both tasks explicitly suggests explaining the bug class using those literal substrings (e.g. "`world.driftEnabled || true` would silently coerce...").
- **Resolution:** Rationale comments were phrased without using those literal substrings — e.g. "a truthiness fallback on this field (something shaped like `field || true`)" instead of naming `driftEnabled ||` directly, and "the unseeded global RNG" instead of writing `Math.random` in any new comment.
- **Files affected:** sim.js (comments only, no logic difference).

### Verification Gaps

- **Browser check not performed** (plan-level verification step 3) — no browser available in this execution environment. See "Verification Performed" above for the headless substitute and the explicit note that this still needs manual/browser-capable confirmation.

## Known Stubs

None — no hardcoded empty values, placeholder text, or unwired data sources were introduced. `Sim.TUNING` is intentionally empty per D-07 (documented in-code and in this summary, not a stub — it's Phase 1's contractually correct state).

## Threat Flags

None. This plan's threat register (T-01-01 through T-01-03) was fully addressed as specified: `world.seed` visibility is accepted (non-secret, single-player, no PII); the RNG is texture-only and never became a security primitive; the D-05 scope-discipline comment is in place above `seedRng` naming `decideAndAct` as required-deterministic. No new network endpoints, auth paths, file access, or schema changes were introduced.

## Self-Check: PASSED

- FOUND: sim.js (modified, exists)
- FOUND: presentation.js (modified, exists)
- FOUND: 6783d48 (Task 1 commit)
- FOUND: 1797f3e (Task 2 commit)
- FOUND: 5fa8449 (Task 3 commit)
