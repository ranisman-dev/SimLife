# Feature Research

**Domain:** Agent-based NPC psychology — personality drift, memory salience, trauma/intense-event
reactivation, need regeneration, in life-sim / colony-sim / reputation-driven games
**Researched:** 2026-08-12
**Confidence:** MEDIUM (see per-finding notes; nothing below is HIGH — all sources are wikis,
Steam guides, dev blogs, or one academic paper, not primary design documents or source code)

## Systems Surveyed

| System | Genre | Relevant because |
|---|---|---|
| RimWorld | Colony sim | Thought/mood system — closest existing analog to Tiny Town's emotion+memory decay math |
| Dwarf Fortress | Colony sim | Personality facets/values, stress, mental breakdowns — the only system claiming direct memory→personality causation |
| Crusader Kings 3 | Grand strategy / character sim | Stress accumulator with discrete mental-break trait changes — closest analog to "snap" |
| Darkest Dungeon | Roguelike | Quirks/afflictions — closest analog to "repeated echo makes a charge stickier without a full Change" |
| The Sims (1–4) | Life sim | Needs/motives decay+regen, utility-AI action selection — closest analog to Tiny Town's `decideAndAct` and the needs-regen gap |
| Prom Week (Comme il Faut) | Academic social sim | Rule-based trait/opinion system — checked for trait mutability, found traits are static there |

Façade and Versu were deliberately not researched in depth: both are drama-management systems
oriented around authored story beats, not persistent trait/memory drift, and Prom Week already
covers that research lineage (Comme il Faut) without the redundant lookup.

## Evidence Against This Milestone's Open Design Questions

PROJECT.md leaves three questions explicitly unresolved. Here's what comparable systems imply for each.

### "How is 'sustained pressure' tracked — running counter vs. rolling window?"

Three independent systems converge on the same answer, and it isn't a rolling window:

| System | Mechanism | Source |
|---|---|---|
| Crusader Kings 3 | A single accumulating meter (0–400), personality-gated: actions that contradict a character's own trait add stress, actions that align remove it. Mental-break events fire at fixed thresholds (every 100 points) | MEDIUM — [CK3 stress guides](https://gamerant.com/ck3-crusader-kings-3-how-check-reduce-stress-levels/), [trait/stress guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2868962445) |
| Dwarf Fortress | Stress accumulates and dissipates continuously; the *rate* of both is set by the dwarf's own traits — bravery sets accumulation rate, anxiety sets dissipation rate | MEDIUM — [Stress](https://dwarffortresswiki.org/Stress) |
| Darkest Dungeon | Stress is a running meter per hero; when it crosses a resolve-check threshold the hero rolls virtue/affliction; separately, each *negative quirk present* has an independent 25% chance per mission of becoming permanently locked, regardless of stress level that mission | MEDIUM — [Quirks](https://darkestdungeon.wiki.gg/wiki/Quirks_(Darkest_Dungeon)) (fetched directly, not just search snippet) |

**Implication for Tiny Town:** an accumulator (running counter that decays when unreinforced,
compared against a threshold) is the pattern with real precedent, not a rolling window buffer of
recent events. Critically, in all three systems the *rate itself is trait-modulated* — the same
pressure accumulates and fades at different speeds for different NPCs, which is a direct precedent
for "snap/drift speed is itself modulated by surrounding emotional/belief/worldview context"
(already decided in PROJECT.md, not just plausible — it's the norm, not the exception).

### "Does one event nudge multiple related traits/values/beliefs, or does each drift independently?"

No system in this survey implements fully independent per-trait counters. CK3's stress meter is
one global number gating one mental-break roll that can touch several trait/behavior axes at
once (a single mental break can add a trait, change opinion modifiers, and shift a stat).
Dwarf Fortress's per-memory stress event can affect multiple facets from a single incident
("may change an irrelevant trait" per the community-documented — not wiki-verified, see below —
behavior). Neither system tracks 40 independent per-trait accumulators; both let one significant
event fan out to several related axes. This is weak evidence (LOW confidence — neither source
documents the fan-out mechanism precisely) but it's consistent: **a single intense event coupling
several related axes (e.g., one betrayal denting both a Loyalty value and the GeneralizedTrust
worldview) matches how these systems behave**, more than fully independent per-trait tracks would.

### "What 'reminds' an NPC of an old intense event — same predicate, same actor, other?"

Weakest evidence of the three. Darkest Dungeon's curio/context-triggered quirks and Sims 4's
"reminisce on a memory" moodlet (MEDIUM — [Memories](https://sims.fandom.com/wiki/Memories)) both
tie reactivation to a recognizable stimulus rather than random chance, but neither documents a
precise matching rule (same location? same actor? same verb?). No system surveyed gives a
citable, implementable answer here — flag this as still open, to be settled by design discussion,
not resolved by precedent.

## Feature Landscape

### Table Stakes (Tiny Town Would Look Broken Without These)

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Bounded, decaying belief/opinion state | Every system surveyed caps or fades stored opinions — RimWorld thought stacks cap at 4 duplicates, Sims moodlets expire, DF thoughts fade. An ever-growing, never-pruned `mind.beliefs` array (Tiny Town's current state) is the outlier, not the norm | LOW–MEDIUM | Already flagged as a known gap in PERSON-MODEL.md; give beliefs the same live-computed decay math memories already have, not a new architecture |
| Event-driven, symmetric need restoration | Every need-driven system (Sims motives, RimWorld needs) treats need satisfaction as reachable, not just decay. Tiny Town's needs currently only ever drop via two triggers and never recover — that asymmetry, not the *absence of ambient per-tick decay*, is what reads as broken | LOW–MEDIUM | Do **not** import continuous per-tick decay (see Anti-Features) — Tiny Town has no ambient-activity loop to justify it. Map restoration onto the existing five verbs: `Give` (received bread) is the natural `sustenance` restoration hook; `Give`/`Tell` directed at an NPC are the natural first `belonging` triggers. This keeps the fix inside the architecture's "no new verbs" constraint |
| Trait/value/worldview change as a rare, discrete, legible event — not continuous smooth drift every tick | CK3 mental breaks, DF trauma-facet shifts (see caveat below), and DD quirk locks are all discrete, occasionally-firing events with a visible cause, not a smoothly-sliding number recalculated every frame. A trait that visibly creeps every tick reads as noise, not character development, in every system surveyed | MEDIUM | Supports the "snap" path directly; also implies the slow-drift path should resolve in visible discrete steps (a running counter crossing a threshold), not a continuously-recomputed weight |
| Reaction ordering by significance/urgency, not arbitrary iteration order | Not from these systems directly, but a load-bearing correctness property implied by all of them: DF/CK3/DD process the *provoking* event before its downstream consequences are evaluated. A victim retaliating after uninvolved bystanders have already resolved their reactions is a causality bug, not a design choice, in any of these engines | LOW | Already scoped as a known gap (witness reaction ordering) — no new evidence needed, just confirms it belongs in this batch of fixes rather than being deferred |

### Differentiators (What Makes Trait/Memory Modeling Feel Alive, Not Mechanical)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Dual-path change: slow drift *and* single-event snap | Trait change is a core loop in CK3, DF, and DD; it is explicitly **not** a core loop in RimWorld or The Sims, where traits (mostly) don't change at all. Having both a slow accumulator path and a bypass for one sufficiently intense event is closer to CK3/DD's design than to the more common "traits are permanent flavor" baseline most life-sims use | MEDIUM–HIGH | Already decided in PROJECT.md; the research supports it as a genuine differentiator versus the more common static-trait baseline (RimWorld, Sims), not busywork replicating something every game already does |
| Repetition making a charge "stickier" without alone constituting a full Change | Darkest Dungeon's independent per-mission 25% lock-in roll for each *present* negative quirk is the closest real precedent for "echoes make it stickier without being a Change on their own" — it's a probabilistic reinforcement mechanic, not a full trait mutation, and it explicitly operates as a separate layer from the main stress-driven quirk-acquisition roll | MEDIUM | This is the hardest requirement in the milestone and the one with the thinnest precedent. DD's model (independent probability per repeated exposure, decoupled from the main threshold-crossing event) is a workable pattern: track exposure-count or a secondary "reinforcement" score per event-echo separately from the main pressure accumulator |
| Context-modulated snap/drift speed (rate itself varies by current emotional/belief/worldview state) | DF explicitly ties stress accumulation/dissipation rate to the dwarf's own traits (bravery, anxiety); CK3 gates what even *counts* as stress-inducing by the character's existing personality. Neither is a flat rate. Few games fully generalize this (most cap it at 1–2 modulating traits); doing it against the full existing worldview/emotion/relationship state is more thorough than any single system surveyed | MEDIUM–HIGH | Builds directly on hooks that already exist (`neuroticism` already scales Fear/Anger intensity in `applyAppraisal()`) — this is extending an established pattern, not inventing a new one |
| Positive-valence trigger reactivation (old memory resurfacing as courage/resolve, not just anxiety) | Sims 4's "reminisce" moodlet can be positive, but it's presentation flavor with no downstream mechanical effect. No system surveyed lets an old positive intense memory *mechanically* boost a courage-adjacent decision the way trauma mechanically suppresses one (DD affliction, DF fear). A memory of past resolve actually raising a `boldness`-driven score in `decideAndAct()` would be ahead of every system surveyed on this specific point | MEDIUM | Cheapest version: reuse the existing emotion-intensity decay/stacking machinery, just seed a positive emotion (e.g. a `Resolve`/`Gratitude`-adjacent spike) from an old high-importance memory instead of only ever suppressing |
| Visible provenance for *why* a trait moved (`event.why`-style transparency extended to drift/snap) | None of the five commercial systems surveyed expose this to the player in a legible, per-decision way — RimWorld shows the mood-target sum, CK3 shows a stress number, but none show "this specific memory + this worldview weight is why your bravery facet shifted." Tiny Town already built exactly this for `decideAndAct()` (`mind.log[].why`) | LOW (extends existing pattern) | Not costly to add since the provenance pattern already exists — the real work is deciding what to log, not building new plumbing |

### Anti-Features (Seem Good, Wrong Scope for a 5-NPC Prototype)

| Feature | Why Requested | Why Problematic | Alternative |
|---|---|---|---|
| Continuous per-tick need decay (Sims/RimWorld style, needs always ticking down) | "Real" need systems in the genre decay constantly, so it looks incomplete without it | Tiny Town has no ambient-activity simulation loop (no eating schedule, no idle ticking) to justify continuous decay — importing it means inventing an entire simulated-day structure the milestone doesn't ask for, just to make the decay have something to mean | Keep needs strictly event-driven on both sides: they drop on specific triggers (already true) and now also recover on specific triggers (`Give` for sustenance, `Give`/`Tell` for belonging) — symmetric, not continuous |
| Single global mood scalar (RimWorld's one Mood-vs-Target number as the master variable everything reduces to) | Simpler mental model, one number to reason about, matches the most famous example in the genre | Tiny Town already models typed, per-target emotions (`Anger` at X, `Fear` of Y) that stack independently — collapsing to one scalar is a real regression in expressiveness, not a simplification, and it's the single most tempting thing to accidentally import from RimWorld | Keep emotions typed and per-target; if a single "how is this NPC doing overall" number is ever needed for a UI gauge, derive it by summing at read time, the way `activeEmotionIntensity` already does — never store it as the source of truth |
| Player-facing stress meter as the primary drama driver (CK3's visible 0–400 bar, DD's visible stress gauge, DF's stress-triggered breakdown announcements) | These are the most visible, most "game-y" parts of the reference systems, so they're an obvious thing to want to copy wholesale | Tiny Town's drama comes from belief divergence and witnessed events, not from watching a meter fill — a visible player-facing pressure gauge would shift the game's core tension to "manage the number" instead of "figure out who believes what," which isn't this project's Core Value | Keep pressure/reinforcement accumulators as internal engine state, surfaced only through the existing `event.why`/`mind.log` provenance mechanism if surfaced at all |
| Full state-machine mental breaks (DF tantrum spirals/insanity, DD affliction behavior overrides, CK3 mental-break event chains) | These are the payoff moments in the reference systems — visible, dramatic, "the dwarf goes berserk" | With 5 NPCs sharing one location and five generic verbs, a multi-tick behavior-override state machine has almost nowhere useful to go (no combat depth, no long expedition structure) and risks producing noise (an NPC locked out of normal decision-making for several ticks) rather than legible character change | Let the existing `decideAndAct()` utility-AI scoring absorb pressure effects as adjusted weights for that one decision, rather than swapping to a separate override state machine |
| Large authored trait/quirk taxonomy (Darkest Dungeon's dozens of named quirks with bespoke mechanical effects each; CK3's leveled trait tracks, e.g. Wrathful I/II/III) | Feels richer, more "content," matches what makes these games feel deep | Every named quirk/tiered-trait in these systems is individually hand-authored content. Tiny Town's architecture rule explicitly forbids scenario special-casing — a big enumerated catalog of bespoke traits is exactly that, just for personality instead of quests | Keep drift/snap operating on the existing generic axes (OCEAN+boldness, the 13-entry Values bank, the 4-entry Worldview bank) with continuous weights, not a new enumerated catalog |
| Prom Week-style 5000+ authored social-consideration rule base (Comme il Faut) | It's the most sophisticated academic precedent for character-specific social reasoning found in this research | Wildly disproportionate authoring cost for 5 NPCs and a prototype; also, notably, Prom Week's own *traits* are static — the rule base governs moment-to-moment social choices, not trait mutation, so it isn't even evidence for this milestone's actual ask | None needed — Tiny Town's existing generic-verb/utility-AI approach is already the right-sized alternative to a hand-authored rule base |

## Feature Dependencies

```
Belief decay/pruning (bounded mind.beliefs)
    └──required-by──> Snap-path trait/value/worldview change
                           (a stale, unpruned, still-100%-confidence belief from
                           1000 ticks ago must not read as fresh corroborating
                           evidence for a snap)

Tell/Move-aware memory importance (appraiseEvent branch for Tell/Move)
    └──required-by──> Intense-event trigger reactivation
                           (until fixed, every conversation memory forms at the
                           0.1 floor — nothing an NPC was *told*, only what they
                           witnessed firsthand, can ever qualify as "intense
                           enough to persist and re-trigger")

Extended-halflife / raised-floor curve for high-importance memories
    └──required-by──> Intense-event trigger reactivation
                           (current halflife = 3 + importance×35 still ages a
                           maximum-importance memory out around ~38 ticks with a
                           0.03 prune floor — "persists far longer than ordinary
                           memories" needs its own curve or floor, not just the
                           existing formula run further)

Needs regeneration (Give→sustenance, Give/Tell→belonging)
    └──enhances──> Sustained-pressure tracking
                       (an NPC whose safety/belonging has been low for a while is
                       a plausible input to a "pressure" accumulator — open design
                       question in PROJECT.md, not yet decided, but needs-regen
                       landing first means this input is available if wanted)

Witness reaction ordering (urgency, not list position)
    └──affects──> which memories/beliefs form from a cascading event
                       (who reacts first changes what downstream witnesses
                       perceive, which changes what gets remembered/believed,
                       which is upstream of everything drift/snap reads)

Decision provenance (event.why, mind.log — already shipped)
    └──enhances──> Trait/value/worldview drift and snap
                       (extending, not building fresh — reuse the existing
                       named-term scoring/logging pattern for whatever drives
                       a trait change, so "why did X's boldness shift" is
                       answerable the same way "why did X attack" already is)
```

### Dependency Notes

- **Belief decay is a snap-path prerequisite, not a general prerequisite.** The slow-drift path
  could plausibly work off relationship/emotion state alone without belief pruning being fixed
  first, but any snap logic that reads belief confidence as "current evidence" breaks if beliefs
  never expire — an unbounded array of 100%-confidence beliefs from the entire game history isn't
  a meaningful signal for "is this still happening."
- **Tell/Move memory importance and extended-halflife are both hard prerequisites for
  trigger-reactivation specifically**, not for drift/snap in general. Drift/snap can plausibly
  read straight from beliefs/emotions/relationships without touching memory decay at all; only the
  "old intense-event memories re-trigger emotion long after" requirement needs memories that
  survive long enough, and needs conversational content (not just physical acts) to be eligible.
- **Needs regeneration enhances but does not block** sustained-pressure tracking — it's a plausible
  input source once the open design question is resolved, not a hard dependency in either direction.
- **Witness reaction ordering is upstream of everything**, since it changes which events get
  witnessed by whom in what order, which changes memory/belief formation, which is what
  drift/snap/trigger all read from. Low complexity, high leverage — good candidate to land early
  in the phase regardless of which drift/snap design is chosen.

## MVP Definition

Reframed for this milestone (an existing prototype gaining a phase, not a product launch):

### Build First (unblocks everything else in this phase)

- [ ] Witness reaction ordering by urgency — cheap, and changes what downstream memory/belief
      formation looks like for every other item on this list
- [ ] Belief decay/pruning — prerequisite for a trustworthy snap path
- [ ] Tell/Move-aware memory importance — prerequisite for trigger-reactivation to ever fire on
      anything an NPC was told rather than witnessed directly
- [ ] Needs regeneration (`Give`→sustenance, `Give`/`Tell`→belonging) — self-contained, no
      dependency on the drift/snap design being settled, and resolves a clearly-broken asymmetry

### Build Once Design Questions Resolve (v1.x of this phase)

- [ ] Sustained-pressure accumulator for slow drift (recommend: running counter per
      trait/value/worldview entry that increments on contradicting/reinforcing events and decays
      when unreinforced, compared against a threshold — matches CK3/DF/DD convergent pattern, not
      a rolling window)
- [ ] Single-event snap path, gated by an intensity threshold on the triggering event's appraisal
- [ ] Context modulation of snap/drift rate by current emotion/belief/worldview state (extend the
      existing `neuroticism`-scales-Fear pattern to the accumulator's rate, not just its magnitude)
- [ ] Extended memory persistence curve for high-importance memories, distinct from the ordinary
      halflife formula
- [ ] Trigger-reactivation of old intense memories (emotion/belief re-spike), including the
      positive-valence path (courage/resolve, not just anxiety)

### Explicitly Defer (future consideration, not this milestone)

- [ ] "Repetition makes it stickier without a full Change" as its own tunable layer, separate from
      the main pressure accumulator (DD's independent per-exposure probability roll is the model
      to crib from, but land the core accumulator + snap first and confirm it behaves before
      adding a second, probabilistic reinforcement layer on top)
- [ ] Any named/authored trait-catalog, quirk taxonomy, or player-facing pressure gauge — see
      Anti-Features

## Feature Prioritization Matrix

| Feature | Value to Milestone Goal | Implementation Cost | Priority |
|---|---|---|---|
| Witness reaction ordering by urgency | HIGH (correctness bug, blocks clean data for everything downstream) | LOW | P1 |
| Belief decay/pruning | HIGH (prerequisite, documented gap) | LOW–MEDIUM | P1 |
| Tell/Move memory importance | HIGH (prerequisite for trigger-reactivation) | LOW–MEDIUM | P1 |
| Needs regeneration incl. `belonging` first trigger | HIGH (documented gap, self-contained) | LOW–MEDIUM | P1 |
| Sustained-pressure accumulator | HIGH (core ask of the milestone) | MEDIUM | P1 |
| Single-event snap path | HIGH (core ask of the milestone) | MEDIUM–HIGH | P1 |
| Context-modulated snap/drift rate | MEDIUM–HIGH (differentiator, extends existing hooks) | MEDIUM | P2 |
| Extended high-importance memory persistence curve | HIGH (prerequisite for trigger-reactivation) | LOW–MEDIUM | P1 |
| Trigger-reactivation (negative valence) | HIGH (explicit requirement) | MEDIUM | P2 |
| Trigger-reactivation (positive valence: courage/resolve) | MEDIUM (explicit requirement, but positive path is newer ground) | MEDIUM | P2 |
| Provenance for drift/snap (`why` extension) | MEDIUM (quality-of-life for debugging without a test suite) | LOW | P2 |
| "Echo makes it stickier" reinforcement layer | MEDIUM (explicit requirement, thinnest precedent) | MEDIUM–HIGH | P3 |

**Priority key:** P1 = needed for this phase's core requirements to work correctly; P2 = required
by PROJECT.md but can follow P1 items once the accumulator/snap skeleton exists; P3 = the hardest,
least-precedented requirement — recommend building and hand-verifying P1/P2 first, given there's no
automated test suite to catch a regression here.

## Sources

- RimWorld: [Mental break](https://rimworldwiki.com/wiki/Mental_break) · [Thoughts](https://rimworldwiki.com/wiki/Thoughts) · [Mood](https://rimworldwiki.com/wiki/Mood) · [How RimWorld Mood Really Works (2026)](https://eatcreatesleep.net/how-the-rimworld-mood-system-really-works-mood-vs-mood-target/) — MEDIUM confidence, community wiki + independent blog, not official docs
- Dwarf Fortress: [Stress](https://dwarffortresswiki.org/Stress) · [Thoughts and preferences](https://dwarffortresswiki.org/index.php/Thoughts_and_preferences) · [Mental breakdown](https://dwarffortresswiki.org/index.php/Mental_breakdown) · [DF2014:Personality facet](https://dwarffortresswiki.org/index.php/DF2014:Personality_facet) (fetched directly — confirmed the memory→facet claim is a one-line unverified assertion on the page, not a documented mechanic; treat as LOW confidence, not MEDIUM)
- Crusader Kings 3: [Traits — CK3 Wiki](https://ck3.paradoxwikis.com/Traits) · [Stress levels guide](https://gamerant.com/ck3-crusader-kings-3-how-check-reduce-stress-levels/) · [Trait effects on Stress guide](https://steamcommunity.com/sharedfiles/filedetails/?id=2868962445) — MEDIUM confidence, community guides not official patch notes
- Darkest Dungeon: [Quirks](https://darkestdungeon.wiki.gg/wiki/Quirks_(Darkest_Dungeon)) (fetched directly — confirmed 25%-per-mission independent lock-in roll for negative quirks) · [Stress](https://darkestdungeon.fandom.com/wiki/Stress) — MEDIUM confidence, community wiki
- The Sims: [Free will](https://sims.fandom.com/wiki/Free_will) · [Motive](https://sims.fandom.com/wiki/Motive) · [Memories](https://sims.fandom.com/wiki/Memories) · [The Genius AI Behind The Sims (Mark Brown / GMTK)](https://gmtk.substack.com/p/the-genius-ai-behind-the-sims) — MEDIUM confidence; the GMTK piece is the most credible single source in this set (established games-design critic, cites Maxis' own advertised-actions/utility-AI terminology)
- Prom Week: [Gameplay and Social Physics (project blog)](https://promweek.soe.ucsc.edu/2011/11/12/gameplay-and-social-physics/) · [Prom Week: Social Physics as Gameplay (FDG 2011 paper, PDF)](http://www.ben-samuel.com/wp-content/uploads/2015/09/FDG-2011-Prom-Week-Social-Physics-as-Gameplay.pdf) — MEDIUM-HIGH confidence, primary academic source, author-hosted PDF

---
*Feature research for: Agent-based NPC psychology (Tiny Town Phase 2 — personality drift, memory salience, trauma triggers, needs regeneration)*
*Researched: 2026-08-12*
