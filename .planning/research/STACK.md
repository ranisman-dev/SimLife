# Stack Research

**Domain:** Personality/trait-drift and memory-salience modeling for a hand-rolled, dependency-free agent-based NPC simulation (Tiny Town, Phase 2 person model)
**Researched:** 2026-08-12
**Confidence:** MEDIUM-HIGH overall (individual rows carry their own confidence — see each table)

> This is a *domain-technique* stack, not a software stack. Tiny Town has no
> package.json and this milestone adds none — the "Core Technologies" below are
> algorithmic patterns and named psychological/game-AI frameworks to implement as
> plain functions over plain JS objects, not npm packages. The template's
> Installation/Version Compatibility sections are repurposed accordingly: they map
> techniques onto `sim.js` functions and formula-consistency rules instead of
> package installs.

## Zero-th finding: "Phelps-Roper framework" does not resolve to a citable academic framework — verify before building on the name

`PERSON-MODEL.md` and `PROJECT.md` both name "the Phelps-Roper framework" as the
intended basis for Phase 2, attributing it four specific mechanical claims:
(1) intentional vs. unintentional change, (2) sustained pressure vs. one intense
event, (3) a "regression trap" where unintentional shifts revert once pressure
lifts, (4) neuroticism modulating settle time.

Searched directly (`"Phelps-Roper" attitude change`, `Megan Phelps-Roper
deradicalization framework psychology`) — both queries return only Megan
Phelps-Roper's own TED talk, memoir, and press coverage of her personal exit from
Westboro Baptist Church. There is no published Phelps-Roper *model* — she's a case
study cited by others (Cialdini-adjacent persuasion writing, deradicalization
commentary) for "sustained good-faith dialogue changes minds gradually," not the
author of a four-part mechanical framework. **This is a citation bug, not a design
bug** — the four claims themselves are sound and each has a real, independently
citable grounding (below). Treat "Phelps-Roper" going forward as informal shorthand
for the phenomenon (the TED-talk case study of gradual, dialogue-driven attitude
change), not as a source to cite for the mechanics. Recommend `PERSON-MODEL.md`
retire the name and cite the frameworks in the table below per-claim instead.
**Confidence: HIGH that no such named framework exists** (two direct searches,
plus a structural search for "unintentional attitude change relapse individual
differences" turned up nothing matching the four-part structure).

## Recommended Stack

### Core Techniques

| Technique / Framework | Origin | Purpose | Why Recommended | Confidence |
|---|---|---|---|---|
| Anchor + weight split, drift moves `weight` only | Standard state-machine pattern for "elastic vs. permanent" change (not itself a psych citation — this is the implementation shape that makes claims 2 and 3 below actually work together) | Makes "temporarily activated" (drift) and "permanently changed" (snap) mechanically distinct, not just differently-labeled | Without this split, a relaxation-toward-baseline term (needed for the regression trap) would also erode a snap, which directly breaks the "not just Change to Person" requirement. One extra field (`anchor` alongside the existing `weight`) implements both requirement 2 and requirement 3 in PROJECT.md's Active list with no new box | HIGH — this is the load-bearing design decision the rest of the table hangs off |
| Leaky integrator / exponentially-weighted moving average (EWMA) for "sustained pressure" | Control theory / signal processing; the same math underlies "allostatic load" (cumulative stress) framings in health psychology | Tracks "sustained pressure" as a single persistent scalar per trait/value/worldview entry: `pressure = pressure * decayFactor + eventPush`, no history array | Directly answers PROJECT.md's open question "counter vs. rolling window" — an EWMA *is* an exponentially-weighted rolling window collapsed into one number. Zero new storage shape, reuses the "no unbounded array" discipline the milestone is otherwise trying to restore (see Beliefs gap) | HIGH (standard, well-documented technique; not psychology-specific but exactly fits the stated constraint) |
| Deffuant–Weisbuch / Hegselmann–Krause bounded-confidence updating, adapted to one event vs. one anchor rather than agent-pair consensus | Opinion dynamics (computational social science) | Formula shape for gradual drift: `weight += μ · pressure · (eventValence − weight)`, self-limiting as `weight` approaches the event's valence, capped at ±1 | This is the standard agent-based-modeling answer to "how do numeric opinions move gradually under repeated exposure" — verified via live search, not training-data recall. The `(target − weight)` form is *self-limiting* near the extremes, which matters here: bounded-confidence models are documented to ratchet opinions to the poles and freeze given enough repetition, and Tiny Town only has 5 NPCs — letting drift run unchecked would read as everyone becoming a caricature within a session, not slow personality change | MEDIUM-HIGH (BCMs are well-established in opinion-dynamics literature; the adaptation to single-agent trait drift rather than multi-agent consensus is this project's own synthesis, not a direct lift) |
| Sherif's Social Judgment Theory — latitude of acceptance / rejection / noncommitment, ego-involvement widening the rejection zone | Social psychology (Sherif & Sherif, 1960s) | Gate on *whether* an event nudges a trait/value at all: an event whose valence falls within the trait's current "latitude of acceptance" assimilates (counts toward pressure); one that falls in the "latitude of rejection" either bounces off (if pressure is low) or, if intense/repeated enough, becomes contrast fuel that can flip the sign of the eventual drift | Gives a principled reason (not a magic threshold) for the two-track drift/snap requirement, and specifically for why *extreme* existing values (e.g. `CompetitiveJungle: 0.9`) should be harder to move — this is "ego-involvement," Sherif's own term for exactly that resistance. It's also the natural place to hang "snap bypasses the slow path": a single event intense enough to land outside the latitude of rejection outright (not just contrast against it) is Sherif's own boundary case | MEDIUM-HIGH (verified via live search; the specific wiring into a numeric two-track drift/snap system is this project's synthesis) |
| Threshold-triggered snap that rewrites `anchor` (not just `weight`) | Synthesis of the anchor/weight split above, informed by flashbulb-memory logic (below) | A single event whose intensity exceeds a per-NPC snap threshold (itself modulated by neuroticism/boldness, per PROJECT.md's stated intent) sets both `weight` and `anchor` to the post-event value immediately, bypassing the pressure accumulator entirely | Matches PROJECT.md's requirement verbatim ("a single sufficiently intense event can snap ... immediately, bypassing the slow-drift path") and "snap speed is modulated by surrounding circumstances, not a flat rate" — the threshold itself should be a small weighted sum in the same style as `decideAndAct()`'s scoring terms (current emotion intensity, relevant worldview weight, boldness/neuroticism), not a flat constant | HIGH for the shape (directly matches stated requirements); the exact term weights are a tuning question for phase design, not research |
| Personality mean-level change / cumulative continuity principle (Roberts, Walton & Viechtbauer 2006 meta-analysis; Bleidorn et al. life-events-and-personality-change literature) | Personality psychology, large-sample longitudinal meta-analyses | Empirical backing that Big Five traits *do* drift slowly across a lifespan via cumulative "environmental press," and that major life events produce small-to-moderate directional shifts — not the Big Five "plaster hypothesis" (fixed after age 30) the field assumed pre-2000s | This is the actual, citable academic grounding for "personality can be sticky, not static" that the milestone is named after — stronger and more specific than the Phelps-Roper case study it currently cites. Directly supports treating Personality with the *same* anchor/weight/pressure machinery as Values and Worldview, rather than treating Personality as immutable and only Values/Worldview as driftable | MEDIUM (verified via live search; this is meta-analytic consensus, not a single formula to lift) |
| Homeostatic drive theory (Hull, 1943) as implemented in Dörner's Psi theory (5 basic needs incl. affiliation, certainty, competence) and The Sims' "motive" system | Classic drive psychology + two well-documented game-AI precedents | Needs regenerate toward a setpoint absent negative triggers: `need += regenRate * (baseline − need)`, same exponential-approach-to-target shape as the leaky integrator above, just with `baseline` fixed instead of moving | Reuses the *same math primitive* (exponential approach to a target value) as the pressure accumulator, which keeps PERSON-MODEL.md a one-formula-family document instead of accumulating a second decay math family for needs. Dörner's Psi theory's "affiliation" need is the closest existing precedent for wiring up `belonging`, which currently has zero triggers — Psi's affiliation need is driven by positive/negative social signal density over time, i.e. exactly what `Give`/friendly `Tell` vs. isolation should drive | HIGH for Sims motives and Hull drive theory (well-documented, verified); MEDIUM for Dörner Psi theory specifics (verified via search but with less depth) |
| Baumeister & Leary's "need to belong" (1995, *Psychological Bulletin*) | Foundational social-psychology paper establishing belonging as a basic, not derived, human motivation | Names positive social contact (being given something, being told something by a trusted party, being defended/vindicated) as the input class that should raise `belonging`, and exclusion/betrayal/being lied to as the class that should lower it | Directly answers "what's the first trigger for `belonging`" — one of PROJECT.md's named gaps — by pointing at a specific, well-established input class rather than inventing one. This is the most load-bearing "table stakes" citation for the needs-regeneration gap specifically | MEDIUM (this is a canonical, extremely well-cited 1995 paper — training-data confidence is high, but live search on it returned tool errors twice, so it is not independently re-verified in this session; treat the *existence and content* of the paper as safe, the exact phrasing/details as unverified) |
| ACT-R base-level activation / power law of forgetting (Anderson & Schooler 1991 lineage) | Cognitive architecture (Carnegie Mellon), the reference model for hand-rolled declarative-memory decay in agent systems | Confirms the *general shape* of what `sim.js` already does (`memoryStrength = importance × 0.5^(Δt/halflife)`) is the standard simplification of real memory-decay research, and gives a name to cite instead of "we made this up" | The literature's real curve is a power law (`t^-d`), not an exponential — but exponential decay with an importance-scaled half-life is the well-documented simplification spaced-repetition systems (SM-2/Anki, below) also use for tractability. **Recommendation: do not switch to a true power-law fit** — it adds a decay-exponent parameter to tune with no behavioral payoff visible in a 5-NPC sim, and it would make Beliefs (the box this milestone is fixing) inconsistent with Memories' existing exponential form. Keep exponential, cite ACT-R as the reason the *shape* (frequency+recency-sensitive, importance-scaled) is principled | HIGH (verified via live search; ACT-R's formula and its relationship to the power law of forgetting are directly confirmed) |
| SM-2 / spaced-repetition-style reinforcement (SuperMemo/Anki lineage) | Applied cognitive-science algorithm, widely documented and implemented | For "repeated events that echo an intense event make its charge stickier" (PROJECT.md requirement): on each reinforcing event, increase the memory/belief's effective `importance` with diminishing returns (`importance += reinforcementGain * (1 − importance)`) rather than resetting its clock to full strength — since `halflife` is already `3 + importance × 35` in the existing formula, boosting `importance` on reinforcement is a one-line change that extends halflife automatically, no second formula needed | Answers "stickier without necessarily being a full Change to Person" directly: reinforcement feeds the *belief/memory's* importance (and, via the shared event, the trait's pressure accumulator) rather than mutating `weight`/`anchor` directly — the distinction PROJECT.md explicitly wants preserved | MEDIUM-HIGH (SM-2's diminishing-returns reinforcement shape is well-documented; the specific reuse of the existing `importance`→`halflife` formula is this project's own synthesis) |
| Spreading activation (Collins & Loftus, 1975) + emotional tagging hypothesis (Richter-Levin & Akirav) | Cognitive science (semantic memory retrieval) + affective neuroscience (memory consolidation) | Mechanism for "trigger reactivation": when a new event's cue (same `predicate` + `subject`/actor — reuse the fields the belief/memory shape already has, don't invent a new schema) matches an old high-importance memory/belief, treat the match as (a) an extra push into that trait's pressure accumulator, and (b) a fresh `emotions` entry sourced from the old memory, scaled by the old memory's *current* decayed strength × its stored importance | Both are real, separately citable literatures (verified live), and both point at the same practical mechanism: cue-matching against existing memory content, not a new "trigger" data structure. This is also where "positive equivalents (courage/resolve), not just negative (hypervigilance)" falls out naturally — the *emotion type* pushed on reactivation should be read from the original event's valence/appraisal, exactly the way `applyAppraisal()` already picks Anger vs. Gratitude vs. Fear, not a separate negative-only "trauma" code path | MEDIUM-HIGH for spreading activation (verified, foundational, widely used in agent-memory design incl. recent LLM-agent memory papers); LOW-MEDIUM for emotional tagging hypothesis specifically (found via search but not deeply verified — treat as directional support, not a formula to implement) |
| Flashbulb memory (Brown & Kulik, 1977) — qualitative exemption, not just longer halflife | Cognitive psychology, foundational and highly replicated (with caveats on accuracy, not persistence) | Above an importance threshold (e.g. `importance > 0.7`), a memory/belief should be flagged as a "landmark" and **exempted from `addMemory()`'s self-pruning floor (0.03)**, not merely given a longer halflife | This is a concrete correctness check, not just a nice-to-have: at `importance = 1.0`, `halflife = 38`, and strength decays under the 0.03 prune floor around Δt ≈ 190 ticks. If Tiny Town sessions run anywhere near that long, **the single most important possible memory is exactly the one that gets pruned before Phase 2's "persists far longer, can re-trigger long after" requirement can ever apply to it** — the current formula alone cannot satisfy that requirement at any importance value, because everything eventually crosses the floor. An explicit importance-gated exemption is the fix, and it matches Brown & Kulik's actual claim: flashbulb memories aren't just *slower to fade*, people report them as qualitatively different/exempt from ordinary forgetting, accuracy caveats aside | HIGH for the arithmetic gap (directly checkable against formulas already in PERSON-MODEL.md — this is not a literature claim, it's a bug the literature happens to also predict) |
| Named, single-owner constants block (e.g. `Sim.DRIFT`) for all new drift/snap/regen tuning numbers | Software-engineering hygiene, not a psych citation | Collect every new magic number (drift rate `μ`, snap threshold, pressure decay factor, need regen rate, reinforcement gain, landmark importance threshold) in one object instead of inline literals scattered across functions | PROJECT.md's own Context section already flags `decideAndAct()`'s inline magic numbers as a fragility this phase inherits, with no test suite to catch regressions. Every new formula in this document adds at least one new tunable constant — doing that inline repeats the exact problem the project already named as a risk | HIGH (directly derived from PROJECT.md's own stated risk, not external research) |
| Deterministic drift/snap path (no `Math.random()`) | Software-engineering hygiene, not a psych citation | All new formulas above are pure functions of `(mind, event, tick)` — no randomness introduced anywhere in the drift/snap/regen/reactivation path | PROJECT.md separately flags the codebase's unseeded RNG (`Attack` damage, gossip truth-telling, scapegoat selection) as something that will make a specific traced interaction hard to reproduce. Phase 2 doesn't need to fix that pre-existing problem, but it should not add a second, harder-to-debug source of nondeterminism to a feature that's explicitly meant to be traced/verified by hand (no test suite exists yet) | HIGH (directly derived from PROJECT.md's own stated risk) |

### Supporting Techniques (situational — not every trait needs every mechanism)

| Technique | Purpose | When to Use |
|---|---|---|
| Per-event term decomposition reused as drift input | Deciding whether one event nudges one trait or several at once | `decideAndAct()` and `applyAppraisal()` already compute named per-term contributions (the `event.why` / `mind.log[].why` breakdown, e.g. `{ boldness: 0.24, CompetitiveJungle: 0.08 }`). Reuse that existing decomposition as the set of trait/value/worldview keys an event pushes pressure into, rather than building a second event→trait mapping table. Directly resolves PROJECT.md's other open design question ("does one event nudge several things at once") using machinery that already exists and is already verified (the two-clones test case) |
| Latitude-of-rejection gate before pressure accrues | Preventing every witnessed event from silently nudging every trait a little | Only accrue pressure (or count toward a snap threshold) for events whose appraised valence actually falls outside the trait's current latitude of acceptance — an agreeable NPC seeing a mildly unkind act shouldn't drift on it at all; Sherif's model is explicit that in-latitude messages don't move anything |
| Exemption flag on landmark memories/beliefs (`importance > threshold`) | Only for memories/beliefs at or above the flashbulb threshold | Everything else keeps the existing 0.03 prune floor unchanged — this is a narrow, targeted fix, not a change to the general decay formula |

## Attachment Points in `sim.js` (repurposed "Installation")

No packages to install. Each technique above attaches to an existing function or a
new one following the same idiom:

| Technique | Attaches to | Idiom to follow |
|---|---|---|
| Pressure accumulator (EWMA) | New field on `mind.personality`/`mind.values`/`mind.worldview` entries, updated inside `applyAppraisal()`/`perceiveEvent()` | **Stored, event-driven mutation** — same idiom as `relationships` (`trust`/`affection`/`fear`/`grievance`), not computed-live |
| `anchor`/`weight` split, snap rewrite | Same entries as above | Stored, event-driven mutation |
| Belief confidence decay | New accessor, e.g. `beliefConfidenceAt(belief, tick)` | **Computed live from a stored `formedTick`**, same idiom as `memoryStrength(mem, tick)` and `activeEmotionIntensity()` — do not store a decayed value and mutate it in place |
| Needs regeneration | New accessor or a tick-aware read path off `mind.needs`, with a stored `lastChangedTick` per need | Computed live, same idiom as memory/emotion decay — there is no tick-driven update loop anywhere in `sim.js` today, and this milestone shouldn't introduce one just for needs |
| Reinforcement (SM-2-style) | `addMemory()` / belief-formation path, adjusting `importance` on repeat | Stored, event-driven mutation (importance is already stored at formation, per existing code) |
| Trigger reactivation cue-matching | `perceiveEvent()`, scanning `mind.memories`/`mind.beliefs` for matching `predicate`/`subject` | Read existing arrays, push a new `emotions` entry — same idiom as `applyAppraisal()` already uses |
| Landmark exemption | `addMemory()`'s self-pruning check | One conditional added to existing pruning logic |
| `Sim.DRIFT` constants block | Top of `sim.js`, alongside `Sim.VALUES`/`Sim.WORLDVIEW_BELIEFS` | Same "shared bank" pattern already used for those two |

**Split to hand the roadmap directly:** everything in the *first* group below is a
genuinely new mutation idiom (`sim.js` has never had stored-mutable
personality/values/worldview before, per PROJECT.md's own note); everything in the
*second* group is a pattern the codebase already has and just needs applied to two
more boxes.

- **New idiom, higher risk:** trait/value/worldview drift and snap (stored mutation
  of previously-static boxes)
- **Existing idiom, lower risk:** belief decay, needs regeneration, reinforcement,
  trigger reactivation (all computed-live-at-read or event-driven-stored, both
  patterns already proven elsewhere in the file)

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|---|---|---|
| Exponential half-life decay (existing formula, extended to Beliefs/Needs) | True power-law forgetting curve (ACT-R's `t^-d`, fitted decay exponent) | Never, for this project — adds a tuning parameter with no visible behavioral payoff at 5-NPC scale, and would make Beliefs inconsistent with the Memories formula this milestone should be made consistent *with* |
| EWMA/leaky integrator for sustained pressure | Explicit rolling window (stored array of last N event pushes, re-summed each tick) | If the design later needs to *inspect* individual contributing events (e.g. for a debug/mind-inspector view listing "what's been building this pressure"), not just the aggregate number — trades the array-growth problem back in, so only worth it if the mind inspector UI specifically needs it |
| Anchor + weight split | Single mutable `weight` with no anchor, treating all change as permanent | Never, for this milestone — breaks the explicit "temporarily activated vs. permanently changed" requirement; would need to be walked back immediately |
| Bounded-confidence-style drift formula, single-agent adaptation | Full Deffuant–Weisbuch pairwise agent-to-agent opinion exchange | If NPCs' *worldview entries themselves* start directly influencing each other's worldview entries through conversation (Tell) as a first-class mechanic, not just events shifting an individual's own trait — that's a bigger, separate feature (arguably its own future milestone, adjacent to the deferred ecology/economy work), not this one |
| Cue-matching on `predicate` + `subject` for trigger reactivation | Full spreading-activation network with weighted associative links between arbitrary concepts | Only worth building if the domain grows enough distinct entity/concept types that direct field-matching stops finding real analogues — with 5 NPCs and 5 verbs, direct matching is sufficient and the network version is unbuilt/unneeded complexity |

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| Per-trait rolling-history array (storing every event's push and re-summing) | Reintroduces the exact "array only grows, never pruned" bug this milestone is fixing for Beliefs — same failure mode, new box | EWMA/leaky integrator (single scalar, decays itself) |
| A second decay-math family (e.g. power-law forgetting, or a differently-shaped sigmoid for needs) | PERSON-MODEL.md is already fighting to stay one coherent reference across nine boxes; a second exponent-based formula family for Beliefs/Needs while Memories/Emotions keep the existing `0.5^(Δt/halflife)` form creates exactly the "drift between doc and code" CLAUDE.md calls a bug | Reuse `0.5^(Δt/halflife)` (decay) and its mirror `1 − 0.5^(Δt/halflife)` (regeneration toward a setpoint) everywhere |
| Bayesian belief-network updating for claimed beliefs (formal probabilistic graphical models) | `decideAndAct()` and belief confidence are both weighted-linear-term systems by design (`event.why` breakdown), not a probabilistic inference engine — introducing real Bayesian updating for drift/decay would be a different architecture living inside the same file, with no precedent anywhere else in `sim.js` | Keep confidence/pressure/drift as weighted sums and exponential-decay reads, consistent with every existing formula in PERSON-MODEL.md |
| Full clinical PTSD/trauma-response modeling (hypervigilance thresholds, avoidance/extinction/reconsolidation therapy mechanics) | Massive over-scope for a numeric toy sim, clinically loaded terminology for what is mechanically just "a strongly-weighted memory occasionally re-firing an emotion," and PROJECT.md explicitly wants the *same* mechanism to produce positive-valence outcomes (courage/resolve) — building a trauma-specific model would bake in an asymmetry the requirement explicitly rejects | Valence-agnostic reactivation: the emotion type pushed on trigger is read from the original event's appraisal, same as any other appraisal-driven emotion |
| Unseeded randomness anywhere in the drift/snap/regen/reactivation path | Compounds the pre-existing unseeded-RNG debugging problem PROJECT.md already flags, for a feature with no test coverage that specifically needs hand-tracing to verify | Pure functions of `(mind, event, tick)` only |
| A tick-driven global update loop iterating all NPCs' needs/pressure every tick | `sim.js` has no such loop today; adding one is new architecture, not a formula choice, and changes the event-driven character of the whole engine | Computed-live-at-read accessors keyed off stored `lastChangedTick`/`formedTick`, exactly like `memoryStrength` already does |

## Stack Patterns by Variant

**If implementing sustained-pressure tracking:**
- Use a leaky integrator (single scalar per trait/value/worldview entry)
- Because it answers PROJECT.md's open "counter vs. rolling window" question with the simplest structure that satisfies both readings, and avoids a new unbounded array

**If implementing the snap path:**
- Rewrite `anchor`, not just `weight`, and make the snap threshold itself a weighted sum of context terms (current emotion intensity, relevant worldview weight, boldness/neuroticism), computed the same way `decideAndAct()` computes its candidate scores
- Because that's the only way "not a flat rate" (PROJECT.md's explicit requirement) and "nothing left to regress to" (the anchor/weight split's whole point) both hold

**If implementing belief decay:**
- Compute confidence live from `formedTick`, mirroring `memoryStrength` exactly, rather than storing and periodically mutating a decayed value
- Because there is no tick-loop in `sim.js` to drive periodic mutation, and introducing one is a bigger architectural change than this gap warrants

**If implementing needs regeneration:**
- Compute live, approach a fixed baseline exponentially, same formula shape as decay just aimed the other direction
- Because it's the smallest addition that keeps Needs in the same "computed live" family as Memories/Emotions, and gives `belonging` a first trigger (positive social contact per Baumeister & Leary) without inventing a new decay/regen math family

**If implementing trigger reactivation:**
- Match on `predicate` + `subject`/actor already present in the belief/memory shape; push a new `emotions` entry scaled by the matched memory's current decayed strength; read emotion type from the original event's appraisal (not a separate negative-only path)
- Because this needs zero new schema and naturally covers both hypervigilance-style and courage/resolve-style reactivation from the same code path

## Formula Consistency (repurposed "Version Compatibility")

| Formula family | Used by (existing) | Should also be used by (Phase 2) | Notes |
|---|---|---|---|
| `strength = importance × 0.5^(Δt/halflife)`, `halflife = 3 + importance × 35` | Memories | Beliefs (confidence decay) | Same constants, same shape — do not derive a separate halflife formula for Beliefs |
| `intensity × 0.5^(Δt/6)` | Emotions | Trigger-reactivated emotion spikes | Reactivated emotions are still emotions — they decay the same way, no special case |
| `value += rate × (target − value)` (exponential approach) | — (new) | Pressure accumulator (target = event valence), snap-free drift, needs regeneration (target = baseline) | One functional shape, three call sites — keeps PERSON-MODEL.md to one new formula family instead of three |
| `importance += gain × (1 − importance)` (diminishing-returns reinforcement) | — (new) | Reinforcement of echoed memories/beliefs | Feeds the existing `importance → halflife` formula automatically; no second halflife formula needed |

## Sources

- Verified via live WebSearch this session (MEDIUM-HIGH+ confidence):
  - Sherif & Sherif, Social Judgment Theory — latitude of acceptance/rejection/noncommitment, ego-involvement
  - Deffuant–Weisbuch and Hegselmann–Krause bounded-confidence opinion-dynamics models
  - ACT-R base-level activation / power law of forgetting (Anderson & Schooler lineage)
  - Brown & Kulik (1977), flashbulb memory
  - Collins & Loftus (1975), spreading activation
  - The Sims' motive decay/regeneration system (GDC-talk-sourced secondary coverage)
  - Dörner's Psi theory, five basic needs including affiliation/certainty/competence
  - Roberts, Walton & Viechtbauer (2006) meta-analysis and Bleidorn et al. life-events-and-personality-change literature, cumulative continuity principle
  - Prochaska & DiClemente's Transtheoretical Model, relapse as a formal stage (used as a structural parallel for the "regression trap," not a literal fit — TTM models intentional health-behavior change, not personality trait drift)
  - Confirmed absence of a citable "Phelps-Roper framework" (two direct searches, one structural search)
- Referenced from training data, not independently re-verified live this session (MEDIUM confidence, flagged per-row above):
  - Baumeister & Leary (1995), "The Need to Belong," *Psychological Bulletin* — canonical, extremely well-cited paper; two live-search attempts returned tool errors rather than contradicting results
  - Richter-Levin & Akirav, emotional tagging hypothesis — found via search but not deeply verified; treat as directional support only
  - SM-2/SuperMemo/Anki spaced-repetition reinforcement shape — well-documented publicly, not re-verified against primary source this session
- Existing project sources treated as ground truth (not re-derived):
  - `PERSON-MODEL.md` (`memoryStrength`, `activeEmotionIntensity`, `decideAndAct()` term-breakdown pattern)
  - `.planning/PROJECT.md` (Active requirements, Context notes on magic numbers and unseeded RNG)

---
*Stack research for: Tiny Town Phase 2 person model (trait drift/snap, belief decay, needs regeneration, trigger reactivation)*
*Researched: 2026-08-12*
