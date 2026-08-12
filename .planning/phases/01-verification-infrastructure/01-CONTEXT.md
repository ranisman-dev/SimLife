# Phase 1: Verification Infrastructure - Context

**Gathered:** 2026-08-12
**Status:** Ready for planning

<domain>
## Phase Boundary

The project has infrastructure to reproduce, verify, and centrally tune every
subsequent Phase 2 change by hand, since there is no automated test suite. This
phase delivers: a seeded RNG (single call site, replacing three unseeded
`Math.random()` calls), a `driftEnabled` toggle that reproduces the original
two-clone `CompetitiveJungle` regression case, one named constants block for
every new Phase 2 tuning number, and a doc-sync fix (retiring the non-existent
"Phelps-Roper framework" citation). This is infrastructure other phases depend
on — it delivers no new NPC-visible behavior itself.

</domain>

<decisions>
## Implementation Decisions

### Regression check surface
- **D-01:** Both a Node script (`node scripts/verify.js`, prints pass/fail to
  terminal) and a browser console function (`Sim.runRegressionCheck()`,
  callable from the dev console while `index.html` is open) — same underlying
  check logic, two entry points. Fits the existing dual-export pattern
  (`sim.js`/`parser.js` already `require()`-able from Node).

### RNG seed handling
- **D-02:** `createWorld()` stays completely untouched — no `seed` parameter,
  no RNG-related code. It is fully deterministic NPC authoring today (5
  hand-authored agents, no randomness) and that responsibility must not be
  diluted by an unrelated concern.
- **D-03:** A separate, small function — `Sim.seedRng(world, seed)` (naming at
  planner's discretion) — is called explicitly right after `createWorld()` to
  attach the RNG stream (`world.rng` or similar) onto the already-built world
  object. This keeps RNG state living on `world` (consistent with the existing
  convention against adding new module-level mutable state — see
  `reactionDepth`'s documented fragility in `CONCERNS.md`) without coupling it
  into `createWorld()`'s signature.
- **D-04:** The seed is overridable with a fixed default — `Sim.seedRng(world)`
  with no argument uses a hardcoded default constant (always reproducible for
  the regression check); passing an explicit seed lets other sessions explore
  different random outcomes.
- **D-05 [locked]:** RNG scope discipline — LOCKED, CROSS-PHASE (binds Phases
  5-7, not just Phase 1). The only RNG permitted to decide something
  *important* is a one-time world/people genesis roll — not applicable today
  since
  `createWorld()` hand-authors all 5 NPCs deterministically, but this is the
  standing rule for if/when procedural world/NPC generation is built in a
  future milestone (see Deferred Ideas). After genesis, everything is
  cause-and-effect — "even if it's the butterfly effect" (user's framing).
  Concretely:
  - `decideAndAct()`'s utility-AI scoring is and must remain fully
    deterministic — RNG never decides *what* an NPC does. Already true today
    (verified by `PERSON-MODEL.md`'s two-clone `CompetitiveJungle` case) and
    must stay true.
  - Future mechanics must not violate this: Phase 6's Snap threshold (SNAP-02)
    must stay a deterministic function of context (emotion intensity,
    worldview weight, boldness/neuroticism) — never a probabilistic roll.
    Phase 7's reactivation-trigger matching must be similarly deterministic.
  - RNG is reserved strictly for stochastic *texture* on the details of an
    already-decided action. This phase's seeded RNG (VERIF-02) covers exactly
    the three existing texture-only call sites: Attack damage magnitude
    (`sim.js:278`), the honest-vs-lying flip when an NPC gossips (`sim.js:941`),
    and scapegoat selection among plausible candidates (`sim.js:1019`).
    Nothing beyond these three needs seeding for this phase.

### Constants block granularity
- **D-06:** A single shared constants block (naming at planner's discretion,
  e.g. `Sim.TUNING`) holds every new Phase 2 tuning number across all 7
  phases, added to incrementally as each later phase lands its own constants.
  Not split per-mechanic (`Sim.DRIFT`, `Sim.SNAP`, etc. as separate objects).
- **D-07:** Scoped to *new* Phase 2 numbers only, per VERIF-03's wording.
  Existing constants (`MAX_REACTION_DEPTH`, `EMOTION_HALFLIFE_TICKS`, etc.)
  are not retrofitted into this block or otherwise touched by this phase.

### Regression check strictness
- **D-08:** "Byte-for-bit" reproduction (VERIF-01) means a full snapshot diff,
  not looser targeted assertions — most rigorous option, catches subtle
  unintended side effects introduced by later phases.
- **D-09 [locked]:** Regression-check strictness pattern — LOCKED, reused as
  the standard pattern for every later phase's scripted-scenario baseline
  (Phase 2's witness-ordering diff explicitly needs this too, per
  `ROADMAP.md`):
  1. **Scope the snapshot to the agents actually involved in/witnessing the
     tested scenario, plus the event log — not hardcoded to exactly 2 agents.**
     The user explicitly rejected assuming a fixed pair; a future scenario
     (e.g. Phase 2's witness ordering) may involve 3+ agents (attacker,
     victim, multiple bystanders), and the harness must generalize to however
     many agents a given scenario actually involves. It is fine to leave out
     agents/state genuinely unrelated to the tested interaction — just don't
     assume the count.
  2. **Golden-master re-baseline workflow** — a `--update-baseline` flag on
     the verify script overwrites the stored snapshot after a human reviews
     the diff and confirms an intentional change, rather than hand-editing
     JSON.
  3. **Human-readable diff output** — field-by-field, old value → new value,
     not a raw JSON blob comparison.

### Claude's Discretion
- Exact naming for `Sim.seedRng()`, `Sim.TUNING`, and the snapshot/diff
  function names.
- Choice of seeded PRNG algorithm (e.g. mulberry32-style) — any deterministic,
  swappable generator satisfies VERIF-02; no specific algorithm was requested.
- Exact file layout for `scripts/verify.js` vs. where the shared check logic
  lives (e.g. inside `sim.js` itself vs. a separate module) — implementation
  detail, not a user preference.
- The doc-sync fix (Phelps-Roper citation correction in `PERSON-MODEL.md`) —
  already resolved by research; real citations to use are Roberts/Walton/
  Viechtbauer (2006), Sherif's Social Judgment Theory, and Prochaska &
  DiClemente's relapse stage as a structural parallel (see
  `.planning/research/SUMMARY.md` and the already-corrected `PROJECT.md` Key
  Decisions table for the exact wording to mirror).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 1: Verification Infrastructure" — goal,
  dependencies, requirements, success criteria
- `.planning/REQUIREMENTS.md` §"Verification Infrastructure" — VERIF-01,
  VERIF-02, VERIF-03 full text

### Research grounding
- `.planning/research/SUMMARY.md` §"Phase 0: Verification Infrastructure" (now
  Phase 1) and §"Critical Pitfalls" #1 (drift invalidates the regression
  check) and #5 (landing ordering + drift together makes both unverifiable) —
  the rationale for why this phase exists and lands first
- `.planning/research/PITFALLS.md` — full pitfalls detail behind the above

### Existing behavior this phase touches
- `PERSON-MODEL.md` — the two-clone `CompetitiveJungle` verified case (the
  regression baseline this phase must reproduce), and the "Phelps-Roper
  framework" citation to correct
- `.planning/codebase/CONCERNS.md` §"`Math.random()` used directly with no
  seed" and §"`decideAndAct()`'s scoring terms are inline magic numbers" — the
  two documented gaps this phase closes
- `.planning/PROJECT.md` §"Key Decisions" — already-corrected citation
  wording to mirror in `PERSON-MODEL.md`

### Code locations
- `sim.js:117` — `createWorld()` (do not modify signature — see D-02)
- `sim.js:278` — Attack damage RNG call site
- `sim.js:941` — gossip honesty RNG call site
- `sim.js:1019` — scapegoat selection RNG call site
- `sim.js:185-186`, `sim.js:461-469` — `reactionDepth` module-level pattern
  (precedent for keeping new state on `world`, not module-global)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `sim.js`/`parser.js`'s dual-export guard (`module.exports = Sim` when
  `typeof module !== 'undefined'`) — already makes both files `require()`-able
  from Node with zero setup, directly enables the Node-script half of D-01
  without new tooling.

### Established Patterns
- `world` is the single object threaded explicitly through every function in
  `sim.js` — new state (RNG stream, future `pressure`/`anchor`/`weight`
  fields) belongs on `world` or `mind`, never as new module-level mutable
  state (per `CONVENTIONS.md`'s explicit warning, grounded in `reactionDepth`'s
  documented fragility).
- All existing tunable constants are module-level `const`s at the top of
  `sim.js` (`MAX_REACTION_DEPTH`, `EMOTION_HALFLIFE_TICKS`, `VALUES`,
  `WORLDVIEW_BELIEFS`) — the new shared constants block (D-06) should sit
  alongside these, following the same top-of-file placement convention.

### Integration Points
- `sim.js:278`, `sim.js:941`, `sim.js:1019` — the three call sites that must
  switch from `Math.random()` to the seeded generator.
- `.claude/settings.local.json` — already allowlists `node -e` invocations
  requiring `sim.js`; the Node-script verify entry point should fit this
  existing dev workflow rather than introduce a new one.

</code_context>

<specifics>
## Specific Ideas

- The RNG scope-discipline principle (D-05) is the most consequential decision
  from this discussion — it's a standing architectural constraint, not just a
  Phase 1 implementation detail. It should be visible to whoever plans/executes
  Phases 5-7, not just filed away here. (Also being added to `STATE.md`'s
  Accumulated Context so it surfaces automatically via `load_prior_context` in
  later phases.)
- The snapshot-scoping principle (D-09.1) — no fixed agent count assumption —
  is explicitly meant to be reused, not reinvented, for Phase 2's
  witness-ordering baseline and any later scripted-scenario check.

</specifics>

<deferred>
## Deferred Ideas

- **Procedural world/NPC generation** (replacing the 5 hand-authored NPCs in
  `createWorld()`) — future milestone. This is where the "genesis RNG"
  principle in D-05 would actually apply for the first time; not scoped for
  this phase or this milestone. Noted so the principle isn't mistaken for
  currently-active behavior.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo_count: 0`).

</deferred>

---

*Phase: 1-Verification Infrastructure*
*Context gathered: 2026-08-12*
