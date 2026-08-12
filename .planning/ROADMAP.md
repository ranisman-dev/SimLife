# Roadmap: Tiny Town — Phase 2 Person Model ("Sticky, Not Static")

## Overview

This milestone makes Tiny Town's person model capable of changing under pressure —
personality, values, and worldview move from set-once-in-`createWorld()` to mutable —
while closing the documented gaps (belief decay, needs regeneration, witness ordering,
Tell/Move memory importance) that currently undercut it. The seven phases below are
dependency-ordered, not separable user-facing slices: verification infrastructure and
witness-reaction ordering must land first because every later phase is judged by hand
(no automated test suite) and ordering changes what everything downstream perceives;
belief decay/needs regen and Tell/Move memory importance are independent fixes that
share the existing lazy-decay idiom and unblock reactivation later; slow drift and its
accumulate-then-commit machinery must exist before snap (which reuses it) and before
trigger reactivation (which needs both durable memories and a notion of "was this
intense enough to matter"). This is Horizontal Layers mode by design — these are
infrastructure dependencies, confirmed against research, not independently shippable
features.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Verification Infrastructure** - Seeded RNG, a drift-off toggle that reproduces the original regression case, and one named constants block for every new tuning number
- [ ] **Phase 2: Witness Reaction Ordering** - NPCs react to a shared event in urgency order, not agent-list order
- [ ] **Phase 3: Belief Decay & Needs Regeneration** - Beliefs fade like memories; safety/sustenance/belonging recover instead of only dropping
- [ ] **Phase 4: Tell/Move-Aware Memory Importance** - Being told something severe forms a memory as important as witnessing it
- [ ] **Phase 5: Slow Trait Drift** - Personality/values/worldview shift gradually under sustained pressure, committed only after each cascade resolves
- [ ] **Phase 6: Snap Events** - A single intense event can immediately and permanently change a trait/value/worldview entry
- [ ] **Phase 7: Trigger Reactivation** - Old high-importance memories re-spike a transient emotion, positive or negative, when something reminds the NPC of them

## Phase Details

### Phase 1: Verification Infrastructure

**Goal**: The project has infrastructure to reproduce, verify, and centrally tune every subsequent Phase 2 change by hand, since there is no automated test suite.
**Depends on**: Nothing (first phase)
**Requirements**: VERIF-01, VERIF-02, VERIF-03
**Success Criteria** (what must be TRUE):

  1. With `world.driftEnabled = false` and the RNG seed fixed, the two-clone `CompetitiveJungle` scenario produces the same divergent reaction, same event sequence, and same beliefs as the original (pre-Phase-2) case.
  2. Every random outcome in a session (Attack damage rolls, gossip truth-telling, scapegoat selection) flows through one seeded `rng()` call site and is reproducible by re-running with the same seed.
  3. All Phase 2 tuning numbers (thresholds, rates, decay constants) live in one named constants block (e.g. `Sim.DRIFT`), not scattered inline in `sim.js`.
  4. `PERSON-MODEL.md` and `PROJECT.md`'s Key Decisions table cite the real sources (Roberts/Walton/Viechtbauer 2006, Sherif's Social Judgment Theory, Prochaska & DiClemente as structural parallel) in place of the non-existent "Phelps-Roper framework." *(Constraint-derived — doc/code drift is treated as a bug per CLAUDE.md; not tied to a specific v1 requirement.)*

**Plans**: 3 plans

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Seeded RNG (mulberry32 on `world.rng`), the `Sim.TUNING` constants block, and the `isDriftEnabled` accessor; all three `Math.random()` call sites rewired

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 01-02-PLAN.md — Regression harness in `sim.js`: scenario-scoped snapshotting, snapshot diffing with human-readable formatting, and `Sim.runRegressionCheck()` reproducing the two-clone `CompetitiveJungle` case

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — `scripts/verify.js` CLI with `--update-baseline`, the committed golden-master `scripts/baseline.json`, and the PERSON-MODEL.md citation fix

**Research**: Skip — directly derived from PROJECT.md's own stated risks, mechanical, no open design question.

### Phase 2: Witness Reaction Ordering

**Goal**: NPCs react to a shared event in order of computed urgency, not incidentally by their position in the world's agent list.
**Depends on**: Phase 1
**Requirements**: ORDER-01, ORDER-02
**Success Criteria** (what must be TRUE):

  1. When an attack victim and an uninvolved bystander both witness the same event, the victim's retaliation reaction is dispatched before the bystander's reaction, regardless of agent-list order.
  2. A captured "before" baseline of the current `forEach`-order reactions for a scripted scenario is diffed against the new urgency-ordered output, showing the fix's effect concretely rather than assumed.

**Plans**: TBD
**Research**: Skip — well-scoped existing gap with a clear fix shape (score-then-fire-highest-first), already documented in CONCERNS.md.

### Phase 3: Belief Decay & Needs Regeneration

**Goal**: Beliefs fade the way memories already do, and needs recover instead of only ever dropping.
**Depends on**: Phase 2
**Requirements**: DECAY-01, DECAY-02, DECAY-03, DECAY-04, DECAY-05
**Success Criteria** (what must be TRUE):

  1. An old, unreinforced belief's effective confidence measurably decreases over elapsed ticks, using the same halflife-style decay curve already used for memory strength.
  2. A belief explicitly tagged "known false" is never pruned for staleness, verified against a comparable belief that lacks the tag and is pruned.
  3. `safety`, `sustenance`, and `belonging` needs rise back toward baseline over time and/or after a qualifying triggering action, where previously they only ever fell.
  4. `belonging` has at least one working trigger, observable as a measurable rise in `belonging` following that trigger.
  5. An agent whose `safety` value oscillates near the retreat threshold does not flicker between retreat and non-retreat every tick across a scripted oscillation test, confirming the hysteresis band holds.

**Plans**: TBD
**Research**: Skip — "existing idiom, lower risk"; both are computed-live-at-read or event-driven-stored patterns already proven elsewhere in `sim.js`.

### Phase 4: Tell/Move-Aware Memory Importance

**Goal**: Being told something significant can form a memory as durable and important as witnessing it directly.
**Depends on**: Phase 1
**Requirements**: MEMORY-01, MEMORY-02
**Success Criteria** (what must be TRUE):

  1. A `Tell` event conveying a severe claim produces an `appraiseEvent` impact value noticeably above the current flat floor, scaled to the claim's severity, rather than always forming at the minimum.
  2. A high-importance memory (from any event type, including `Tell`/`Move`) remains recallable at an elapsed-tick count where a maximum-importance memory previously fell below the prune floor (research places that cap around 38 ticks under the current formula).

**Plans**: TBD
**Research**: Skip — small, well-defined `appraiseEvent` branch addition; the gap and fix shape are both already documented.

### Phase 5: Slow Trait Drift

**Goal**: Personality/values/worldview can shift gradually under sustained directional pressure, committed only after each event's reaction cascade fully resolves.
**Depends on**: Phase 1, Phase 2
**Requirements**: DRIFT-01, DRIFT-02, DRIFT-03, DRIFT-04
**Success Criteria** (what must be TRUE):

  1. Each drift-eligible trait/value/worldview entry has an `anchor`, a `weight`, and a `pressure` value present and readable on the agent's `mind` object, with `weight` diverging from and relaxing back toward `anchor` over time absent reinforcement.
  2. Repeated same-direction events raise an entry's `pressure`, and once `pressure` crosses its threshold, `anchor` is rewritten to match `weight` — a change confirmed still present after later, unrelated events.
  3. Mid-cascade (before `reactionDepth` returns to 0), no trait/value/worldview write is visible to other reacting NPCs in that same cascade; all drift writes apply only once the cascade unwinds.
  4. A single event whose `event.why` decomposition implicates multiple traits/values raises `pressure` on more than one entry in that reaction, not just one.
  5. `PERSON-MODEL.md`'s box list and `CLAUDE.md`'s mind-box mutability table both reflect the new `anchor`/`weight`/`pressure` fields, updated in the same change that introduces them. *(Constraint-derived — doc/code drift is treated as a bug per CLAUDE.md; not tied to a specific v1 requirement.)*

**Plans**: TBD
**Research**: Recommended — the anchor/weight/pressure three-field model is this milestone's own research synthesis, not independently confirmed by any single source; pressure-test before implementation.

### Phase 6: Snap Events

**Goal**: A single sufficiently intense event can immediately and permanently change a trait/value/worldview entry, bypassing the slow-drift path.
**Depends on**: Phase 4, Phase 5
**Requirements**: SNAP-01, SNAP-02, SNAP-03
**Success Criteria** (what must be TRUE):

  1. An event intense enough to cross the snap threshold immediately rewrites both `weight` and `anchor` for the implicated entry in one step, without first passing through pressure accumulation.
  2. Two agents with different current emotion intensity, worldview weight, or boldness/neuroticism show a measurably different snap threshold for the same input event, confirming the threshold is context-computed rather than a flat constant.
  3. A near-miss event (below snap threshold) that repeats causes that entry's `pressure` to decay measurably more slowly afterward, without by itself rewriting `anchor`.

**Plans**: TBD
**Research**: Recommended — threshold-height formula shape is well-grounded but exact term weights are an open tuning question.

### Phase 7: Trigger Reactivation

**Goal**: Old, still-salient high-importance memories can resurface as a transient emotional re-spike when a later event reminds the NPC of them, reading as positive or negative depending on the original event.
**Depends on**: Phase 4, Phase 5, Phase 6
**Requirements**: TRIGGER-01, TRIGGER-02, TRIGGER-03
**Success Criteria** (what must be TRUE):

  1. An NPC with an old, still-salient high-importance memory experiences a transient emotion re-spike, visible as a new entry in `mind.emotions`, when a later event matches/reminds them of it.
  2. The same reactivation code path produces a positive-valence re-spike (courage/resolve) for a positively-appraised original event and a negative-valence re-spike (anxiety/caution) for a negatively-appraised one, with no separate negative-only special case.
  3. Each reactivation is recorded in `mind.log` or `event.why`-style provenance, inspectable after the fact rather than a silent internal mutation.

**Plans**: TBD
**Research**: Recommended — the "what reminds an NPC" matching rule has no citable precedent in any surveyed system and is a genuinely open design question.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|-----------------|--------|-----------|
| 1. Verification Infrastructure | 1/3 | In Progress|  |
| 2. Witness Reaction Ordering | 0/1 | Not started | - |
| 3. Belief Decay & Needs Regeneration | 0/1 | Not started | - |
| 4. Tell/Move-Aware Memory Importance | 0/1 | Not started | - |
| 5. Slow Trait Drift | 0/1 | Not started | - |
| 6. Snap Events | 0/1 | Not started | - |
| 7. Trigger Reactivation | 0/1 | Not started | - |
