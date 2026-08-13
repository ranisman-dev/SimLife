# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Tiny Town: a prototype for a "beliefs, not scripts" simulation architecture. 5 NPCs in
one location, five generic verbs (Take, Give, Attack, Tell, Move). Every action — the
player's or an NPC's — runs through the same **perceive → believe → decide → act**
pipeline. The architecture's one rule: the simulation never asks "what quest is the
player doing?", only "what is true, who knows it, what do they want, and what can they
do about it?" Nothing is special-cased per scenario.

## Running it

Static site, no build step, no dependencies, no package.json.

```
python3 -m http.server 8000
```

then visit `http://localhost:8000/index.html`. Opening `index.html` directly as a
`file://` URL also works — there's no server-side code. There is no test suite, linter,
or build command in this repo.

## File layout and the rule that keeps it that way

- **`sim.js`** — the engine. World state, the five verbs, perception, belief formation,
  and a small utility-AI decide/act loop NPCs use to react on their own. **No DOM
  references belong here.**
- **`parser.js`** — turns typed player sentences ("take bread from mara") into the same
  action-request shape (`{ verb, params }`) NPCs generate internally, so both funnel into
  `Sim.performAction()`.
- **`presentation.js`** — the only file allowed to touch the DOM. Reads engine state
  through `sim.js`'s public API (`Sim.createWorld`, `Sim.performAction`, `Sim.getAgent`,
  etc.) and never mutates world state directly.

Each file enforces this boundary with a comment at its own top — preserve that
separation when editing.

## Core architecture (sim.js)

**Action pipeline.** `performAction(world, actorId, verb, params)` is the single
entry point both the player (via `parser.js`) and NPCs (via `decideAndAct`) call.
Flow: `checkPreconditions` → `applyEffects` → push an `event` onto `world.events` →
`computeWitnesses` → `perceiveEvent` for each witness. `perceiveEvent` is where a
witnessed event turns into a memory + a 100%-confidence belief, and where NPCs run
their own react loop — capped by `MAX_REACTION_DEPTH` (4) via a module-level
`reactionDepth` counter, since one action can cascade into witnesses reacting, which
can itself generate new witnessed events.

**The mind boxes.** An NPC's `mind` object (the player has `mind: null`) holds nine
pieces, each with distinct mutability and decay rules — this is the part most bugs
live in, and `PERSON-MODEL.md` is the authoritative reference for exact formulas and
hooks. Skim it before touching belief/relationship/decision logic. Summary:

| Box | Mutable? | Decay? |
|---|---|---|
| `personality` (OCEAN + `boldness`) | never, set once in `createWorld()` | static |
| `values` (from `Sim.VALUES` bank) | never | static |
| `worldview` (from `Sim.WORLDVIEW_BELIEFS` bank) | never | static |
| `beliefs` (situational stances, not memories) | confidence can be revised | never — array only grows |
| `memories` (episodic pointers into `world.events`) | — | yes, computed live (`memoryStrength`) |
| `needs` (`safety`/`sustenance`/`belonging`) | only drops, two triggers total | never regenerates |
| `emotions` (transient) | — | yes, computed live, capped at 20 entries |
| `relationships` (`trust`/`affection`/`fear`/`grievance`) | fully event-driven | no passive decay |
| `goals` (`current`/`future`) | current ↔ future via `reassessGoals` | — |

Absence from `values`/`worldview` means indifference, not opposition —
`getValueWeight`/`getWorldviewWeight` return `0` for anything not present, and that's
a real, intentional default.

**Beliefs vs. memories vs. worldview**, precisely (see `PERSON-MODEL.md` for the full
writeup): a memory is a pointer to an event you witnessed; a belief is a propositional
stance about a specific incident ("Mara stole bread"), formed either by witnessing
(100% confidence) or by being told/overhearing a claim (confidence derived from trust
+ `GeneralizedTrust` worldview, then possibly overridden by `checkContradiction()` or
discounted/boosted by `findConflictingBeliefs()`); a worldview entry is a durable
conviction about how the world works in general ("might is right"), not tied to any
one incident.

**Decide/act.** `decideAndAct()` is a small utility-AI: it scores candidate reactions
(do nothing / attack / press for explanation / tell a confidant / retreat) from the
witness's current relationship, emotion, and worldview state, and takes the
highest-scoring one. `witness.mind.log` records what was considered and why, for the
in-app mind inspector.

## Known gaps (see PERSON-MODEL.md for the full list)

`PERSON-MODEL.md` tracks stubs and intentionally-deferred work in detail — check it
before assuming an unwired-looking piece (e.g. `belonging`, `ReplenishFood`) is a bug
rather than a documented gap. Headline items: Personality/Values/Worldview are meant
to be "sticky, not static" eventually (Phase 2, not yet designed); beliefs never decay
or get pruned; needs never regenerate; `belonging` has no triggers at all;
`ReplenishFood` goals are created but never read.

When the person model changes, update `PERSON-MODEL.md` in the same change — the
project treats drift between it and `sim.js` as a bug in one or the other.
