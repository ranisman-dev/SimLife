<!-- refreshed: 2026-08-12 -->
# Architecture

**Analysis Date:** 2026-08-12

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                        │
│              (DOM only — never mutates world)                │
│                  `presentation.js`                            │
└──────────────────┬─────────────────────────┬─────────────────┘
                    │ typed sentence          │ reads state via
                    ▼                         │ Sim.* public API
┌───────────────────────────────┐             │
│      Parser (intent layer)    │             │
│  sentence -> {verb, params}   │             │
│         `parser.js`           │             │
└──────────────────┬─────────────┘             │
                    │ {verb, params}            │
                    ▼                           │
┌─────────────────────────────────────────────────────────────┐
│                     Engine (sim.js)                           │
│  Sim.performAction(world, actorId, verb, params)              │
│  ── the single entry point for player AND NPC actions ──      │
│                                                                 │
│  checkPreconditions → applyEffects → push event                │
│        → computeWitnesses → perceiveEvent (per witness)        │
│              → appraiseEvent / belief formation                │
│              → decideAndAct (NPC reacts, may recurse)          │
└──────────────────┬─────────────────────────────────────────────┘
                    │ mutates
                    ▼
┌─────────────────────────────────────────────────────────────┐
│              World State (in-memory object)                  │
│   `world.agents`, `world.events`, `world.tick`                │
│   each NPC's `mind` (9 boxes — see PERSON-MODEL.md)            │
└─────────────────────────────────────────────────────────────┘
```

No network, no persistence, no build step. The entire system is three
`<script>` tags loaded in order (`sim.js`, `parser.js`, `presentation.js`)
by `index.html`, running against one mutable `world` object held in a
module-level variable in `presentation.js`. There is no backend, no
database, no API layer — "architecture" here means the internal pipeline
and layer boundaries within a single-page static app.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Engine | World state, five verbs, perception, belief formation, NPC decide/act loop | `sim.js` |
| Parser | Player sentence → `{verb, params}` action request | `parser.js` |
| Presentation | DOM rendering, player input wiring, debug report generation | `presentation.js` |
| Page shell | Static HTML structure, script load order | `index.html` |
| Styling | Visual layout only, no behavior | `style.css` |
| Person-model reference | Authoritative doc for exact mind-box formulas/hooks | `PERSON-MODEL.md` |

## Pattern Overview

**Overall:** Single shared action pipeline ("beliefs, not scripts"). Every
state change in the simulation — whether initiated by the human player
typing a sentence or an NPC reacting autonomously — funnels through one
function, `performAction()` in `sim.js`. There is no separate "player
action handler" vs. "NPC action handler"; parser output and NPC-generated
action requests are structurally identical (`{ verb, params }`).

**Key Characteristics:**
- Single entry point for all world mutation: `performAction()` (`sim.js:188`)
- Generic verbs only — five total (`Take`, `Give`, `Attack`, `Tell`,
  `Move`), no per-scenario or per-quest verbs (`sim.js:11`)
- Perception is uniform: any agent co-located with an event's actor
  witnesses it (`computeWitnesses`, `sim.js:296`) and every witness runs
  the same `perceiveEvent` pipeline, regardless of whether the actor was
  the player or an NPC
- Reactions are themselves actions through the same pipeline — an NPC's
  `decideAndAct()` calls `performAction()` again, which can produce new
  witnessed events and cascade further reactions, bounded by
  `MAX_REACTION_DEPTH = 4` via the module-level `reactionDepth` counter
  (`sim.js:185-186`)
- No object-oriented class hierarchy — agents are plain data objects
  (`makeAgent()`, `sim.js:44`) and all behavior lives in free functions
  operating on `world`/`agent` parameters
- No persistence layer — `world` lives only in memory for the browser
  session; "Reset town" simply calls `Sim.createWorld()` again
  (`presentation.js:265-266`)

## Layers

**Engine (`sim.js`):**
- Purpose: objective world state, the five generic verbs, perception →
  belief formation, and a small utility-AI decide/act loop
- Location: `sim.js`
- Contains: `createWorld`, `performAction`, `checkPreconditions`,
  `applyEffects`, `computeWitnesses`, `perceiveEvent`, `appraiseEvent`,
  `applyClaimBelief`, `decideAndAct`, and all mind-box helpers
- Depends on: nothing — pure JS, no DOM references (enforced by a comment
  at the top of the file, `sim.js:1-4`)
- Used by: `parser.js` (reads `world.agents` to resolve names) and
  `presentation.js` (calls the public `Sim` API)
- Enforced boundary: "No DOM references belong here" — the file's own
  top-of-file comment

**Parser (`parser.js`):**
- Purpose: translate a typed player sentence into the same
  `{ verb, params }` shape NPCs generate internally
- Location: `parser.js`
- Contains: `parseCommand()` and regex-based sentence matching for each
  verb/claim shape, plus `EXAMPLES` used both for parsing self-tests and
  the UI's clickable example list
- Depends on: reads `world.agents` (via `findAgentId`) to resolve name
  tokens to agent ids; does not import `Sim` and does not call
  `performAction` itself
- Used by: `presentation.js`, which calls `Parser.parseCommand()` then
  feeds the result into `Sim.performAction()`

**Presentation (`presentation.js`):**
- Purpose: the only file allowed to touch the DOM
- Location: `presentation.js`
- Contains: render functions (`renderWorld`, `renderLog`, `renderMind`),
  the debug-report builder (`buildDebugReport`), and event wiring (`init`)
- Depends on: `Sim`'s public API (`Sim.createWorld`, `Sim.performAction`,
  `Sim.getAgent`, `Sim.PREDICATE_LABELS`, `Sim.memoryStrength`,
  `Sim.LOCATIONS`) and `Parser.parseCommand`
- Used by: nothing — it is the top of the dependency chain, wired to
  `DOMContentLoaded` at the bottom of the file (`presentation.js:286`)
- Enforced boundary: "reads Sim's world state... never mutates world state
  directly" — the file's own top-of-file comment; in practice this holds
  because all mutation happens through `Sim.performAction`, and rendering
  only reads `world.*` and calls `Sim.*` getters

## Data Flow

### Primary Action Path (player or NPC)

1. **Intent formed.** Player: typed sentence goes through
   `Parser.parseCommand(world, 'player', raw)` (`parser.js:32`), returning
   `{ verb, params }` or `{ error }`. NPC: a candidate chosen by
   `decideAndAct()`'s scoring already carries a closure that calls
   `performAction` directly (`sim.js:906`, `sim.js:930`, `sim.js:960`,
   `sim.js:978`).
2. **Single entry point.** `presentation.js:245` (player) or the NPC
   candidate's `action(why)` closure (`sim.js:997`) calls
   `Sim.performAction(world, actorId, verb, params, opts)`
   (`sim.js:188`).
3. **Precondition check.** `checkPreconditions()` (`sim.js:215`) validates
   the verb-specific rules (co-location, inventory quantity, target
   alive, valid destination, etc.). Failure returns `{ success: false,
   reason }` without mutating state.
4. **Effect application.** `applyEffects()` (`sim.js:254`) mutates
   inventories/health/location and returns `{ data, location }` describing
   what happened. This is also where two need triggers live inline: bread
   hitting zero drops `sustenance` and queues a `ReplenishFood` goal;
   being attacked drops `safety`.
5. **Event recorded.** A new `event` object (`id`, `tick`, `verb`,
   `actor`, `location`, `data`, `causedBy`, `why`) is pushed onto
   `world.events` (`sim.js:197-207`). `world.tick` increments here.
6. **Witnesses computed.** `computeWitnesses()` (`sim.js:296`) returns
   every other living agent co-located at `event.location` (empty if the
   event happened at `'away'`, which nobody perceives).
7. **Perception, per witness.** `perceiveEvent()` (`sim.js:422`) runs for
   each witness id:
   - Skips entirely for the player (`witness.isPlayer` short-circuit,
     `sim.js:424`) — the player forms no beliefs, only the UI event log.
   - Appraises impact (`appraiseEvent`, `sim.js:472`), forms a memory
     (`addMemory`), pushes a 100%-confidence witnessed belief
     (`sim.js:429-438`).
   - Updates relationship state from the appraisal (`applyAppraisal`,
     `sim.js:497`).
   - If the event was a `Tell` directed at or overheard by this witness,
     forms a claim-belief with confidence derived from trust +
     `GeneralizedTrust` (`applyClaimBelief`, `sim.js:663`).
   - Runs `decideAndAct()` (`sim.js:839`) unless this witness already
     reacted to this exact event id or the reaction-depth cap is hit
     (`sim.js:461-469`).
8. **Reaction, possibly recursive.** `decideAndAct()` scores candidate
   reactions and, if the best one is an action (not "do nothing"), calls
   its closure — which re-enters `performAction()` at step 2, producing a
   new event that can itself be witnessed and reacted to, up to
   `MAX_REACTION_DEPTH` (4) deep.
9. **Render.** `presentation.js` calls `renderAll()` after the top-level
   `performAction` call returns, re-reading the now-mutated `world` to
   redraw the world panel, event log, and inspected mind panel.

### Belief Formation Sub-flow (within `perceiveEvent`)

1. Witnessed events always produce a `predicate: 'did:<Verb>'` belief at
   confidence `1.0`, source `'witnessed'` (`sim.js:429-438`). The actor of
   an event is excluded from its own witness list by construction
   (`computeWitnesses` excludes `event.actor`), so agents never get a
   witnessed belief about their own actions.
2. Claimed events (`Tell`) go through `applyClaimBelief()`
   (`sim.js:663`), which:
   - Checks `checkContradiction()` (`sim.js:537`) against ground truth
     (self-knowledge and eyewitness records only, not omniscience) —
     contradicted claims are pinned to confidence `0` and tagged
     `"<source> (known false)"`.
   - Checks `findConflictingBeliefs()` (`sim.js:653`) for competing
     accounts of the same incident, discounting/boosting confidence and
     tagging both sides `contested: true`.
   - Applies predicate-specific relationship effects
     (`stole_from`/`attacked`/`is_trustworthy`/`is_dangerous`/`provoked`).
   - Routes to `reactToBeingLiedTo()` or `reactToBeingMisattributed()`
     when the witness's own claim is contradicted.

**State Management:** All state lives in a single in-memory `world`
object, held as a module-level `let world` in `presentation.js:6`. No
external store, no serialization between sessions — `serializeWorld()`
(`presentation.js:134`) exists only to build the paste-back debug report,
not for persistence. Reset (`presentation.js:265-266`) simply discards
`world` and calls `Sim.createWorld()` again.

## Key Abstractions

**Action request `{ verb, params }`:**
- Purpose: the uniform shape both `Parser.parseCommand()` output and
  NPC-generated candidates in `decideAndAct()` produce, so
  `performAction()` never needs to know whether the actor is human
- Examples: `parser.js:43` (`Take`), `sim.js:930` (`Tell`)
- Pattern: the "Player/NPC intent → Action request" step made literal
  (`parser.js:3`)

**Event `{ id, tick, verb, actor, location, data, causedBy, why }`:**
- Purpose: the sole objective record of what happened; ground truth that
  `checkContradiction()` checks claims against
- Examples: constructed at `sim.js:197-207`
- Pattern: append-only log (`world.events`), never mutated after creation

**Belief `{ id, subject, predicate, data, confidence, source, tick, eventId, contested? }`:**
- Purpose: a propositional stance about a specific incident, distinct
  from a memory (pointer) or a worldview entry (durable general
  conviction) — see PERSON-MODEL.md for the full three-way distinction
- Examples: pushed at `sim.js:429-438` (witnessed) and `sim.js:719-729`
  (claimed)
- Pattern: array only grows, never pruned or decayed (documented gap)

**Mind box (nine parts of `mind`):**
- Purpose: separates static/never-mutated traits (`personality`,
  `values`, `worldview`) from event-driven state (`beliefs`,
  `relationships`, `goals`) from live-decaying state (`memories`,
  `emotions`) from need triggers (`needs`)
- Examples: initialized in `makeAgent()` (`sim.js:54-72`)
- Pattern: see `PERSON-MODEL.md` for exact mutability/decay rules per box
  — this file only enforces the boundary that all mind-box logic lives in
  `sim.js`

**Utility-AI candidate `{ action, label, score, terms }`:**
- Purpose: `decideAndAct()`'s scoring unit — each candidate reaction
  (do nothing / attack / press for explanation / tell confidant / retreat)
  carries a named-term breakdown (`terms`) that sums to `score`, so the
  displayed "why" explanation and the number actually used for ranking
  can never drift apart
- Examples: `sim.js:851-856` (do nothing), `sim.js:895-910` (attack)
- Pattern: candidates collected into an array, sorted by `score`, highest
  wins (`sim.js:985-986`); `explainTerms()` (`sim.js:829`) picks the
  winning candidate's top few non-trivial terms for display

## Entry Points

**`index.html` page load:**
- Location: `index.html:59-61` (script tags), `presentation.js:286`
  (`DOMContentLoaded` listener)
- Triggers: browser loading the static page (via HTTP server or
  `file://`)
- Responsibilities: loads `sim.js` → `parser.js` → `presentation.js` in
  order (load order matters — `parser.js` and `presentation.js` both
  assume `window.Sim` already exists), then `init()` wires all DOM event
  listeners and calls `renderAll()` for the first time

**`Sim.performAction()`:**
- Location: `sim.js:188`
- Triggers: player command submission (`presentation.js:245`) or an
  NPC's `decideAndAct()` candidate action (`sim.js:997`)
- Responsibilities: the single, uniform mutation entry point described in
  "Primary Action Path" above

**`submitCommand()`:**
- Location: `presentation.js:230`
- Triggers: `command-form` submit event (`presentation.js:264`)
- Responsibilities: reads the input box, calls `Parser.parseCommand`,
  calls `Sim.performAction`, surfaces errors, triggers `renderAll()`

## Architectural Constraints

- **Threading:** Single-threaded, synchronous, event-loop driven (plain
  browser JS, no workers, no async/await anywhere in the codebase). One
  `performAction()` call and its entire reaction cascade complete fully,
  synchronously, before control returns to the DOM event handler that
  triggered it.
- **Global/module state:** `reactionDepth` in `sim.js:185` is a
  module-level counter, not part of `world` — it is not reset by
  `Sim.createWorld()` and is shared across all calls into the module. In
  practice it always returns to 0 after each top-level `performAction`
  call (incremented/decremented in a `try/finally`, `sim.js:463-468`), so
  this is safe under the current single-threaded, non-concurrent usage
  but would be a bug source if `performAction` were ever called
  re-entrantly from outside its own reaction cascade (e.g. two
  simultaneous player actions). `world` itself is a module-level `let` in
  `presentation.js:6`, effectively a singleton for the whole page session.
- **Circular imports:** None — plain `<script>` tag load order
  (`sim.js` → `parser.js` → `presentation.js`) substitutes for a module
  system; each file attaches its public surface to `window` (`Sim`,
  `Parser`) and also exports via `module.exports` for potential Node
  usage (`sim.js:1044`, `parser.js:101`), though no test runner currently
  consumes that export path.
- **Reaction recursion depth:** Hard-capped at `MAX_REACTION_DEPTH = 4`
  (`sim.js:186`) to bound cascades — one action can cause witnesses to
  react, whose reactions can themselves be witnessed, etc. Beyond depth 4,
  further reactions are silently suppressed (the `if` guard at
  `sim.js:461` simply doesn't fire).
- **No verb extensibility hook:** `VERBS` (`sim.js:11`),
  `checkPreconditions`, and `applyEffects` are a fixed `switch` over five
  literal strings — adding a sixth verb requires touching all three,
  there is no verb-registration pattern.

## Anti-Patterns

### DOM references inside `sim.js`

**What happens:** Would be any `document.*` or `window.*` DOM access
placed inside `sim.js`.
**Why it's wrong:** Breaks the enforced engine/presentation boundary
(`sim.js:1-4`) and makes the engine untestable outside a browser (the
file already supports a `module.exports` path for Node, `sim.js:1044`,
which DOM access would silently break).
**Do this instead:** All rendering and DOM reads/writes belong in
`presentation.js` only; `sim.js` communicates outward exclusively through
return values and the `Sim` object's public API.

### Mutating `world` state outside `Sim.performAction()`

**What happens:** Would be `presentation.js` (or any future caller)
directly writing to `world.agents[x].inventory` or `world.events` instead
of calling `Sim.performAction`.
**Why it's wrong:** Bypasses `checkPreconditions`, event recording,
witness computation, and belief formation — the entire "beliefs, not
scripts" guarantee depends on every mutation going through one funnel.
**Do this instead:** `presentation.js`'s own top comment states the rule
directly: reads engine state through `sim.js`'s public API and "never
mutates world state directly." The only observed direct writes to
`world`/`agent` fields happen inside `sim.js` itself (`applyEffects`,
belief/relationship helpers).

### Special-casing behavior per scenario/verb name

**What happens:** Would be adding a check like
`if (params.item === 'magic sword') { ... }` or a bespoke quest-tracking
flag on `world`.
**Why it's wrong:** Directly violates the project's stated one rule
(README.md, CLAUDE.md): the simulation must never ask "what quest is the
player doing," only "what is true, who knows it, what do they want, what
can they do about it."
**Do this instead:** Any new behavior should be expressible as a
generic rule over the five verbs, appraisal, values, worldview, or
relationships — not a literal string match on an item/target name. (No
violation of this currently exists in the codebase; documented here
because it's the architecture's explicit central constraint.)

## Error Handling

**Strategy:** Result-object based, not exceptions, for expected failure
paths; exceptions reserved for programmer errors (unknown agent id).

**Patterns:**
- `checkPreconditions()` returns `{ ok: false, reason }` for expected
  validation failures (target not found, not co-located, insufficient
  inventory, etc.) — `performAction()` short-circuits and returns
  `{ success: false, reason }` without mutating state (`sim.js:192-193`)
- `Parser.parseCommand()` returns `{ error }` for unparseable input
  rather than throwing, with a randomized example suggestion
  (`parser.js:96`)
- `getAgent()` throws `Error('Unknown agent: <id>')` (`sim.js:168-172`)
  for a genuinely-impossible id lookup — the one place a real exception
  is used, since this indicates a bug rather than expected user input
- `presentation.js` surfaces both `parsed.error` and `result.reason` to
  the user via a dedicated `#action-result` element styled with
  `.is-error` (`presentation.js:239-250`)

## Cross-Cutting Concerns

**Logging:** No `console.log`-based logging. Instead, every NPC decision
is recorded into `mind.log` (`sim.js:71`, pushed throughout
`decideAndAct`, `reassessGoals`, `reactToBeingLiedTo`, etc.) as a
human-readable decision trail, surfaced in the UI's mind inspector
(`presentation.js:106-108`) and the full debug report
(`presentation.js:195-199`).

**Validation:** Entirely precondition-based at the `checkPreconditions()`
step (`sim.js:215`) — no schema library, no separate validation layer.
Parser-side validation (agent name resolution, regex matching) happens in
`parser.js` before an action request ever reaches the engine.

**Provenance/explainability:** `event.why` and `mind.log[].why`
(`sim.js:987`, built by `explainTerms()`, `sim.js:829`) are a deliberate
cross-cutting concern — every scored decision carries a human-readable
summary of its top-weighted named terms, purely for display (never read
back into scoring), surfaced in the event log (`presentation.js:40`), the
mind inspector's decision log (`presentation.js:107`), and the debug
report (`presentation.js:146,197`).

---

*Architecture analysis: 2026-08-12*
