# Phase 2: Witness Reaction Ordering - Context

**Gathered:** 2026-08-12 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

NPCs react to a shared event in order of computed urgency, not incidentally by
their position in the world's agent list. Currently `performAction()` dispatches
witnesses via `witnesses.forEach(w => perceiveEvent(world, w, event))`
(`sim.js:288`), where `witnesses` comes from `computeWitnesses()`
(`sim.js:374`), itself built from `agentsAt()`'s insertion-order agent list
(`sim.js:194`, `world.agents` created in fixed order: player, mara, ives,
tomas, elena, garrick). This phase changes dispatch order only — it does not
change what triggers a reaction, what `decideAndAct()` scores, or the
tick-increment model (each reaction still consumes a tick via
`world.tick++` in `performAction`).

</domain>

<decisions>
## Implementation Decisions

### Urgency scoring
- **D-01 [auto]:** Extract a pure `scoreCandidates(world, witness, event, appraisal, priorRelationship)` function from `decideAndAct()` (`sim.js:917`) that returns the scored candidate list without side effects or mutation. `decideAndAct()` itself calls this extracted function and picks the top candidate, same behavior as today. *(Auto-selected: research/SUMMARY.md's Phase 1 (now Phase 2 in this milestone's numbering) architecture notes explicitly recommend this extraction as needed "by later phases regardless" — reuses existing scoring logic rather than inventing a second one.)*
- **D-02 [auto]:** A witness's "urgency" for ordering purposes is the top candidate's score from `scoreCandidates()` — the same number `decideAndAct()` would use to pick its reaction — not a separate, invented metric. *(Auto-selected: CONCERNS.md's own fix-approach language — "witnesses should probably be scored and dispatched in order of reaction urgency" — reads naturally as reusing the existing utility-AI score, and inventing a parallel urgency formula would violate the "beliefs, not scripts, no special-casing" architecture rule.)*

### Dispatch shape
- **D-03 [auto]:** Replace `witnesses.forEach(...)` depth-first dispatch with: compute all witnesses' candidate scores first (via `scoreCandidates()`), sort descending by top-candidate score, then fire each witness's `perceiveEvent`/`decideAndAct` cascade in that order — matching CONCERNS.md's documented fix approach #1 exactly ("compute all witnesses' candidate scores first, then fire the highest-scoring reaction across all witnesses before any of their followups, breadth-first rather than depth-first per witness").
- **D-04 [auto]:** Tie-breaking when two witnesses have equal top-candidate scores falls back to the existing `agentsAt()` list order (stable sort) — deterministic, no new RNG. *(Auto-selected: consistent with Phase 1's LOCKED D-05 RNG-scope-discipline decision — RNG never decides ordering/direction, only stochastic texture on already-decided actions. A coin-flip tiebreak would violate that principle.)*

### Tick semantics
- **D-05 [auto]:** Out of scope for this phase. CONCERNS.md's fix approach names two independent problems — (1) dispatch order, (2) whether reactions to the same originating event should share a tick or need a sub-ordering field. ORDER-01/ORDER-02 in REQUIREMENTS.md only require correct dispatch order; the tick-sharing question is explicitly deferred in CONCERNS.md itself ("worth revisiting before reaction timing is used for anything beyond flavor") and isn't blocking for this phase's success criteria. Each reaction still increments `world.tick` exactly as today.

### Claude's Discretion
- Exact function/variable naming for the extracted `scoreCandidates()` (as long as it's a pure function reusable by both `decideAndAct()` and the new ordering pass).
- Where the sort-then-dispatch logic lives (inline in `performAction`, or a small named helper) — implementation detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 2: Witness Reaction Ordering" — goal, dependencies (Phase 1), requirements, success criteria
- `.planning/REQUIREMENTS.md` §"Witness Reaction Ordering" — ORDER-01, ORDER-02 full text

### Research grounding
- `.planning/research/SUMMARY.md` §"Phase 1: Witness Reaction Ordering" — build-order rationale (must land first and alone, not bundled with drift), and the `scoreCandidates()` extraction recommendation
- `.planning/codebase/CONCERNS.md` §"Witness reaction order is list-position, not urgency-driven" — the exact documented bug, its two-part fix approach, and the traced-interaction example this phase fixes

### Prior phase decisions carried forward
- `.planning/phases/01-verification-infrastructure/01-CONTEXT.md` D-05 (LOCKED, cross-phase RNG scope discipline) — binds this phase's tie-breaking decision (D-04 above)
- `.planning/phases/01-verification-infrastructure/01-CONTEXT.md` D-09 (LOCKED, scripted-scenario baseline pattern) — this phase must capture a "before" baseline of current `forEach`-order reactions and diff it against the new urgency-ordered output, per ORDER-02

### Code locations
- `sim.js:288` — `performAction`'s witness dispatch (`witnesses.forEach`)
- `sim.js:374` — `computeWitnesses()`
- `sim.js:194` — `agentsAt()` (fixed insertion order)
- `sim.js:917` — `decideAndAct()` (extraction source for `scoreCandidates()`)
- `sim.js:263-264` — `reactionDepth`/`MAX_REACTION_DEPTH` (recursion gate, unaffected by this phase but must keep working under reordered dispatch)
- `sim.js:539-545` — `reactedEventIds` guard inside the reaction cascade

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Sim.seedRng`/`Sim.isDriftEnabled`/`Sim.TUNING` (Phase 1) — not directly used by this phase's logic, but available if the scripted baseline needs a fixed seed for reproducibility.
- `Sim.runRegressionCheck`'s snapshot/diff machinery (`scenarioParticipants`, `snapshotWorld`, `diffSnapshots`, `formatDiff`) — the exact reusable pattern for this phase's "before/after baseline" requirement (D-09 from Phase 1, ORDER-02).

### Established Patterns
- `world` is the single object threaded through every function — the sort-then-dispatch logic should not introduce new module-level state (matches Phase 1's precedent).
- `decideAndAct()`'s existing candidate-scoring shape (do nothing / attack / press for explanation / tell a confidant / retreat) is untouched by this phase — only extracted into a separate callable unit.

### Integration Points
- `performAction`'s witness dispatch loop (`sim.js:288`) is the sole integration point for the new ordering logic.

</code_context>

<specifics>
## Specific Ideas

None beyond what's captured in Decisions — this phase's shape is fully determined by CONCERNS.md's own documented fix approach and research/SUMMARY.md's architecture notes.

</specifics>

<deferred>
## Deferred Ideas

- Tick-sharing / sub-ordering field for same-originating-event reactions (D-05 above) — explicitly deferred per CONCERNS.md's own "worth revisiting" framing, not scoped to ORDER-01/ORDER-02.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo_count: 0`).

</deferred>

---

*Phase: 2-Witness Reaction Ordering*
*Context gathered: 2026-08-12 (auto mode)*
