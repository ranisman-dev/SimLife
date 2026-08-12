# Tiny Town

## What This Is

Tiny Town is a prototype for a "beliefs, not scripts" simulation architecture: every
action — the player's or an NPC's — runs through the same perceive → believe → decide
→ act pipeline, and the engine never special-cases per scenario, only asking "what is
true, who knows it, what do they want, and what can they do about it?" The current
build is a small proving ground (5 NPCs, one location, five generic verbs) for that
architecture; the long-term goal is a fully living world.

## Core Value

An entire world — not just NPCs — reacts unscripted to what anyone in it does, player
and NPC alike, with real, lasting consequences (ecological, economic, social) rather
than flavor text.

## Requirements

### Validated

- ✓ Perceive → believe → decide → act pipeline for all actions (player and NPC) —
  existing
- ✓ Five generic verbs (Take, Give, Attack, Tell, Move) routed through one
  `performAction` entry point — existing
- ✓ Nine-box NPC mind model (personality, values, worldview, beliefs, memories,
  needs, emotions, relationships, goals) — existing
- ✓ Witnessed belief formation (100% confidence) and claimed belief formation
  (trust/worldview-derived confidence, contradiction/corroboration checks) — existing
- ✓ Personality/values/worldview wired into every reaction, with decision provenance
  surfaced (`event.why`, `mind.log`) — existing (most recent commit)
- ✓ Utility-AI decide/act loop (do nothing / attack / press for explanation / tell a
  confidant / retreat), scored from relationship + emotion + worldview state —
  existing

### Active

**Phase 2 person model — "sticky, not static"**

- [ ] Personality/values/worldview can drift slowly under sustained pressure instead
      of being fixed forever
- [ ] A single sufficiently intense event can snap a trait/value/worldview
      immediately, bypassing the slow-drift path
- [ ] Snap-drift speed is itself modulated by surrounding circumstances (current
      emotions, beliefs, other worldview entries) — not a flat rate
- [ ] Repeated events that echo an intense event make its charge stickier/slower to
      fade without that alone constituting a full "Change to Person"
- [ ] Intense-event memories persist far longer than ordinary memories and can
      re-trigger moments of emotion/belief long after the original event (not only
      negative — could read as anxiety/caution or as courage/resolve depending on
      the trait involved)
- [ ] Open design questions to resolve during phase discussion (not decided yet):
      how "sustained pressure" is tracked (running counter vs. rolling window), and
      whether one event can nudge multiple related traits/values/beliefs at once vs.
      each drifting independently

**Known gaps and bugs (from CONCERNS.md)**

- [ ] Belief decay/pruning — beliefs currently never fade or get forgotten, unlike
      memories, despite being downstream of them
- [ ] Needs regeneration, including a first trigger for `belonging` — currently
      `safety`/`sustenance`/`belonging` only ever drop and never recover
- [ ] Witness reaction ordering — reactions currently fire in witness-list order,
      not by urgency score, so e.g. an attack victim's retaliation can land after
      uninvolved bystanders have already reacted and resolved
- [ ] Smaller fixes: explicit `quantity: 0` silently becomes 1 (Take/Give); Tell/Move
      events don't feed memory importance, so conversation memories always form at
      the decay floor; the `ReplenishFood` goal is created but never read by any
      decision logic

### Out of Scope

- Ecology/economy world-systems (huntable animal populations, farming, businesses,
  symmetric large-scale NPC/player world impact) — this is the long-term Core Value
  and belongs in a future milestone, not this one. Notably unresolved for that future
  work: whether it needs new generic verbs (e.g. a `Harvest`/`Produce` verb usable
  across domains) or new world-state read/written by the existing five verbs —
  flagged, not decided.
- `Tradition` and `Pleasure` values, and worldview entries for superstition/
  spirituality/religion — deliberately unwired; no honest mechanic in the current
  five-verb sim for them to attach to (per `PERSON-MODEL.md`)
- Automated test suite — the project currently has none and adding one isn't part of
  this milestone's scope, though the lack of regression protection is a known risk
  for the scoring-weight changes Phase 2 will touch (see CONCERNS.md)

## Context

- Single-page static app: `sim.js` (engine, no DOM), `parser.js` (sentence → action
  request), `presentation.js` (the only file allowed to touch the DOM). No build
  step, no backend, no persistence.
- `PERSON-MODEL.md` is the authoritative reference for the nine mind-box formulas and
  hooks; `CLAUDE.md` states the project treats drift between it and `sim.js` as a bug
  in one or the other — this must stay true after Phase 2 changes.
- A codebase map already exists at `.planning/codebase/` (ARCHITECTURE.md,
  CONCERNS.md, CONVENTIONS.md, INTEGRATIONS.md, STACK.md, STRUCTURE.md, TESTING.md),
  dated 2026-08-12, and is the source for the Validated requirements and the
  known-gaps list above.
- Personality/values/worldview are currently set once in `createWorld()` and never
  mutated anywhere in the codebase (verified during codebase mapping) — Phase 2 is
  the first time any of the three sticky boxes becomes mutable.
- `decideAndAct()`'s scoring terms are inline magic numbers with no single tuning
  surface and no automated test coverage — any drift/snap logic added here inherits
  that fragility; changes should be checked by hand against the existing verified
  case (two clones, opposite `CompetitiveJungle` weight, same event, different
  reaction) until real tests exist.
- No RNG seeding exists (`Math.random()` used directly in Attack damage, gossip
  truth-telling, scapegoat selection) — reproducing a specific traced interaction
  involving drift/snap behavior will be hard to debug without one.

## Constraints

- **Architecture**: Every new mechanic must go through the same
  perceive→believe→decide→act pipeline via `Sim.performAction()` — no scenario
  special-casing, per the project's one architectural rule (`CLAUDE.md`).
- **File boundaries**: `sim.js` must stay DOM-free; `presentation.js` is the only
  file allowed to touch the DOM and must never mutate world state directly — enforced
  by a comment at the top of each file.
- **Tech stack**: Vanilla JS, no framework, no build step, no dependencies — matches
  the existing prototype and there's no stated reason to introduce tooling for this
  milestone.
- **Documentation sync**: Any change to the person model must update
  `PERSON-MODEL.md` in the same change — the project already treats doc/code drift
  as a bug.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| This milestone = Phase 2 person model (drift/snap) + CONCERNS.md gap fixes; world-systems (ecology/economy) deferred to a future milestone | The living-world vision is large and needs its own design pass; person-model stickiness and the documented gaps are both already scoped, concrete, and touch the same mind-box machinery | — Pending |
| Intense events can snap a trait/value/worldview instantly (not drift-only) | Matches the Phelps-Roper framework already named in `PERSON-MODEL.md`'s Phase 2 gap notes | — Pending |
| Snap/drift speed is modulated by surrounding emotional/belief/worldview context, not a flat rate; repeated near-miss reinforcement can make an event's charge stickier without that alone being a full trait Change | User-specified design intent — distinguishes "temporarily highly activated" from "permanently changed," and generalizes to positive-valence triggers (courage/resolve), not just anxiety-style ones | — Pending |
| Exact "sustained pressure" tracking mechanism (counter vs. rolling window) left open | Not resolved during questioning — flagged for phase-level design discussion | — Pending |
| Whether one event can nudge multiple related traits/values/beliefs at once, or each drifts independently, left open | Not resolved during questioning — flagged for phase-level design discussion | — Pending |
| What "reminds" an NPC of an old intense event (same predicate, same actor, or other) left open | Not resolved during questioning — flagged for phase-level design discussion | — Pending |
| How future ecology/economy mechanics fit the 5-verb architecture (new generic verbs vs. new world-state on existing verbs) left open | Explicitly out of scope for this milestone; noted so the decision isn't lost before that milestone starts | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-12 after initialization*
