# Architecture Research

**Domain:** Agent-based NPC simulation — mutable personality/trait-drift and memory-salience/reactivation, specifically for Tiny Town's existing `sim.js` (perceive → believe → decide → act, single `performAction` entry point, no game loop)
**Researched:** 2026-08-12
**Confidence:** MEDIUM overall — HIGH for the parts derived directly from the existing codebase (`sim.js`, `PERSON-MODEL.md`, `CONCERNS.md`), MEDIUM for the one external precedent (Dwarf Fortress's stress/personality system), LOW/absent for anything requiring more literature — this is a narrow enough problem (mutable-trait NPC simulation with no tick loop) that general "game AI architecture" search results were mostly inapplicable

## The Central Fact That Shapes Everything Below

Tiny Town has **no game loop**. There is no `update()`, no interval, no fixed timestep. `world.tick` only advances inside `performAction()` (`sim.js:199`), i.e. time passes only when someone *acts*. This is the single fact that makes generic "game AI architecture" advice (ECS decay components, per-frame update systems, DDA loops) the wrong shape for this codebase — most of what a web search returns for "NPC needs decay" or "personality drift architecture" assumes a tick loop that doesn't exist here and shouldn't be added.

The codebase already solved "decay without a loop" twice, and the solution is the template for everything new in this milestone:

```js
memoryStrength(mem, tick) = importance × 0.5^((tick - mem.formedTick) / halflife)
activeEmotionIntensity(agent, emotion, targetId, tick) = sum of matching entries' decayed value
```

Both are **lazy, read-time functions** of `(storedValue, formedTick, currentTick)`. Nothing ever writes a decayed value back into the mind object; nothing sweeps the array on a timer. Decay is a *view*, computed fresh every time something reads it, using whatever `world.tick` happens to be at read time. This is why memories/emotions never need a per-tick pass and never drift out of sync with `world.tick` — there's no second copy of "current strength" to go stale.

**This resolves the question of where passive decay lives: nowhere new.** It is not a pass, not a subsystem, not a place in the pipeline at all — it's an accessor function called wherever the raw stored value is currently read directly. Event-triggered instant reactions, by contrast, must be **write-time**: they mutate stored state inside the existing `perceiveEvent`/`applyAppraisal`/`decideAndAct` path, at the moment an event is witnessed. The dichotomy in the research question ("where does passive decay live relative to event-triggered reactions") turns out to be a dichotomy between *read-time computation* and *write-time mutation*, not between two different pipeline stages.

## Standard Architecture (as it applies here — no new layer, extend existing three)

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                    Sim.performAction() (unchanged)                 │
│  checkPreconditions → applyEffects → push event → computeWitnesses │
│           → perceiveEvent (per witness, reordered by urgency)      │
└───────────────────────────┬─────────────────────────────────────┘
                             │ per witness, at write time
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  perceiveEvent (existing, extended)                                │
│   1. appraiseEvent()            — impact of THIS event              │
│   2. addMemory()                — unchanged, now Tell/Move-aware    │
│   3. push witnessed/claimed belief() — unchanged shape               │
│   4. applyAppraisal()           — relationship deltas, unchanged     │
│   5. NEW: accumulatePressure()  — write per-trait/value/worldview    │
│           accumulator (decayed running counter), keyed by which     │
│           sticky-box entry this event's appraisal implicates        │
│   6. NEW: checkSnapThreshold()  — single-event intensity check;      │
│           on trip, queues a trait/value/worldview write              │
│   7. scoreCandidates() (existing decideAndAct logic, extracted       │
│      into a pure function) — reads trait/value/worldview/need/       │
│      emotion state AS OF START OF THIS PERCEPTION, not anything      │
│      just written in steps 5-6                                       │
│   8. decideAndAct fires the winning candidate → performAction        │
│      (existing recursive reaction path, now breadth-first)           │
└───────────────────────────┬─────────────────────────────────────┘
                             │ AFTER the reaction cascade for this
                             │ witness (or this whole event, see
                             │ Build Order) fully resolves
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│  NEW: commitDrift() — applies any queued trait/value/worldview      │
│   writes from steps 5-6 above, deferred until the cascade this       │
│   event triggered has finished scoring itself against the OLD        │
│   trait values                                                       │
└──────────────────────────────────────────────────────────────────┘

READ-TIME (no new pipeline stage — called from wherever raw state is read):
  beliefConfidence(belief, tick)   — mirrors memoryStrength, same 0.5^(Δt/halflife) shape
  needValue(agent, need, tick)     — recovers toward baseline as f(ticks since lastDropTick)
  memoryStrength(mem, tick)        — existing, unchanged
  activeEmotionIntensity(...)      — existing, unchanged
```

### Component Responsibilities

| Component | Responsibility | Where it lives |
|-----------|----------------|-----------------|
| Lazy decay accessors (`beliefConfidence`, `needValue`) | Compute current effective value from stored value + elapsed ticks, on every read | New functions in `sim.js`, same file/module as `memoryStrength` — not a new file, not a new layer |
| Pressure accumulator | Per-agent, per-trait/value/worldview-entry decayed running counter, written at event-perception time, read at drift/snap-check time | New field on `mind`, written inside `perceiveEvent`, read only by drift/snap logic — never by `decideAndAct`'s scoring |
| Snap-check | Single-event intensity test against threshold, context-modulated (current emotions/beliefs/worldview) | Inline in `perceiveEvent`, right after `appraiseEvent`, using the appraisal already computed for this event — no second appraisal pass |
| Deferred trait/value/worldview writer (`commitDrift`) | Applies queued mutations to `mind.personality`/`mind.values`/`mind.worldview` only after the reaction cascade triggered by the current event has fully resolved | New function, called once per top-level `performAction` call (i.e., where `reactionDepth` returns to 0), not per witness |
| Witness scheduler | Computes all witnesses' candidate scores for one event before any of them acts, fires highest-urgency first | Replaces the `forEach` in `performAction`'s witness dispatch (`sim.js:209-213`) — same file, same function, restructured |
| Trigger-reactivation | Old, decayed-but-not-pruned intense memories/beliefs that cross a "still salient enough to matter" read at decision time, feeding a transient emotion re-spike | Reads `memoryStrength`/`beliefConfidence` — a read-time consumer of the same decay accessors, wired into `appraiseEvent` or a new `checkReactivation()` called before `scoreCandidates` |

No new files, no new layer, no DOM boundary changes. Every new piece is either (a) a lazy accessor function alongside `memoryStrength`, or (b) new fields inside the existing `mind` object read/written from inside `sim.js`'s existing pipeline functions. This matches `CLAUDE.md`'s constraint that new mechanics go through the existing pipeline, not a parallel system.

## Recommended Structure (adapted — this is a 3-file static app, not a scalable web app)

There is no `src/` tree to design; the template's "Recommended Project Structure" section is inapplicable here and reproducing it would manufacture structure that doesn't fit a three-`<script>`-tag static site. The real structural decisions are all *within* `sim.js`:

- **New `mind` fields go in `makeAgent()`** (`sim.js:44-74`), documented in `PERSON-MODEL.md` in the same change (per `CLAUDE.md`'s doc-sync rule) — most likely a tenth-ish addition: a `pressure` map (or per-box `pressure` sub-fields) rather than a fully independent tenth box, since it's infrastructure for mutating the existing three sticky boxes, not a new category of thing an NPC has. Flag this explicitly for the roadmap/design pass: adding a distinct `mind.pressure` box changes the nine-box model's count and the CLAUDE.md mutability table, so it needs its own line in both docs regardless of which shape is chosen.
- **New accessor functions go beside their existing siblings**: `beliefConfidence` next to `memoryStrength`; `needValue` next to `adjustNeed`. Consistent with the file's existing convention of grouping by mind-box, not by "feature."
- **The witness-scheduler rewrite stays inside `performAction`**, replacing the `forEach` at `sim.js:209-213` — it is not a new module, just a restructured loop plus one extracted pure function (`scoreCandidates`, factored out of the top of `decideAndAct` so it can be called for all witnesses before any of them fires).

## Architectural Patterns

### Pattern 1: Lazy (read-time) decay, not swept (write-time) decay

**What:** Store `(value, formedTick)` or `(value, lastTriggerTick)`; compute the current effective value as a function of `world.tick` only when something reads it. No background pass ever touches the stored value.
**When to use:** Any decay that should track elapsed *simulated* ticks and where nothing needs to "know" the decayed value except at the moment of use — this is every decay case in this milestone (belief confidence, need recovery).
**Trade-offs:** Pro — zero new module-level state, zero risk of the decayed copy drifting out of sync with `world.tick`, trivially consistent with the existing `memoryStrength`/`activeEmotionIntensity` precedent, no game-loop needed. Con — every read site must be found and routed through the accessor, or it silently reads the stale raw value; for belief decay specifically, that's at least four call sites (`checkContradiction`, `findConflictingBeliefs`, `believesDead`, the corroboration check in `applyClaimBelief`) that must be audited, not just the two formation sites.

**Example (shape to follow, mirroring the existing `memoryStrength`):**
```js
function beliefConfidence(belief, tick) {
  const halflife = 5 + belief.confidence * 40; // shape TBD in design, same idiom
  return belief.confidence * Math.pow(0.5, (tick - belief.tick) / halflife);
}
function needValue(agent, needKey, tick) {
  const n = agent.mind.needs[needKey];
  const recovered = 1 - (1 - n.value) * Math.pow(0.5, (tick - n.lastDropTick) / n.recoveryHalflife);
  return recovered; // only ever recovers toward baseline, never past it
}
```

### Pattern 2: Accumulate-then-threshold, never event-writes-trait-directly

**What:** An event never mutates `mind.personality`/`values`/`worldview` directly. It writes to a decayed running counter (an accumulator — same `0.5^(Δt/halflife)` shape as memory/emotion decay, since it's a rolling window whether or not it's called one). Only when the accumulator crosses a threshold, or a single event's intensity alone clears a separate (higher) snap threshold, does a trait/value/worldview field actually change.
**When to use:** All of slow drift and snap-events. This is the mechanism that answers PROJECT.md's open question ("running counter vs. rolling window" — an exponentially-decayed counter *is* a rolling window, and the codebase already commits to that shape twice) and gives the Phelps-Roper "regression trap" for free: an accumulator that decays when unreinforced naturally reverts a near-miss shift if the pressure doesn't keep coming.
**Trade-offs:** Pro — rate-limits trait change, makes "sustained pressure" and "one intense event" the same mechanism at two threshold heights (no separate code path to keep in sync), gives natural provenance (the accumulator's recent contributors ARE the "why" for a drift, same pattern as `event.why`/`explainTerms`). Con — adds a genuinely new kind of state (the accumulator itself) that needs its own decay-rate design pass, and doubles the surface that CONCERNS.md's "no test coverage" risk applies to.

### Pattern 3: Snapshot-then-decide, defer the write

**What:** `decideAndAct`'s `scoreCandidates` must read personality/values/worldview/needs/emotions as they stood *before* the current event's own drift/snap effects are applied — not after. Any accumulator update or trait write triggered by appraising event E is queued, and only committed (`commitDrift`) after the reaction cascade E itself sets off has fully resolved (i.e., where `reactionDepth` returns to 0 at the top of `performAction`, mirroring the existing `try/finally` pattern already there for the depth counter).
**When to use:** Every place drift/snap writes could otherwise be read back by the same or a cascading `decideAndAct` call in the same event chain.
**Trade-offs:** Pro — this is the direct fix for the feedback-loop risk in the research question: without it, appraising a `CompetitiveJungle`-raising event would raise `CompetitiveJungle` and then have the witness's *own* reaction to that same event scored against the already-raised value, double-counting the event's own influence on the decision it's supposedly independent of. Con — requires threading a small "pending drift" queue through the reaction cascade, and requires deciding whether "resolved" means per-witness or per-top-level-event (see Build Order below — this interacts directly with the witness-reordering work).

### Pattern 4: One-way information flow — accumulators/pressure are never decision inputs

**What:** Extend the codebase's existing rule that `event.why`/`mind.log[].why` are display-only and never read back into scoring. Pressure accumulators (Pattern 2) must be write-only from the decision system's point of view: `scoreCandidates` reads trait/value/worldview/need/emotion values, never the accumulator that's pushing them.
**When to use:** Always, for this milestone's additions.
**Trade-offs:** Pro — prevents a second-order feedback loop (accumulator influencing the decision that influences the accumulator) on top of the first-order one Pattern 3 already guards against. Con — none; this is a discipline rule, not a design trade-off, but it's easy to violate accidentally (e.g., "let a high-pressure NPC be extra jumpy right now" is tempting and is exactly the loop to avoid — that effect should already show up through the *trait* once it moves, not through reading the accumulator directly).

### Secondary patterns worth naming (each one line)

- **Deadband/hysteresis on trait writes.** A trait that just moved should require somewhat *more* opposite-direction pressure to move back than it took to move forward, or it will oscillate under alternating events — general control-systems mitigation for feedback-driven state (confirmed as a standard mitigation for oscillating decision systems, not specific to this domain — MEDIUM confidence, general software-architecture principle rather than a domain-specific finding).
- **Keep traits clamped away from the extremes.** `CONCERNS.md` notes `decideAndAct`'s `doNothingScore` is deliberately centered on personality's `0.5` default; drift/snap pushing a trait to a true 0 or 1 silently breaks that centering assumption elsewhere in the scoring. Clamp drift to a band, not the full `[0,1]`/`[-1,1]` range the static values currently use.
- **Rate/vulnerability modulation by the trait itself is a documented real-world precedent, not a novel design.** Dwarf Fortress's stress system (MEDIUM confidence, single external source, verified via direct fetch of the DF wiki) uses exactly this shape: a running stress tally that only some events move, three separate personality facets modulating *accumulation speed*, *breaking threshold*, and *dissipation speed* independently (not one flat rate), and — directly relevant to trigger-reactivation — "revisiting a long-term memory" re-adds stress just like the original event did. This maps closely onto: pressure accumulator (stress tally) + neuroticism/boldness modulating rate (bravery/anxiety-equivalent) + old-memory reactivation re-emitting a transient emotion (DF's memory-revisit re-triggering stress). It is the one concrete existing-system precedent found for this exact problem shape; general "game AI personality drift" literature otherwise returned mostly patent filings and LLM-persona-drift results, which are a different phenomenon (context-window degradation in a language model, not deliberate simulated trait mutation) and should not be cited as precedent for this milestone.

## Data Flow

### How "sustained pressure" moves through the existing mind-box structure

```
event E witnessed by NPC N
        │
        ▼
appraiseEvent(E, N)  — existing, unchanged: computes impact/valence
        │
        ├──────────────────────────────────────────────────┐
        ▼                                                    ▼
addMemory / push belief / applyAppraisal   accumulatePressure(N.mind, implicatedKey, appraisal, tick)
(existing, unchanged data flow)             — NEW: which trait/value/worldview key(s) does this event
        │                                     implicate? (open design question per PROJECT.md — likely
        │                                     reuses the SAME hook mapping already documented in
        │                                     PERSON-MODEL.md, e.g. an Attack implicates Safety/
        │                                     DangerousWorld/neuroticism, since those are already the
        │                                     documented hooks for events of that shape)
        │                                            │
        │                                            ▼
        │                                   pressure[key] = pressure[key]×0.5^(Δt/halflife) + appraisal.impact×weight
        │                                            │
        │                                   checkSnapThreshold(pressure[key], appraisal.impact) →
        │                                     queue immediate write if single-event intensity alone clears
        │                                     the (higher, context-modulated) snap bar
        │                                            │
        │                                   pressure[key] crosses SLOW threshold → queue drift write
        ▼                                            ▼
scoreCandidates(N, world, tick)  ◄── reads N.mind.personality/values/worldview/needs/emotions
   (reads PRE-drift state — queued writes above are NOT visible here)
        │
        ▼
decideAndAct fires winning candidate → performAction (existing recursive path)
        │
        ▼
   [reaction cascade for this event resolves — existing MAX_REACTION_DEPTH-bounded recursion]
        │
        ▼
commitDrift(N.mind)  — NEW: applies queued trait/value/worldview writes, once cascade is done
```

The accumulator (`pressure`) is the only genuinely new kind of state. Everything else in this flow either reuses an existing function (`appraiseEvent`) or is a straightforward extension of the existing witnessed/claimed-belief and relationship-update flow already documented in `PERSON-MODEL.md`.

### Trigger-reactivation's data flow (depends on the above)

```
scoreCandidates(N, world, tick)  [or a checkReactivation() step just before it]
        │
        ▼
for each of N's memories/beliefs with STORED importance/confidence ≥ "was intense" flag:
        current = memoryStrength(mem, tick) / beliefConfidence(belief, tick)  ← read-time accessor
        if current still above a re-trigger floor AND something in the CURRENT event
           "reminds" N of it (open design question, per PROJECT.md: same predicate? same actor? — not resolved)
        → emit a transient emotion re-spike (reuses existing emotion push mechanism, same shape as
          applyAppraisal's existing emotion pushes) — this is a READ of decay state producing a
          WRITE of a new emotion entry, not a mutation of the memory/belief itself
```

This is why trigger-reactivation is last in build order: it consumes both the Tell/Move-aware importance fix (so conversation memories are ever intense enough to be worth reactivating) and the accumulator/threshold machinery (so "was this intense" has a real definition instead of a guess).

## Build Order

Ordered by hard dependency, not by priority — later items build directly on data structures or extracted functions earlier items introduce.

**1. Witness reaction reordering.** Build first, independent of everything else. This is the only item that changes the *shape* of dispatch itself (`performAction`'s witness `forEach` → score-all-witnesses-then-fire-highest-first), and every later item is downstream of "which witness perceives which events in what order," including how pressure accumulates. It also forces the concrete decision Pattern 3 depends on — whether ticks are shared across reactions to the same originating event or need a sub-ordering field (CONCERNS.md's fix approach #2) — and requires extracting a pure `scoreCandidates()` out of `decideAndAct`, which drift/snap (Pattern 3) need as a call site anyway. Doing this after drift/snap exist would mean re-validating all drift/snap behavior against a changed event ordering.

**2. Belief decay + needs regeneration, as one pass.** Independent of reordering and of each other in effect, but share the identical lazy-accessor idiom (Pattern 1), so building them together is cheaper than two separate design passes. Needs regeneration directly fixes the CONCERNS.md-documented permanent-retreat-bias bug (`needs.safety < 0.7` gate). Belief decay also caps the unbounded-scan performance concern CONCERNS.md flags as worth solving together with pruning.

**3. Tell/Move-aware memory importance.** Currently every conversation memory forms at the `0.1` floor and decays in ~6-7 ticks — nothing from a Tell/claim ever survives long enough to be a candidate for trigger-reactivation (item 6). This must land before reactivation has anything non-trivial to reactivate; it has no dependency on items 1-2, so it can be built in parallel with them, but must land before item 6.

**4. Slow trait drift (personality/values/worldview accumulator + threshold + deferred write).** Establishes the accumulator data structure, the implicated-key mapping, the deferred-commit mechanism (Pattern 3), and the clamp/deadband guards. Depends on item 1 being done first (drift reads events in urgency order, and the deferred-write point — "cascade resolved" — is only well-defined once dispatch is restructured).

**5. Snap-events (single-event, context-modulated intensity bypassing the slow path).** Same accumulator, write path, and deferred-commit machinery as item 4, just a second, higher, context-modulated threshold checked at the same site. Materially cheaper once item 4 exists — do not build in parallel with it; snap is a variant of drift's mechanism, not a separate one.

**6. Trigger-reactivation + "charge stickiness" (repeated near-miss events making a charge harder to fade).** Depends on item 3 (memories worth reactivating must exist) and on items 4-5 (an accumulator and a notion of "was this intense enough to be a Change vs. a temporary spike" must exist before "reactivate that old intensity" is meaningfully different from ordinary memory recall). Build last.

**Cross-cutting, not itself an ordered item — flag for roadmap:** a seeded RNG (`Math.random()` currently appears unseeded at three sites: Attack damage, gossip truth-telling, scapegoat selection). Every item 2-6 above is a scoring-weight or threshold change verifiable today only by hand against the one documented case (two clones, opposite `CompetitiveJungle` weight). Without a seeded RNG (state on `world`, not module-level, consistent with `CONVENTIONS.md`'s existing warning against more module-level mutable state), reproducing a specific traced drift/snap interaction to debug it will be materially harder with each item added. Best introduced before item 4, where scoring-adjacent changes start compounding — not mandatory to sequence strictly, but worth the roadmap deciding on explicitly rather than discovering the need mid-phase.

## Anti-Patterns

### Anti-Pattern 1: A per-tick sweep pass over all agents' traits/needs/beliefs

**What people do (in tick-loop-shaped engines):** Add an `updateAll(world)` called once per game loop iteration that walks every agent and decrements/increments stored decay values.
**Why it's wrong here:** There is no game loop and no fixed timestep — `world.tick` only advances inside `performAction`. A sweep pass would need its own invocation point (called from where? `presentation.js`'s render loop, which doesn't exist as a loop either — it's event-handler-driven), introducing exactly the kind of new module-level/DOM-adjacent state `CONVENTIONS.md` already warns against, and it would compute decay against a `tick` value that may not have changed since the last sweep (since ticks are action-driven, not wall-clock-driven).
**Do this instead:** Lazy read-time accessors (Pattern 1), following `memoryStrength`/`activeEmotionIntensity`'s existing precedent exactly.

### Anti-Pattern 2: Writing drift directly inside `appraiseEvent` or `applyAppraisal`

**What people do:** Since `appraiseEvent`/`applyAppraisal` already compute "how much did this matter," it's tempting to also nudge `mind.personality`/`values`/`worldview` right there, in the same pass.
**Why it's wrong:** This is exactly the feedback loop the research question asks about — the witness's own `decideAndAct` call for the *same* event would then score against a trait value the event itself just changed, double-counting the event's influence and making behavior sensitive to implementation-detail ordering within `perceiveEvent` rather than to the actual pressure accumulated over time.
**Do this instead:** Pattern 2 (accumulate, don't write) + Pattern 3 (defer the eventual write until after the cascade this event triggered has resolved).

### Anti-Pattern 3: Treating "sustained pressure" as a plain running sum with no decay

**What people do:** A simple counter that only ever increments (or increments/decrements on opposite-valence events) with no time-based decay of its own.
**Why it's wrong:** Gives no "regression trap" (PROJECT.md explicitly wants unintentional shifts to be able to revert once pressure lifts) and never distinguishes "five contradicting events over 5 ticks" from "the same five events spread across 5000 ticks" — the latter shouldn't drift a trait as readily as the former.
**Do this instead:** The same `0.5^(Δt/halflife)` decayed-accumulator shape already used twice in this codebase (Pattern 2) — this also directly answers PROJECT.md's open "counter vs. rolling window" question: they're the same thing once the counter decays.

### Anti-Pattern 4: A new `mind.pressure` box designed as a peer to the existing nine, without updating the mutability table

**What people do:** Bolt on a tenth box because it's new kind of data, without revisiting `CLAUDE.md`'s mind-box table or `PERSON-MODEL.md`'s per-box mutability/decay rules.
**Why it's wrong:** `CLAUDE.md` states the project treats drift between `PERSON-MODEL.md` and `sim.js` as a bug in one or the other; a new box that isn't reflected in both is exactly that drift, on day one.
**Do this instead:** Whichever shape the design pass picks (standalone box vs. per-box `pressure` sub-field on personality/values/worldview), update both `PERSON-MODEL.md`'s box list and `CLAUDE.md`'s mutability table in the same change that introduces it — flagged here explicitly because it's easy to treat as "just an implementation detail" and skip.

## Scaling Considerations (reframed — agent count and session length, not user count)

This is a 5-NPC, single-session, in-memory prototype with no persistence; "0-1k/100k+ users" from the template is inapplicable. The real scaling axis is **session length × agent count**, and the actual bottleneck is already documented in `CONCERNS.md`:

| Scale | What happens | Relevant to this milestone |
|-------|---------------|------------------------------|
| Current (5 NPCs, short sessions) | `world.events` and `mind.beliefs` grow unboundedly but stay small enough (a few hundred events) that O(events) scans in `checkContradiction`/`findConflictingBeliefs` are invisible | Belief decay (build order item 2) caps this as a side effect, per CONCERNS.md's own recommendation to solve pruning and scan-cost together |
| More NPCs or much longer sessions | O(events)-per-perception scans compound across every witness of every event, including reaction cascades; unbounded belief arrays get materially larger | Not a blocker for this milestone's scope, but the pressure accumulator (a small fixed-size structure per agent, unlike the append-only belief/event arrays) does NOT add to this cost — worth noting so the accumulator isn't mistaken for a new scaling risk |
| Multi-world / concurrent simulations | `reactionDepth` is module-level, not on `world` — already flagged in CONCERNS.md as unsafe for concurrent worlds | Not in scope; noted only because Pattern 3's deferred-commit queue has the same shape-of-risk (module-level vs. `world`-scoped) and should be scoped onto `world`/`mind` from the start rather than repeating the existing `reactionDepth` fragility |

## Integration Points

Not applicable in the conventional sense (no external services, no network). The relevant "integration points" are the existing internal boundaries, unchanged by this milestone:

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `sim.js` ↔ `presentation.js` | `Sim.*` public API only, read-only from presentation's side | New accessors (`beliefConfidence`, `needValue`) should be exposed the same way `memoryStrength` already is, if the mind inspector is to display live-decayed values — check whether `presentation.js`'s `renderMind` needs updating to call the new accessors instead of reading raw stored values directly |
| `sim.js` ↔ `parser.js` | Unaffected — parser only resolves names into `{verb, params}`, no mind-box interaction | No changes needed |
| Within `sim.js`: `perceiveEvent` ↔ `decideAndAct` | Currently sequential within one witness's perception; Pattern 3 requires this boundary to also carry a "pending drift, don't apply yet" signal | This is the one genuinely new internal boundary this milestone introduces — worth naming explicitly during implementation since it doesn't exist as a concept anywhere in the current pipeline |

## Sources

- `sim.js`, `PERSON-MODEL.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md` (this repository) — HIGH confidence, primary source for everything about the existing pipeline, the `memoryStrength`/`activeEmotionIntensity` decay precedent, and the documented open questions/gaps this research answers into.
- Dwarf Fortress Wiki, [Stress](https://dwarffortresswiki.org/index.php/DF2014:Stress) (fetched directly) — MEDIUM confidence, single external source but directly verified, not just search-summarized. The one concrete precedent found for "running pressure/stress accumulator + trait-modulated accumulation/dissipation rate + old-memory reactivation re-triggering emotion" as a shipped system in a personality/trait-driven simulation.
- Dwarf Fortress Wiki, [Personality facet](https://dwarffortresswiki.org/index.php/DF2014:Personality_facet) — MEDIUM confidence (search-summary only, not directly fetched) — corroborates "memories may change a creature's facets over time" as a named, shipped mechanic distinct from the moment-to-moment stress tally.
- General search results on "game AI personality drift architecture" and "avoiding feedback loop oscillation in mood/trait systems" — LOW confidence / mostly inapplicable. Returned patent filings (unverified — a claimed Rockstar "Personality Drift Modeling" patent should NOT be cited without verifying the actual filing, since it surfaced only in a search-engine summary) and LLM "persona drift" discussions, which describe context-window degradation in language models, a different phenomenon from deliberate simulated trait mutation, and are not used as precedent above. Ecosystem literature specifically on this problem shape (non-LLM, rule-based NPC simulation with sustained-pressure trait mutation) is thin; the hysteresis/deadband recommendation (Anti-oscillation, Pattern 3's secondary note) is a general control-systems principle, not a domain-specific finding, and is marked as such.

---
*Architecture research for: agent-based NPC simulation, mutable personality/trait-drift and memory-salience — Tiny Town Phase 2*
*Researched: 2026-08-12*
