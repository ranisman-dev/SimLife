# Project Research Summary

**Project:** Tiny Town — Phase 2 person model ("sticky, not static")
**Domain:** Agent-based NPC simulation — mutable personality/trait-drift, memory-salience/reactivation, and belief/needs/ordering fixes in a dependency-free, browser-only prototype
**Researched:** 2026-08-12
**Confidence:** MEDIUM-HIGH

## Executive Summary

Tiny Town's Phase 2 milestone makes personality, values, and worldview mutable for the
first time — previously all three were set once in `createWorld()` and never touched
again. Four independent research passes (stack/technique, features/precedent,
architecture, pitfalls) converge on the same shape: **decayed accumulator, not rolling
window; accumulate-then-commit, never write-live; lazy read-time decay, never a sweep
pass.** All three conclusions are reinforced by the codebase's own existing idiom
(`memoryStrength`, `activeEmotionIntensity` are already lazy read-time functions of
`(storedValue, formedTick, currentTick)`) — Phase 2 extends a pattern the file already
has three times over, rather than inventing new architecture. One correction to the
project's own planning docs surfaced during research: **there is no citable "Phelps-Roper
framework."** `PERSON-MODEL.md` and `PROJECT.md` both name it as Phase 2's grounding, but
it resolves only to Megan Phelps-Roper's own personal deradicalization story, not a
published four-part mechanical model. This is a citation bug, not a design bug — the four
claims it's used to justify (intentional vs. unintentional change, sustained-pressure vs.
one-event change, a "regression trap," neuroticism modulating settle time) are each
independently well-grounded (Roberts/Walton/Viechtbauer 2006 on cumulative personality
change, Sherif's Social Judgment Theory on ego-involvement resistance, Prochaska &
DiClemente's relapse-as-a-stage as a structural — not literal — parallel for the
regression trap). Recommend retiring the name in both docs and citing the real sources
per-claim, as a cheap first-phase doc fix.

The recommended data model, reconciled across all four files rather than stated whole in
any one of them, is **three fields per drift-eligible entry**: a permanent `anchor`
(rewritten only on commit/snap), a live `weight` that can diverge from `anchor` and relax
back toward it (this divergence *is* "temporarily activated, not yet changed" — the state
Pitfall 9 warns a single counter cannot represent), and a separate `pressure` accumulator
(the decayed EWMA/leaky-integrator that decides *when* a divergence becomes permanent by
rewriting `anchor`). This isn't spelled out end-to-end in any single research file; it's
the synthesis that resolves STACK's anchor/weight recommendation, PITFALLS-9's demand for
a two-quantity model, and ARCHITECTURE's `pressure` accumulator into one coherent shape.
Treat it as the leading candidate, not a closed decision — flag it as the first thing to
confirm in the drift/snap design pass, since no researcher stated it as a unit.

The main risk is not technical difficulty but **verification collapse**: the project's
only regression check (two clones, opposite `CompetitiveJungle` weight, same event,
different reaction) silently stops meaning anything once worldview is mutable, and the
codebase's unseeded RNG turns what used to be one-off variance into session-shaping,
untraceable divergence once a random roll can push an event over a snap threshold. Both
are cheap to fix (a `driftEnabled` toggle plus tick-0 variant of the existing case; one
seeded `rng()` call site) but expensive to discover missing after the fact — Pitfalls
research rates the recovery cost of skipping them as the only HIGH in its recovery table
(landing witness-reordering and drift changes together, making a regression
unattributable to either). Recommend both land as infrastructure before any drift/snap
formula is written, not as an afterthought.

## Key Findings

### Recommended Stack

This is a technique stack, not a software stack — Tiny Town adds no dependencies; every
recommendation below is a plain-function pattern implemented directly in `sim.js`. Three
formula families cover everything: exponential decay (`0.5^(dt/halflife)`, already used by
Memories and Emotions, extended to Belief confidence), exponential approach-to-target
(`value += rate * (target - value)`, new — powers the pressure accumulator, drift, and
needs regeneration from one shape), and diminishing-returns reinforcement
(`importance += gain * (1 - importance)`, new — for "repeated echoes make it stickier").
Keeping to three families, reusing existing constants where possible, is explicitly
recommended over introducing a second decay-math family (e.g., true power-law forgetting)
for a five-NPC prototype with no visible behavioral payoff from the extra precision.

**Core technologies:**
- Anchor + weight split (state-machine pattern) — makes "temporarily activated" and
  "permanently changed" mechanically distinct fields, not just different labels on one
  number; the load-bearing design decision everything else hangs off
- Leaky integrator / EWMA (`pressure`) — tracks sustained pressure as one persistent
  scalar per trait/value/worldview entry, answering PROJECT.md's open "counter vs.
  rolling window" question without a new unbounded array
- Sherif's Social Judgment Theory (latitude of acceptance/rejection, ego-involvement) —
  principled gate for whether an event nudges a trait at all, and why extreme existing
  values should resist movement more (ego-involvement)
- Roberts/Walton/Viechtbauer (2006) cumulative-continuity meta-analysis — the real,
  citable academic grounding for "personality drifts slowly," replacing the
  non-existent "Phelps-Roper framework"
- ACT-R base-level activation / power law of forgetting — confirms the existing
  exponential-decay shape is a principled simplification, not an invented formula;
  justifies not switching to a true power-law curve
- Baumeister and Leary (1995), "need to belong" — names the first concrete input class
  (positive social contact via `Give`/friendly `Tell`) for the currently-untriggered
  `belonging` need

### Expected Features

Five comparable systems were surveyed (RimWorld, Dwarf Fortress, Crusader Kings 3,
Darkest Dungeon, The Sims); Prom Week was checked for trait mutability and found static.
All evidence is MEDIUM confidence at best (wikis, guides, dev blogs, one academic PDF),
but three convergent, independently-sourced systems (CK3, DF, DD) agree the "sustained
pressure" question resolves to a trait-modulated accumulator, not a rolling window — this
is the strongest cross-file agreement in the whole research set.

**Must have (table stakes):**
- Bounded, decaying belief state — every surveyed system caps or fades stored opinions;
  Tiny Town's currently-unbounded `mind.beliefs` array is the outlier, not the norm
- Symmetric, event-driven need restoration — needs that only ever drop (Tiny Town's
  current state) read as broken in every surveyed system; the fix is restoration via the
  existing five verbs (`Give` to sustenance, `Give`/`Tell` to belonging), not continuous
  per-tick decay
- Trait change as a rare, discrete, legible event — not smooth per-tick drift; supports
  the snap path directly and implies the slow path should resolve in visible steps
- Reaction ordering by urgency, not iteration order — already scoped as a known gap;
  every surveyed system processes the provoking event before downstream consequences

**Should have (differentiators):**
- Dual-path change (slow drift and single-event snap) — genuine differentiator vs. the
  more common static-trait baseline (RimWorld, The Sims)
- Context-modulated snap/drift rate (rate itself varies by current emotion/belief/
  worldview state) — extends the existing `neuroticism`-scales-Fear pattern; more
  thorough than any single surveyed system, none of which generalize past 1-2 modulating
  traits
- Positive-valence trigger reactivation (old memory resurfacing as courage/resolve, not
  only anxiety) — no surveyed system does this mechanically; would be ahead of the field
- Visible provenance for trait shifts (`event.why`-style transparency extended to
  drift/snap) — no surveyed commercial system exposes this; Tiny Town already built the
  pattern for `decideAndAct()`

**Defer (v2+, explicitly out of scope for this milestone):**
- The "echo makes it stickier" reinforcement layer as its own probabilistic mechanism,
  separate from the core pressure accumulator (Darkest Dungeon's independent per-mission
  quirk-lock roll is the model to crib from later) — land and hand-verify the core
  accumulator and snap first
- Any authored trait/quirk taxonomy or player-facing pressure gauge — both are
  disproportionate authoring cost and would shift the game's core tension away from
  belief divergence, which is the stated Core Value

### Architecture Approach

Tiny Town has no game loop — `world.tick` only advances inside `performAction()` — which
is the single fact that makes generic tick-loop-shaped "NPC decay architecture" advice
inapplicable. The codebase already solved "decay without a loop" twice
(`memoryStrength`, `activeEmotionIntensity`), both lazy read-time functions of
`(storedValue, formedTick, currentTick)` with no sweep pass. Every new piece in Phase 2
extends this same idiom or the existing event-driven-mutation idiom (`relationships`) —
no new files, no new layer, no DOM boundary changes.

**Major components:**
1. Lazy decay accessors (`beliefConfidence`, `needValue`) — computed live at every read,
   alongside `memoryStrength`, in `sim.js`
2. Pressure accumulator — new per-agent, per-trait/value/worldview-entry decayed running
   counter, written at event-perception time inside `perceiveEvent`, read only by
   drift/snap-check logic, never by `decideAndAct`'s scoring (one-way information flow)
3. Deferred trait/value/worldview writer (`commitDrift`) — applies queued mutations only
   after the reaction cascade triggered by the current event fully resolves (at
   `reactionDepth === 0`), preventing an NPC's own reaction from being scored against a
   trait value the same event just changed
4. Witness scheduler — replaces the `forEach` witness dispatch with score-all-then-fire-
   highest-urgency-first; every later Phase 2 mechanism is downstream of this ordering
5. Trigger-reactivation — reads the same lazy decay accessors to find still-salient old
   memories/beliefs and push a transient emotion re-spike, wired into `appraiseEvent` or a
   new `checkReactivation()` step

### Critical Pitfalls

1. **Drift silently invalidates the project's only regression check** (two clones,
   opposite `CompetitiveJungle` weight) — add a `driftEnabled=false` toggle that
   reproduces the original case exactly, plus a drift-enabled tick-0 variant, before
   landing any drift formula.
2. **Cascade-compounding drift** — a single originating event can recurse up to
   `MAX_REACTION_DEPTH` (4), and if drift mutates live inside `perceiveEvent`/
   `decideAndAct`, self-reinforcing intermediate emotion state can produce a full snap
   from one surface event with no individually-intense moment behind it. Accumulate
   pressure during the cascade, commit once at unwind.
3. **Naive belief pruning deletes protective "known false" records** — a confidence-0
   contradicted belief is the most important thing to keep, not the least; prune by
   staleness, exempt "known false" explicitly.
4. **Needs-gate oscillation at the `safety < 0.7` retreat threshold** — passive
   regeneration crossing a hard cutoff repeatedly produces flickery, causeless-looking
   retreat behavior; apply a hysteresis band, don't retrofit one later.
5. **Landing witness-reordering and drift/snap in the same phase makes both
   unverifiable** — the only HIGH-cost item in the pitfalls recovery table. Capture a
   scripted-scenario baseline, land ordering alone, diff, then land drift/snap on top.

## Implications for Roadmap

Based on combined research, suggested phase structure (spine from ARCHITECTURE's build
order, hardened by PITFALLS' verification-sequencing constraints):

### Phase 0: Verification Infrastructure
**Rationale:** Every later phase depends on being able to hand-trace and reproduce a
specific interaction — the project has no automated test suite by design, so this
infrastructure is its test suite. Landing it after drift/snap exists means retrofitting
under pressure; landing it first is cheap (small, self-contained additions).
**Delivers:** A seeded `rng()` call site (single swappable generator, replacing three
unseeded `Math.random()` call sites); a `world.driftEnabled` toggle that reproduces the
original two-clone regression case byte-for-bit; a drift-enabled tick-0 variant of the
same case; a `Sim.DRIFT` named constants block for every new tuning number this milestone
introduces.
**Addresses:** No FEATURES item directly — this is scope PITFALLS and STACK both
independently flag as a prerequisite, not a user-facing feature.
**Avoids:** Pitfall 1 (drift destroys the regression check), Pitfall 10 (unseeded RNG
compounds under drift).

### Phase 1: Witness Reaction Ordering
**Rationale:** Changes the shape of dispatch itself and everything downstream (who
perceives what, in what order) depends on it. Both ARCHITECTURE and PITFALLS agree it
must land first — PITFALLS additionally insists it land alone, diffed against a
pre-change baseline, not bundled with any drift work.
**Delivers:** Score-all-witnesses-then-fire-highest-urgency-first, replacing the
`forEach` dispatch at the existing witness loop; a pure `scoreCandidates()` extracted
from `decideAndAct` (needed as a call site by later phases regardless); a captured
scripted-scenario baseline (event.why / relationship / need / emotion state) for
before/after comparison.
**Addresses:** FEATURES table-stakes item "reaction ordering by significance, not
iteration order."
**Avoids:** Pitfall 8 (ordering + drift landed together, regression unattributable — the
only HIGH-recovery-cost pitfall).

### Phase 2: Belief Decay/Pruning + Needs Regeneration
**Rationale:** Independent of each other in effect but share the identical lazy-accessor
idiom (Pattern 1: `beliefConfidence` mirrors `memoryStrength`, `needValue` mirrors the
same shape aimed at a baseline instead of zero) — cheaper to design once, together.
Needs regeneration also fixes a documented permanent-retreat-bias bug.
**Delivers:** `beliefConfidence(belief, tick)` decay mirroring the existing memory-decay
formula, with an explicit "known false" pruning exemption; `needValue(agent, needKey,
tick)` recovering toward baseline, triggered via `Give` to sustenance and `Give`/`Tell` to
belonging (belonging's first-ever trigger); a hysteresis band around the `safety < 0.7`
retreat gate.
**Addresses:** FEATURES table-stakes items "bounded, decaying belief state" and
"symmetric, event-driven need restoration."
**Avoids:** Pitfall 5 (naive pruning deletes protective records), Pitfall 7 (needs-gate
oscillation).

### Phase 3: Tell/Move-Aware Memory Importance
**Rationale:** Currently every conversation memory forms at the 0.1 importance floor and
decays in roughly 6-7 ticks — nothing an NPC is told can ever be intense enough to matter.
Independent of Phases 1-2 in mechanism, but is a hard prerequisite for trigger
reactivation (Phase 6) and for snap ever firing from a claimed/told event rather than
only a witnessed one.
**Delivers:** An `appraiseEvent` branch for `Tell`/`Move` producing real `impact` values;
an extended persistence curve (or floor-immunity) for high-importance memories, since the
existing `halflife = 3 + importance*35` formula caps even a maximum-importance memory
around ~38 ticks before crossing the 0.03 prune floor around delta-tick ~190 — mathematically
incapable of satisfying "persists far longer" at any importance value without a change.
**Addresses:** Load-bearing prerequisite for the FEATURES differentiator "positive and
negative trigger reactivation."
**Avoids:** Pitfall 4 (snap can never fire from being told something, only from
witnessing it).

### Phase 4: Slow Trait Drift
**Rationale:** Depends on Phase 1 (drift reads events in urgency order) and benefits from
Phase 0's toggle/RNG work being in place before scoring-adjacent changes compound. This
is the "new idiom, higher risk" work — the first time any of the three previously-static
sticky boxes becomes mutable.
**Delivers:** The `pressure` accumulator (EWMA, decayed, per trait/value/worldview
entry) written inside `perceiveEvent`; the `weight` field that can diverge from a
permanent `anchor` and relax back (this divergence is the "activated, not yet changed"
state); a deferred `commitDrift()` that applies queued writes only once the reaction
cascade this event triggered has fully resolved; implicated-key selection reusing the
existing `event.why` per-term decomposition, so one event can plausibly nudge several
related traits at once without a second event-to-trait mapping table.
**Uses:** Anchor+weight split, leaky-integrator pressure accumulator, Sherif's latitude-
of-rejection gate (STACK.md); accumulate-then-commit, one-way information flow
(ARCHITECTURE.md Patterns 2-4).
**Implements:** Pressure accumulator plus deferred trait/value/worldview writer components.

### Phase 5: Snap Events
**Rationale:** Same accumulator, write path, and deferred-commit machinery as Phase 4 —
materially cheaper once Phase 4 exists. A variant of drift's mechanism, not a separate
one; do not build in parallel with Phase 4.
**Delivers:** A second, higher, context-modulated intensity threshold checked at the
same site as the pressure accumulator — on trip, immediately rewrites both `weight` and
`anchor`, bypassing the slow-drift path, with threshold height itself a weighted sum of
context terms (current emotion intensity, relevant worldview weight, boldness/
neuroticism) computed the same way `decideAndAct()` scores candidates.
**Addresses:** FEATURES differentiator "dual-path change (slow drift and single-event
snap)."
**Avoids:** Pitfall 3 (cascade-compounding drift/snap), by inheriting Phase 4's
accumulate-then-commit discipline.

### Phase 6: Trigger Reactivation
**Rationale:** Depends on Phase 3 (memories worth reactivating must exist) and Phases
4-5 (a notion of "was this intense enough to matter" must exist before reactivating old
intensity is meaningfully different from ordinary memory recall). Build last.
**Delivers:** A `checkReactivation()` step reading `memoryStrength`/`beliefConfidence` for
still-salient old high-importance entries, matched against the current event by
`predicate` plus `subject`/actor, pushing a transient emotion re-spike sourced from the
original event's appraised valence (covering both anxiety-style and courage/resolve-
style reactivation from one code path, not a separate negative-only path); an explicit,
documented decision on whether reactivation refreshes `formedTick` (recommend: no — track
reactivation count separately) and whether it's logged to `world.events` or silent.
**Addresses:** FEATURES differentiator "positive-valence trigger reactivation."
**Avoids:** Pitfall 6 (reactivation immortality loop / undecided event-log question).

**Explicitly deferred past this milestone** (per FEATURES' Explicitly Defer list): the
"echo makes it stickier" layer as its own probabilistic reinforcement mechanism separate
from the core accumulator; any authored trait/quirk taxonomy; a player-facing pressure
gauge.

### Phase Ordering Rationale

- **Verification infrastructure and witness ordering come first and separately** because
  every later phase's correctness is judged by hand (no test suite), and both
  ARCHITECTURE and PITFALLS independently converge on "ordering changes what everything
  downstream perceives" as the highest-leverage, lowest-complexity item to isolate first.
- **Belief decay/needs regen are grouped** because they share one formula idiom
  (lazy read-time decay/regen toward a target) and are otherwise independent — cheaper
  to design in one pass than two.
- **Tell/Move importance is sequenced before drift/snap/reactivation**, not in parallel
  with them, because PITFALLS-4 shows snap is mechanically incapable of firing from a
  told event without it, and ARCHITECTURE shows reactivation has nothing to reactivate
  without it.
- **Drift precedes snap** because snap reuses drift's accumulator/commit machinery
  directly — building them in the reverse order or in parallel means building the
  machinery twice, once without commit-deferral discipline in place.
- **Reactivation is last** because it's the only mechanism that depends on both an
  intensity-classification system (drift/snap) and durable memories worth reactivating
  (Tell/Move fix) existing first.

### Research Flags

Needs deeper research during planning (STACK's own "new idiom, higher risk" split):
- **Phase 4 (Slow Trait Drift):** New mutation idiom, no precedent anywhere else in
  `sim.js`; the anchor/weight/pressure three-field model is this research's own
  synthesis, not independently confirmed by any single source — worth a `--research-phase`
  pass to pressure-test the reconciliation before implementation.
- **Phase 5 (Snap Events):** Threshold-height formula (context-modulated, not flat) has
  HIGH confidence on shape but the exact term weights are explicitly a tuning question,
  not resolved by research.
- **Phase 6 (Trigger Reactivation):** The "what reminds an NPC" matching rule is
  genuinely unresolved — FEATURES found no citable precedent in any surveyed system for
  the matching criterion itself (same predicate? same actor? something else?).

Standard patterns, established in-file (skip research-phase):
- **Phase 0 (Verification Infrastructure):** Directly derived from PROJECT.md's own
  stated risks; mechanical, no open design question.
- **Phase 1 (Witness Reordering):** Well-scoped existing gap with a clear fix shape
  (score-then-fire-highest-first), already documented in CONCERNS.md.
- **Phase 2 (Belief Decay + Needs Regen):** "Existing idiom, lower risk" per STACK —
  both are computed-live-at-read or event-driven-stored, patterns already proven
  elsewhere in `sim.js`.
- **Phase 3 (Tell/Move Importance):** Small, well-defined `appraiseEvent` branch
  addition; the gap and fix shape are both already documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM-HIGH | Individual techniques verified via live search (Sherif, ACT-R, flashbulb memory, spreading activation, cumulative-continuity meta-analysis); the "Phelps-Roper framework" citation was found to be a bug (HIGH confidence in the absence finding itself); a few citations (Baumeister and Leary, emotional tagging hypothesis) rely on training-data recall after live-search tool errors |
| Features | MEDIUM | All five comparable-system sources are wikis, Steam guides, or dev blogs, not primary design documents or source code; the strongest single piece of evidence (three systems converging on accumulator-not-rolling-window) is still MEDIUM per-source, but the convergence itself raises confidence in that specific conclusion |
| Architecture | MEDIUM overall, HIGH for codebase-derived | Everything reasoned directly from `sim.js`, `PERSON-MODEL.md`, and `CONCERNS.md` is HIGH confidence (primary source); the one external precedent (Dwarf Fortress's stress system) is MEDIUM, directly fetched not just search-summarized; general "game AI personality drift architecture" search results were mostly inapplicable (patent filings, LLM persona-drift — a different phenomenon — correctly excluded) |
| Pitfalls | HIGH on mechanism, MEDIUM on prediction | Every pitfall cites exact `sim.js`/`PERSON-MODEL.md`/`CONCERNS.md` behavior (line-numbered in several cases) for what breaks; confidence is lower on how visibly it breaks in practice, since nothing has been playtested yet |

**Overall confidence:** MEDIUM-HIGH — high where research reads the existing codebase
directly (which is most of the load-bearing conclusions), medium where it reaches for
external game/psychology precedent to fill genuinely open design questions.

### Gaps to Address

- **The anchor/weight/pressure three-field data model is this synthesis's own
  reconciliation, not stated as a unit by any single research file.** Confirm it
  explicitly in the Phase 4 design pass before implementation — specifically, verify that
  `weight` diverging from `anchor` (with a relaxation-toward-`anchor` term) actually
  satisfies Pitfall 9's "activated, not changed" requirement in practice, not just on
  paper.
- **What "reminds" an NPC of an old intense event** (same predicate? same actor? other
  criterion?) has no citable precedent from any surveyed system. This is a design
  decision for the Phase 6 discussion, not something more research will resolve.
- **Whether one event can nudge multiple related traits/values/beliefs at once** leans
  yes, but the supporting evidence is asymmetric: the internal mechanism (reuse
  `event.why`'s existing per-term decomposition as the implicated-key set) is verified
  and already exists in the codebase; the external evidence for the behavior being
  correct (from CK3/DF) is explicitly rated LOW confidence by FEATURES research. Treat
  the mechanism as settled, the behavioral tuning as needing hand-verification.
- **Doc-sync action item, not a research gap but a hard requirement:** whichever final
  shape the drift/snap data model takes, `PERSON-MODEL.md`'s box list and `CLAUDE.md`'s
  mind-box mutability table must both update in the same change — a new `pressure`
  field/box that isn't reflected in both is exactly the kind of doc/code drift
  `CLAUDE.md` already treats as a bug.
- **PROJECT.md's Key Decisions table currently cites "the Phelps-Roper framework"** as
  rationale for the snap decision — this should be corrected to cite the real per-claim
  sources (Roberts/Walton/Viechtbauer, Sherif, Prochaska and DiClemente as structural
  parallel) in the same change that updates `PERSON-MODEL.md`, not left as-is.

## Sources

### Primary (HIGH confidence — in-repo ground truth)
- `sim.js`, `PERSON-MODEL.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, `.planning/PROJECT.md` — existing pipeline, decay precedent, documented open questions and known gaps

### Secondary (MEDIUM-HIGH confidence — verified via live search this session)
- Sherif and Sherif, Social Judgment Theory (latitude of acceptance/rejection, ego-involvement)
- Deffuant-Weisbuch / Hegselmann-Krause bounded-confidence opinion-dynamics models
- ACT-R base-level activation / power law of forgetting (Anderson and Schooler lineage)
- Brown and Kulik (1977), flashbulb memory
- Collins and Loftus (1975), spreading activation
- Roberts, Walton and Viechtbauer (2006) meta-analysis; Bleidorn et al., life-events-and-personality-change
- Dwarf Fortress Wiki, Stress and Personality facet pages (one fetched directly)
- Confirmed absence of a citable "Phelps-Roper framework" (two direct searches, one structural search)
- Prom Week / Comme il Faut, FDG 2011 paper (author-hosted PDF, primary academic source)

### Tertiary (MEDIUM confidence — community wikis/guides, or training-data recall not independently re-verified this session)
- RimWorld, Dwarf Fortress, Crusader Kings 3, Darkest Dungeon, The Sims — wiki pages, Steam guides, dev-blog coverage of thought/mood/stress/motive/quirk systems
- Baumeister and Leary (1995), "The Need to Belong" — canonical paper, live-search attempts returned tool errors; content treated as safe, exact phrasing unverified
- Richter-Levin and Akirav, emotional tagging hypothesis — directional support only, not deeply verified
- SM-2/SuperMemo/Anki spaced-repetition reinforcement shape — well-documented publicly, not re-verified against primary source
- Hysteresis/deadband control-systems pattern (general electronics source, not games-specific)
- Golden Master / Characterization Testing overview (general legacy-code technique, underlying concept for scripted-scenario baselines only)

---
*Research completed: 2026-08-12*
*Ready for roadmap: yes*
