# Phase 3: Belief Decay & Needs Regeneration - Context

**Gathered:** 2026-08-13 (auto mode)
**Status:** Ready for planning

<domain>
## Phase Boundary

Beliefs fade the way memories already do, and needs recover instead of only
ever dropping. Currently `mind.beliefs` only ever grows (no decay, no pruning
— unlike `mind.memories`, which self-prunes via `memoryStrength()`,
`sim.js:496-511`), and `mind.needs` (`safety`/`sustenance`/`belonging`,
default `{1, 1, 0.6}`, `sim.js:80`) is only ever lowered by `adjustNeed()`
(`sim.js:476-478`) — nothing raises any need back toward 1, and `belonging`
has zero triggers of any kind. This phase adds both: belief confidence decay
+ a "known false" pruning exemption, and needs regeneration + belonging's
first trigger + a hysteresis band on the `safety < 0.7` retreat gate
(`sim.js:1172`).

</domain>

<decisions>
## Implementation Decisions

### Belief decay
- **D-01 [auto]:** `beliefConfidence(belief, tick)` mirrors `memoryStrength()`'s
  exact formula shape (`halflife = 3 + X*35`, `decayed = X * 0.5^(Δt/halflife)`),
  substituting the belief's own `confidence` for memory's `importance` — beliefs
  have no separate importance field, and confidence is the closest existing
  analog for "how much this belief matters / how strongly held it is."
  *(Auto-selected: research/SUMMARY.md explicitly recommends "mirroring the
  existing memory-decay formula"; reusing the exact shape avoids introducing a
  second decay-math family for a five-NPC prototype.)*
- **D-02 [auto]:** Beliefs tagged as contradicted-by-ground-truth (confidence
  `0`, `source` containing "known false" per `checkContradiction()`,
  `sim.js:710`) are exempt from pruning regardless of staleness — pruning only
  removes genuinely stale, unreinforced beliefs whose decayed confidence falls
  below a floor (mirror `addMemory()`'s `0.03` floor, `sim.js:509`).
  *(Auto-selected: PITFALLS research explicitly named this — "a confidence-0
  contradicted belief is the most important thing to keep, not the least";
  a naive floor-based prune would delete exactly the protective record DECAY-02
  requires keeping.)*
- **D-03 [auto]:** Pruning happens the same way `addMemory()` self-prunes —
  filtered at the point a new belief is pushed (`applyClaimBelief`/witnessed
  belief formation), not via a separate sweep pass. No new tick loop; matches
  the codebase's only existing precedent for bounding an ever-growing array.

### Needs regeneration
- **D-04 [auto]:** Each need tracks a last-adjusted tick alongside its stored
  value (`mind.needs.safety = { value, tick }` instead of a flat number), and
  a live accessor `needValue(agent, needKey, currentTick)` computes the
  regenerated value at read time — asymptotic approach toward `1`
  (`value += rate * (1 - value)` per elapsed tick, research's "exponential
  approach-to-target" shape), never a flat number read directly.
  *(Auto-selected: matches the codebase's lazy-computed-live idiom
  [`memoryStrength`, `activeEmotionIntensity`] rather than adding a per-tick
  sweep loop — no game loop exists in `sim.js`, `world.tick` only advances
  inside `performAction()`, so live-computed-at-read is the only pattern that
  fits without inventing new architecture.)* **Structural consequence:** every
  existing direct read of `agent.mind.needs.<key>` (e.g. `sim.js:1172`) must
  be updated to call `needValue()` instead — flagged explicitly so the planner
  doesn't miss a read site.
- **D-05 [auto]:** `belonging`'s first-ever trigger: a positive `Give` (giving
  someone bread/gold with no coercive framing) or a friendly `Tell` (vouching
  for someone, `is_trustworthy` claims) raises the *giver's* or *teller's*
  `belonging` — the act of connecting with someone raises your own sense of
  belonging, not just the recipient's. *(Auto-selected: this is the most
  direct, least-invented mapping of an existing verb to belonging's Baumeister
  & Leary "need to belong" grounding named in research/SUMMARY.md — reuses
  Give/Tell, adds no new verb, consistent with the project's "no new generic
  verbs this milestone" constraint.)*
- **D-06 [auto]:** `safety` and `sustenance` regenerate passively via D-04's
  live accessor (time alone moves them back toward `1`); `belonging`
  regenerates via D-05's explicit triggers *in addition to* the same passive
  drift (the "and/or" in DECAY-03's wording, per REQUIREMENTS.md, is read as
  "both, not exclusive-or" — CONCERNS.md's own fix-approach language names
  "passive drift toward 1" as the general rule and "at least one trigger for
  belonging" as an addition on top, not an alternative).

### Retreat-gate hysteresis
- **D-07 [auto]:** The `safety < 0.7` retreat check (`sim.js:1172`) becomes a
  two-threshold band: retreat is newly triggered when `safety` drops below
  `0.65`, and stops being triggered by this condition only once `safety` rises
  back above `0.75` — a witness already retreating for this reason keeps
  retreating through the `[0.65, 0.75]` band; a witness not yet retreating
  only starts below `0.65`. *(Auto-selected: standard hysteresis-band
  construction, symmetric ±0.05 around the existing `0.7` cutoff — cheapest
  fix that satisfies DECAY-05's "does not flicker" requirement without
  inventing new state beyond what D-04 already adds.)* **Requires tracking
  whether an agent is currently "retreating for safety reasons"** as a small
  piece of state (could be a computed check against recent `mind.log` entries,
  or a new field) — left to the planner's discretion for exact mechanism, but
  the two-threshold behavior itself is locked.

### Claude's Discretion
- Exact regeneration rate constant for D-04's asymptotic approach (goes in
  `Sim.TUNING`, per Phase 1's D-06/D-07 shared constants block).
- Exact mechanism for tracking "currently retreating" state for D-07's
  hysteresis (recent-log-scan vs. a new field) — as long as the two-threshold
  behavior holds.
- Whether `belonging`'s trigger magnitude differs between Give and Tell — any
  reasonable positive delta satisfies DECAY-04's "at least one working
  trigger" requirement.
- Exact prune-floor constant for belief decay (D-02) — reuse `0.03` (memory's
  existing floor) unless a reason emerges to differ.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 3: Belief Decay & Needs Regeneration" — goal, dependencies (Phase 1, Phase 2), requirements, success criteria
- `.planning/REQUIREMENTS.md` §"Belief Decay & Needs Regeneration" — DECAY-01 through DECAY-05 full text

### Research grounding
- `.planning/research/SUMMARY.md` §"Phase 2: Belief Decay/Needs Regeneration" — "existing idiom, lower risk" framing, the lazy-accessor pattern recommendation
- `.planning/research/STACK.md` — the "computed-live-at-read" vs. "event-driven-stored" mutation-idiom split, and the needs-regeneration formula family (Hull drive theory / Sims motives / Dörner Psi theory grounding for `belonging`'s Give/Tell trigger)
- `.planning/codebase/CONCERNS.md` §"Needs never regenerate; `belonging` has no triggers at all" and §"Belief decay/pruning never implemented" — the exact documented gaps this phase closes

### Prior phase decisions carried forward
- `.planning/phases/01-verification-infrastructure/01-CONTEXT.md` D-05 (LOCKED, RNG scope discipline) — no randomness enters belief decay, needs regen, or the hysteresis band; all of it is deterministic given tick and stored state
- `.planning/phases/01-verification-infrastructure/01-CONTEXT.md` D-06/D-07 (shared `Sim.TUNING` block) — new constants from this phase (regen rate, prune floor if it differs from `0.03`, hysteresis band width) go there
- `.planning/phases/02-witness-reaction-ordering/02-CONTEXT.md` D-01 (`scoreCandidates()` extraction) — this phase's hysteresis fix touches the same retreat-candidate scoring path; read the current `sim.js` post-Phase-2 state, not old line numbers

### Code locations
- `sim.js:80` — `mind.needs` default shape (will change structurally per D-04)
- `sim.js:476-478` — `adjustNeed()`, the sole existing mutator
- `sim.js:496-511` — `memoryStrength()`/`addMemory()`, the formula and pruning template to mirror
- `sim.js:710` — `checkContradiction()`, source of "known false" tagged beliefs
- `sim.js:1172` — the `safety < 0.7` retreat gate (exact line may have shifted after Phase 2; re-grep before editing)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `memoryStrength()`/`addMemory()` — the exact template for both belief decay's formula (D-01) and its self-pruning-on-push pattern (D-03).
- `activeEmotionIntensity()` (`sim.js:485-489`) — a second existing example of the lazy-computed-live idiom, reinforcing that this is the codebase's established pattern, not a one-off.

### Established Patterns
- No sweep/tick loop exists anywhere in `sim.js` — every existing decay is computed live at read time from `(storedValue, formedTick, currentTick)`. New decay/regen logic in this phase must follow the same shape.
- `Sim.TUNING` (Phase 1) is the landing spot for every new tuning constant this phase introduces.

### Integration Points
- Belief push sites (witnessed belief formation, `applyClaimBelief`) — where D-03's prune-on-push logic attaches.
- `sim.js:1172`'s retreat-candidate scoring in `decideAndAct()` — where D-07's hysteresis band attaches, and where D-04's `needValue()` accessor replaces the current raw `mind.needs.safety` read.
- Any code reading `agent.mind.needs.*` directly elsewhere in `sim.js`/`presentation.js` (mind inspector rendering) needs auditing once D-04's structural change lands — flagged for the planner to grep fresh rather than trust this list.

</code_context>

<specifics>
## Specific Ideas

None beyond what's captured in Decisions — this phase's shape is fully
determined by CONCERNS.md's documented gaps and the existing lazy-decay
precedent already established in `sim.js`.

</specifics>

<deferred>
## Deferred Ideas

None — this phase's scope (DECAY-01 through DECAY-05) has no adjacent ideas
that came up during auto-mode context gathering beyond what's already in
REQUIREMENTS.md.

### Reviewed Todos (not folded)
None — no pending todos matched this phase (`todo_count: 0`).

</deferred>

---

*Phase: 3-Belief Decay & Needs Regeneration*
*Context gathered: 2026-08-13 (auto mode)*
