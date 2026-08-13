# Phase 4: Tell/Move-Aware Memory Importance - Context

**Gathered:** 2026-08-13 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

`appraiseEvent()` (`sim.js:779-802`) has explicit branches for `Take`, `Attack`, and
`Give` but none for `Tell` or `Move` — both fall through with `impact` left at its
initial `0`. `perceiveEvent()` then does
`addMemory(witness, event.id, event.tick, clamp(Math.abs(appraisal.impact), 0.1, 1))`
(`sim.js:720`), so every Tell and every Move currently forms a memory at the floor
importance of `0.1` regardless of what was actually said or why the move happened —
being told "Mara is dead" and being told "Mara took some bread" form identically weak
memories, and neither can ever reach `memoryStrength`'s longer end because the
existing `1`-cap on importance already silently clamps the most severe *witnessed*
events (e.g. a high-Safety-value witness's Attack impact of `-1.2 * 1.3 = -1.56`) down
to the same `38`-tick halflife / `~190`-tick prune-crossover ceiling every other event
shares. This phase gives Tell a real severity-scaled impact, gives Move a real
causally-grounded impact, and raises the importance ceiling so genuinely severe news
(from any event type) can outlast that existing ceiling — closing MEMORY-01 and
MEMORY-02.

</domain>

<decisions>
## Implementation Decisions

### Tell impact scaling (MEMORY-01)
- **D-01 [auto]:** `appraiseEvent` gains a `Tell` branch whose base severity magnitude
  is looked up from a new per-predicate table, calibrated against magnitudes already
  implicit elsewhere in the engine rather than invented fresh:
  - `is_dead`: `1.5` — the paradigm "explosive" case REQUIREMENTS.md names explicitly;
    deliberately set *above* every other verb's typical magnitude (Attack tops out
    around `1.56` only at extreme Safety-value witnesses; `is_dead` should reach
    comparable severity from an ordinary witness too) so D-04's raised ceiling has
    something to actually use.
  - `attacked`: `1.0` — mirrors witnessed `Attack`'s un-value-boosted baseline
    (`1.2`, rounded down since a *claim* of violence is inherently once-removed from
    seeing it happen).
  - `stole_from`: `0.7` — mirrors witnessed `Take`'s offense-based range
    (`0.5`-`1.0` via `justiceWeight`).
  - `is_dangerous`: `0.6` — matches `applyClaimBelief`'s existing `0.3` fear-effect
    coefficient for this predicate, scaled up since fear-relevant news about a
    specific person is more memorable than the relationship-nudge alone suggests.
  - `provoked`: `0.4` — matches `applyClaimBelief`'s existing `0.3`/`0.15`
    coefficients for this predicate; a contextual/excusing claim, moderate.
  - `is_trustworthy`: `0.4` — positive claims land with similar weight to `Give`'s
    un-scaled baseline (`0.4`) since both are "someone did/said something that
    reflects well."
  *(Auto-selected: REQUIREMENTS.md's MEMORY-01 text explicitly asks for scaling "by
  the severity of what's claimed," and `applyClaimBelief`'s existing per-predicate
  relationship-effect magnitudes — `0.5`/`0.25` for stole_from/attacked, `0.2`/`0.1`
  for is_trustworthy, `0.3` for is_dangerous/provoked — are the only existing severity
  signal in the codebase to calibrate against, so the new table reuses that ordering
  rather than inventing an unrelated one.)*
- **D-02 [auto]:** That base magnitude is multiplied by the SAME confidence-in-the-claim
  value `perceiveEvent`'s existing Tell branches already compute
  (`clamp(0.4 + trust*0.5 + credulity*0.15, 0, 1)` when told directly,
  `clamp(0.2 + trust*0.3 + credulity*0.1, 0, 1)` when overheard, `sim.js:754-766`) —
  a claim you don't credit shouldn't form as vivid a memory as one you do. Because
  `appraiseEvent` is called from two sites that must compute identically
  (`orderWitnesses`'s read-only pre-pass at `sim.js:536`, and `perceiveEvent`'s real
  dispatch at `sim.js:719` — Phase 2's purity/determinism invariant), this formula is
  duplicated inline inside `appraiseEvent` rather than threaded in as a parameter.
  Direct-vs-overheard is read the same way `perceiveEvent` already distinguishes it:
  `event.data.targetId === witness.id`.
  *(Auto-selected: reusing the exact existing formula avoids inventing a second
  "how much do I believe this" calculation; inlining it is a two-line, well-precedented
  duplication — D-01 of Phase 3 already duplicates `memoryStrength`'s formula shape
  for the same "must stay a pure, independently-callable function" reason.)*
- **D-03 [auto]:** The existing generic `isVictim`/`victimAffection` care-scaling
  block (`sim.js:796-799`, applied after the verb-specific branch to every verb
  uniformly) is extended, not bypassed, for Tell: `isVictim` continues to mean
  "was I told directly" (reusing the exact same field `perceiveEvent` already reads
  this way at `sim.js:754`), and for predicates that name a subject other than the
  witness (`is_dead`, `attacked`, `stole_from`, `is_dangerous`, `provoked` when the
  witness isn't the provoker), the impact is additionally scaled by
  `relOf(witness, claim.subject).affection` the same way the existing block scales by
  `victimAffection` — how much you cared about who the claim is ABOUT, not just
  whether you were the one told.
  *(Auto-selected: the existing block already generically means "this matters more if
  it happened to someone I care about"; Tell's claim.subject is the closest existing
  analog to Take/Attack's targetId for "who this is about," so extending the same
  pattern rather than special-casing Tell keeps the "no scenario special-casing"
  architecture rule intact.)*

### Move impact scaling (MEMORY-01)
- **D-04 [auto]:** `appraiseEvent` gains a `Move` branch that stays at the existing
  flat floor (`impact = 0`, unchanged from today) UNLESS the Move is causally a
  reaction to a witnessed negative event: `event.causedBy` is set AND traces to an
  event in `world.events` where the mover (`event.actor`) was the target of an
  `Attack` or a non-consented `Take`. In that case the Move gets a moderate negative
  impact (`-0.5`) — witnessing someone visibly flee in the immediate aftermath of
  violence done to them is itself notable to onlookers, distinct from an ordinary
  reposition.
  *(Auto-selected: `event.causedBy` is already a first-class, always-populated field
  from Phase 2's reaction-dispatch architecture — using it to detect "this Move is a
  flight reaction" is a generic causal-chain check, not a per-scenario special case,
  and requires no access to the mover's own private mind state, which would violate
  the perceive/believe boundary. An ordinary non-reactive Move stays at `0`, matching
  today's behavior — this phase only closes the gap for the "explosive" case
  REQUIREMENTS.md names, not every Move.)*

### Resolving 04-PATTERNS.md's numeric findings (post-mapping addendum)
- **D-06 [auto]:** Tell's sign term: `is_trustworthy` is the only positive-polarity
  predicate of the six (its base severity adds to impact); `is_dead`, `attacked`,
  `stole_from`, `is_dangerous`, and `provoked` are all negative. Not stated explicitly
  in D-01 above; `04-PATTERNS.md` correctly flagged this as load-bearing (`applyAppraisal`
  branches on `impact < 0` vs. `>= 0` to route Anger/Fear vs. the forgiveness path) and
  it needed to be pinned down before planning, not left for the planner to guess.
- **D-07 [auto]:** D-03's `claim.subject` affection scaling uses the **boost form**, not
  a damping form: `impact *= 1 + clamp(relOf(witness, claim.subject).affection, 0, 1) * 0.5`
  — multiplies UP for a witness who cares about the claim's subject, never down below the
  base severity. `04-PATTERNS.md` numerically verified that a literal damping reading
  (mirroring the existing block's `else` arm) collapses the flagship direct-told `is_dead`
  case by roughly 70% at default relationship affection (~0.3) — directly contradicting
  D-01's stated intent that `is_dead` "should reach comparable severity from an ordinary
  witness too." The boost form preserves that intent while still scaling further for
  someone dearly cared about, and is the block's *other* existing arm
  (`victimAffection * generalCare * 1.5`-style amplification), not an invented shape.
  `provoked`'s carry-forward exception stands as originally stated (only applies when the
  witness isn't themselves the named provoker).
- **D-08 [auto]:** D-04's `-0.5` Move flight-impact base stays as originally set —
  `04-PATTERNS.md` verified it only reliably clears the `0.1` floor for a witness with
  above-fixture-median `generalCareOf` (e.g. `elena`, `generalCareOf ≈ 0.715`), collapsing
  to the exact floor for lower-empathy witnesses (`ives`, `tomas`, `garrick`, `mara`).
  This is accepted as correct, not escalated: an apathetic bystander genuinely shouldn't
  form a vivid memory of a stranger fleeing, and escalating the base magnitude to clear
  the floor for every witness was checked against a second constraint — it would invert
  the ordering against that same witness's impact from witnessing the CAUSING Attack
  directly (`04-PATTERNS.md`'s ordering check: at a magnitude that clears `ives`'s floor,
  `elena`'s flight-impact would exceed her own bystander-impact from the Attack that
  caused the flight, which is backwards). MEMORY-01's Move check must therefore target a
  witness whose `generalCareOf` clears the floor at `-0.5` (e.g. `elena`), not an
  arbitrary fixture witness, and assert the real computed value in its `detail` string.

### Importance ceiling (MEMORY-02)
- **D-05 [auto]:** The `clamp(Math.abs(appraisal.impact), 0.1, 1)` call in
  `perceiveEvent` (`sim.js:720`) has its upper bound raised from the literal `1` to a
  new `TUNING.maxMemoryImportance = 1.5` constant, applied uniformly to every event
  type (not special-cased to Tell) — so `memoryStrength`'s existing formula
  (`halflife = 3 + importance * 35`) naturally produces a longer halflife and a later
  prune-crossover for anything that reaches the new ceiling, with zero change to the
  decay formula itself.
  *(Auto-selected: this is the only generic way to satisfy MEMORY-02's "persists
  meaningfully longer than the current ~38-tick/190-delta-tick cap allows" — the old
  literal `1` was already silently clamping some witnessed Attack impacts today
  [e.g. `-1.56` at a high-Safety-value witness], so raising it is a strict widening,
  not a new mechanism, and applies to "any event type" per the requirement's own
  wording rather than just Tell.)*

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 4: Tell/Move-Aware Memory Importance" — goal,
  dependencies (Phase 1 only), requirements, success criteria
- `.planning/REQUIREMENTS.md` §"Tell/Move-Aware Memory Importance" — MEMORY-01,
  MEMORY-02 full text

### Prior phase decisions carried forward
- `.planning/phases/01-verification-infrastructure/01-CONTEXT.md` D-05 (LOCKED, RNG
  scope discipline) — no randomness enters impact scaling; everything here is
  deterministic given world/witness/event state
- `.planning/phases/01-verification-infrastructure/01-CONTEXT.md` D-06/D-07 (shared
  `Sim.TUNING` block) — `maxMemoryImportance` and any new per-predicate severity
  constants go there
- `.planning/phases/02-witness-reaction-ordering/02-03-SUMMARY.md` — the twice-called
  `appraiseEvent`/`scoreCandidates` purity contract (`orderWitnesses` pre-pass +
  `perceiveEvent` real dispatch must compute identically) — directly binds D-02's
  "duplicate inline, don't thread a parameter" choice
- `.planning/phases/03-belief-decay-needs-regeneration/03-CONTEXT.md` — the
  lazy-computed-live idiom and the project's existing tolerance for small, commented
  formula duplication (D-01 there duplicates `memoryStrength`'s shape for `beliefConfidence`)

### Code locations
- `sim.js:779-802` — `appraiseEvent()`, gains the `Tell` and `Move` branches
- `sim.js:720` — `perceiveEvent`'s `addMemory(...)` call, whose clamp upper bound
  changes per D-05
- `sim.js:754-766` — the existing Tell confidence formulas (direct vs. overheard),
  duplicated per D-02
- `sim.js:1099-1122` — `applyClaimBelief`'s per-predicate relationship-effect
  magnitudes, the calibration source for D-01's severity table
- `sim.js:536` — `orderWitnesses`'s pre-pass call to `appraiseEvent`, the second site
  that must compute identically to `perceiveEvent`'s real-dispatch call
- `sim.js:603-606` — `memoryStrength()`, unchanged; D-05 only widens its input range
- `sim.js:33-40` — `PREDICATE_LABELS`, the full list of six existing claim predicates
  D-01's severity table must cover

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `appraiseEvent`'s existing `Take`/`Attack`/`Give` branches — the exact template for
  how a new verb branch computes a signed magnitude before the generic
  `isVictim`/`victimAffection` scaling block runs.
- `applyClaimBelief`'s per-predicate relationship-effect magnitudes (`sim.js:1099-1122`)
  — the only existing severity ordering across the six claim predicates; D-01 reuses
  this ordering rather than inventing a new one.
- `perceiveEvent`'s direct-vs-overheard confidence formulas (`sim.js:754-766`) — D-02
  reuses these verbatim (duplicated, not refactored into a shared helper, since
  `appraiseEvent` must stay callable identically from both purity-bound call sites).
- `event.causedBy` — already populated by every reaction dispatch since Phase 2;
  D-04's Move detection is a read-only causal-chain check, no new field needed.

### Established Patterns
- `appraiseEvent` is called from exactly two sites (`orderWitnesses`'s pre-pass,
  `perceiveEvent`'s real dispatch) and must return identical results for the same
  `(world, witness, event)` triple — no memoization, no world-state writes inside it.
- `Sim.TUNING` (Phase 1) is the landing spot for every new tuning constant this phase
  introduces (`maxMemoryImportance`, and any per-predicate severity constants the
  planner chooses to name rather than inline).

### Integration Points
- `sim.js:779` — `appraiseEvent`'s `if/else if` chain, where the new `Tell` and
  `Move` branches attach alongside the existing three.
- `sim.js:720` — the single `addMemory(...)` call site whose clamp changes.
- `runDecayCheck()`/`runRegressionCheck()`/`runOrderingCheck()` in `sim.js` and
  `scripts/verify.js` — the same golden-master + acknowledgeable-check harness Phase 3
  used; this phase's baseline diff (memory importance values shifting for any
  scenario containing a Tell, Move, or a previously-clamped severe Attack) gets
  reviewed and re-blessed the same way, not silenced.

</code_context>

<specifics>
## Specific Ideas

None beyond what's captured in Decisions — this phase's shape is fully determined by
REQUIREMENTS.md's MEMORY-01/MEMORY-02 text and the existing `appraiseEvent`/`addMemory`
gap it names.

</specifics>

<deferred>
## Deferred Ideas

None — this phase's scope (MEMORY-01, MEMORY-02) has no adjacent ideas that came up
during auto-mode context gathering beyond what's already in REQUIREMENTS.md.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo_count: 0`).

</deferred>

---

## Claude's Discretion

- Exact `TUNING.maxMemoryImportance` value beyond "greater than `1`" — `1.5` is a
  reasonable default (extends halflife from `38` to `55.5` ticks at the ceiling,
  prune-crossover from `~190` to `~278` ticks) but the planner may tune it if a
  concrete scenario calls for a different exact number.
- Exact per-predicate severity constants in D-01's table beyond the stated ordering —
  named individually in `TUNING` or grouped in one small table object, planner's call,
  as long as the relative ordering (`is_dead` > `attacked` > `stole_from` ≈
  `is_dangerous` > `provoked` ≈ `is_trustworthy`) holds.
- D-04's exact Move flight-impact magnitude (`-0.5` suggested) — any reasonable
  negative value satisfies MEMORY-01's "real impact value... instead of the flat
  floor" for the flight case.
- Whether D-01's severity table lives as a new small object constant (e.g.
  `TELL_SEVERITY`) beside `PREDICATE_LABELS`, or as named `TUNING` entries — planner's
  call, consistent with the file's existing constant-organization style.

---

*Phase: 4-Tell/Move-Aware Memory Importance*
*Context gathered: 2026-08-13 (auto mode)*
