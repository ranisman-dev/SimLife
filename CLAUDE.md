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

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Tiny Town**

Tiny Town is a prototype for a "beliefs, not scripts" simulation architecture: every
action — the player's or an NPC's — runs through the same perceive → believe → decide
→ act pipeline, and the engine never special-cases per scenario, only asking "what is
true, who knows it, what do they want, and what can they do about it?" The current
build is a small proving ground (5 NPCs, one location, five generic verbs) for that
architecture; the long-term goal is a fully living world.

**Core Value:** An entire world — not just NPCs — reacts unscripted to what anyone in it does, player
and NPC alike, with real, lasting consequences (ecological, economic, social) rather
than flavor text.

### Constraints

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
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- JavaScript (ES6+, browser-native, no transpilation) - `sim.js`, `parser.js`, `presentation.js`
- HTML5 - `index.html` (single-page shell, no templating engine)
- CSS3 - `style.css` (hand-written, no preprocessor, no CSS framework)
- Markdown - `CLAUDE.md`, `PERSON-MODEL.md`, `README.md` (project documentation, not code)
## Runtime
- Browser (any modern evergreen browser) - the actual runtime target. Scripts load via plain `<script src="...">` tags in `index.html`, no `type="module"`, so all three files share one global scope in load order: `sim.js` → `parser.js` → `presentation.js`.
- Node.js (incidental, dev-only) - `sim.js` and `parser.js` each end with a dual-export guard:
- Local Node version observed in this environment: v24.11.1 (not pinned anywhere in the repo — no `.nvmrc`, no `engines` field, because there's no `package.json`).
- None. There is no `package.json`, `package-lock.json`, `yarn.lock`, or `node_modules/`. Zero third-party dependencies of any kind.
- Lockfile: not applicable (no packages to lock).
## Frameworks
- None. `presentation.js` does direct DOM manipulation (`document.getElementById`, `.innerHTML` template strings, manual event listeners) with no view framework (no React/Vue/Svelte).
- None. No test runner, no test files, no assertion library. `CLAUDE.md` states explicitly: "There is no test suite, linter, or build command in this repo." The only verification observed is ad-hoc Node `require()` smoke checks (see `.claude/settings.local.json`), not a formal test suite.
- None. No bundler (no Webpack/Vite/esbuild/Rollup), no transpiler (no Babel/TypeScript compiler), no CSS preprocessor, no linter/formatter config (no `.eslintrc*`, no `.prettierrc*`).
- Dev server is any static file server; `CLAUDE.md` and `README.md` both document `python3 -m http.server 8000` as the convention. Opening `index.html` directly via `file://` also works since there is zero server-side code.
## Key Dependencies
- None (zero runtime dependencies — no npm packages, no vendored libraries, no CDN-loaded scripts). `index.html` loads only the project's own three `<script>` tags and its own `style.css`; there are no `<link>`/`<script>` tags pointing at any external host.
- Not applicable — no server, no database client, no ORM, no HTTP client library. `sim.js` is pure in-memory state (a `world` object) with no persistence layer.
## Configuration
- No environment variables, no `.env` files, no runtime config files. All tunable constants (e.g. `MAX_REACTION_DEPTH`, decay rates, value/worldview banks) are hard-coded directly in `sim.js` as module-level `const`s.
- `.claude/settings.local.json` configures Claude Code's own tool permissions for this repo (allowlists specific `node -e` invocations); it is not application configuration.
- None. No `tsconfig.json`, `webpack.config.js`, `vite.config.js`, or similar. `index.html` is the only "build artifact," and it's hand-written, not generated.
## Platform Requirements
- Any machine with a modern browser and (optionally) Python 3 or Node.js installed to serve static files locally. Confirmed present in this environment: Python 3.14.0, Node v24.11.1 — neither is a hard requirement of the project itself.
- No OS-specific tooling; the codebase is platform-agnostic static assets.
- Static file hosting only (e.g. GitHub Pages, Netlify, S3, or any plain web server capable of serving HTML/CSS/JS). No server runtime, no database, no deployment pipeline currently exists in the repo (no `.github/workflows`, no other CI config found).
- Git remote: `https://github.com/ranisman-dev/SimLife.git` (GitHub, no CI/CD configured against it at this time).
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Lowercase, single word, no separators: `sim.js`, `parser.js`, `presentation.js`, `style.css`, `index.html`.
- Documentation files are UPPERCASE with hyphens: `PERSON-MODEL.md`, `CLAUDE.md`, `README.md`.
- `camelCase`, verb-first for actions/mutators: `performAction`, `applyEffects`, `checkPreconditions`, `pushEmotion`, `adjustNeed`, `resolveGoal`.
- Predicate/boolean-returning functions read as questions or state checks: `believesDead(agent, id)`, `coLocated(world, aId, bId)`.
- Getter-style helpers prefixed `get`: `getAgent`, `getValueWeight`, `getWorldviewWeight`.
- Internal/private helpers are not exported and are declared as top-level `function` statements in `sim.js` (not arrow functions assigned to `const`) — e.g. `relOf`, `generalCareOf`, `appraiseEvent`, `reassessGoals`. Reserve `const fn = (...) => {}` arrow syntax for short inline callbacks passed to `.map`/`.filter`/`.reduce`, not for named top-level functions.
- `camelCase` throughout: `witnessId`, `priorRelationship`, `effectiveConfidence`, `landedSeverity`.
- Short, local scratch names are fine for tight scopes: `m` for `agent.mind`, `a`/`b` in `Array.find`/`filter` predicates, `rel` for a relationship object.
- Booleans read as predicates without a `is`/`has` prefix requirement, but use one when it clarifies: `isVictim`, `isPlayer`, `contradicted`, `truthful`, `contested`.
- Module-level constant data structures are `UPPER_SNAKE_CASE`: `LOCATIONS`, `VERBS`, `VALUES`, `WORLDVIEW_BELIEFS`, `PREDICATE_LABELS`, `EMOTION_HALFLIFE_TICKS`, `MAX_REACTION_DEPTH`.
- A mutable module-level counter is lowerCamelCase even though declared with `let` at module scope: `reactionDepth` in `sim.js:185`. This is the one intentional piece of module-level mutable state (a recursion-depth guard, reset via increment/decrement in a `try/finally`) — do not add more module-level mutable state without equally tight scoping.
- No classes anywhere in the codebase. Predicate names for beliefs use `snake_case` strings, not code identifiers: `'stole_from'`, `'is_dead'`, `'is_trustworthy'`, `'is_dangerous'`, `'provoked'`. Event/action-derived belief predicates use a `did:` prefix + PascalCase verb: `` `did:${event.verb}` `` (e.g. `did:Take`).
- Verb names themselves (`VERBS` array, `event.verb`, `checkPreconditions`/`applyEffects` switch cases) are PascalCase strings: `'Take'`, `'Give'`, `'Attack'`, `'Tell'`, `'Move'`.
## Code Style
- No formatter (Prettier/Biome) or linter (ESLint) is configured — no config files present for either. Style is maintained by hand; match surrounding code exactly rather than relying on a formatter.
- 2-space indentation throughout `sim.js`, `parser.js`, `presentation.js`.
- Semicolons used consistently — every statement terminated.
- Single quotes for strings (`'square'`, `'Take'`); template literals (backticks) used for any string with interpolation or embedded HTML, never string concatenation with `+`.
- Object/array literals use trailing commas only when multi-line; single-line literals omit them.
- Lines are allowed to run long (well past 100 chars) when it keeps a compound expression or template literal together — e.g. `sim.js:474` (a single filter/map chain). Not a hard-wrapped codebase.
- `switch` statements use `case 'X': { ... }` block scoping with an early `return` in each case, no `break` needed — see `checkPreconditions` and `applyEffects` in `sim.js:215-294`.
- Single-line `if` guard clauses without braces are common for early returns: `if (!a) throw new Error(...)`, `if (impact === 0) return;`.
## Import Organization
- No ES modules, no bundler, no `import`/`export` keywords. Plain browser globals loaded via `<script>` tags in dependency order in `index.html:59-61`: `sim.js` → `parser.js` → `presentation.js`.
- Each file exposes its public surface via a single object literal assigned at the bottom of the file (`const Sim = {...}`, `const Parser = {...}`), then dual-registered for both environments:
- `presentation.js` consumes `Sim` and `Parser` as ambient globals (no `require`/`import` — this file has no Node-side use, browser-only).
## Error Handling
- `throw new Error(...)` only for truly-should-never-happen states, e.g. `getAgent` throwing on an unknown agent id (`sim.js:170`). This is the sole `throw` site in the codebase.
- Action validation returns a `{ ok: boolean, reason?: string }` shape from `checkPreconditions`, and `performAction` returns `{ success: boolean, reason?: string }` or `{ success: true, event }`. Callers (`parser.js` via `presentation.js`) branch on `.success`/`.error`, never on try/catch, for expected failure paths like "not enough bread" or "Mara isn't here."
- `parser.js` mirrors this with `{ error: string }` return objects for unparseable input rather than throwing — see every early return in `parseCommand`.
- Prefer this pattern for any new verb or parser branch: return a reason string, do not throw, unless the condition is a genuine invariant violation (unknown agent id) rather than a normal "this action doesn't apply right now" case.
## Comments
- Comments are dense and load-bearing throughout `sim.js` — this is a codebase where *why* a formula uses the coefficients it does is written down, not left implicit. New logic that encodes a psychological/behavioral tradeoff (why Loyalty discounts an accusation, why an average-boldness witness reproduces the old flat baseline, etc.) should get a comment explaining the reasoning, not just what the code does.
- File-top comments state ownership boundaries as enforceable rules, not just descriptions — see the first lines of `sim.js`, `parser.js`, `presentation.js`. When adding a new top-level file, add an equivalent header comment declaring what it owns and what it must never touch (e.g. "no DOM references belong here").
- Section-divider comments use a consistent `// ── Label ──` banner style to mark logical regions within `sim.js` (e.g. `// ── Action pipeline...`, `// ── Perception → belief formation`, `// ── Decide + Act...`). Use this style, not `/* ... */` blocks, when adding a new logical section to a large file.
## Function Design
- Positional parameters for required, load-bearing arguments (`world`, `witness`/`actor`, `event`), consistently ordered `world` first when present.
- An `opts = {}` trailing options object is used for optional/rarely-set parameters: `performAction(world, actorId, verb, params = {}, opts = {})`, `makeAgent(id, name, opts = {})`. Follow this pattern (not more positional args) when adding an optional parameter to an existing function signature.
- Functions that represent a validation/action outcome return a small object literal with a boolean discriminant field (`ok`, `success`, `contradicted`) plus context fields — never a bare boolean when the caller needs a reason too.
- Functions that compute a pure derived number return that number directly (`clamp`, `memoryStrength`, `activeEmotionIntensity`, `generalCareOf`) — no wrapper object for pure numeric helpers.
## Module Design
- One export object per file (`Sim`, `Parser`), built as a literal at the bottom of the file listing only the intended public surface — internal helpers (`relOf`, `appraiseEvent`, `checkContradiction`, etc.) are not exported and stay module-private via closure/hoisting within the script.
- When adding a new public capability to `sim.js`, add it to the `Sim` object literal (`sim.js:1031-1041`) rather than exporting ad hoc from elsewhere.
- `sim.js` owns and mutates all world/agent state; `presentation.js` never mutates state directly, only calls `Sim.performAction` and reads through `Sim`'s public getters — enforced by convention/comment, not by any technical guard (no `Object.freeze`, no private fields). Preserve this asymmetry: new DOM-facing code goes in `presentation.js` and reads state, new state mutation goes in `sim.js` behind `performAction`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
```
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
- Single entry point for all world mutation: `performAction()` (`sim.js:188`)
- Generic verbs only — five total (`Take`, `Give`, `Attack`, `Tell`,
- Perception is uniform: any agent co-located with an event's actor
- Reactions are themselves actions through the same pipeline — an NPC's
- No object-oriented class hierarchy — agents are plain data objects
- No persistence layer — `world` lives only in memory for the browser
## Layers
- Purpose: objective world state, the five generic verbs, perception →
- Location: `sim.js`
- Contains: `createWorld`, `performAction`, `checkPreconditions`,
- Depends on: nothing — pure JS, no DOM references (enforced by a comment
- Used by: `parser.js` (reads `world.agents` to resolve names) and
- Enforced boundary: "No DOM references belong here" — the file's own
- Purpose: translate a typed player sentence into the same
- Location: `parser.js`
- Contains: `parseCommand()` and regex-based sentence matching for each
- Depends on: reads `world.agents` (via `findAgentId`) to resolve name
- Used by: `presentation.js`, which calls `Parser.parseCommand()` then
- Purpose: the only file allowed to touch the DOM
- Location: `presentation.js`
- Contains: render functions (`renderWorld`, `renderLog`, `renderMind`),
- Depends on: `Sim`'s public API (`Sim.createWorld`, `Sim.performAction`,
- Used by: nothing — it is the top of the dependency chain, wired to
- Enforced boundary: "reads Sim's world state... never mutates world state
## Data Flow
### Primary Action Path (player or NPC)
### Belief Formation Sub-flow (within `perceiveEvent`)
## Key Abstractions
- Purpose: the uniform shape both `Parser.parseCommand()` output and
- Examples: `parser.js:43` (`Take`), `sim.js:930` (`Tell`)
- Pattern: the "Player/NPC intent → Action request" step made literal
- Purpose: the sole objective record of what happened; ground truth that
- Examples: constructed at `sim.js:197-207`
- Pattern: append-only log (`world.events`), never mutated after creation
- Purpose: a propositional stance about a specific incident, distinct
- Examples: pushed at `sim.js:429-438` (witnessed) and `sim.js:719-729`
- Pattern: array only grows, never pruned or decayed (documented gap)
- Purpose: separates static/never-mutated traits (`personality`,
- Examples: initialized in `makeAgent()` (`sim.js:54-72`)
- Pattern: see `PERSON-MODEL.md` for exact mutability/decay rules per box
- Purpose: `decideAndAct()`'s scoring unit — each candidate reaction
- Examples: `sim.js:851-856` (do nothing), `sim.js:895-910` (attack)
- Pattern: candidates collected into an array, sorted by `score`, highest
## Entry Points
- Location: `index.html:59-61` (script tags), `presentation.js:286`
- Triggers: browser loading the static page (via HTTP server or
- Responsibilities: loads `sim.js` → `parser.js` → `presentation.js` in
- Location: `sim.js:188`
- Triggers: player command submission (`presentation.js:245`) or an
- Responsibilities: the single, uniform mutation entry point described in
- Location: `presentation.js:230`
- Triggers: `command-form` submit event (`presentation.js:264`)
- Responsibilities: reads the input box, calls `Parser.parseCommand`,
## Architectural Constraints
- **Threading:** Single-threaded, synchronous, event-loop driven (plain
- **Global/module state:** `reactionDepth` in `sim.js:185` is a
- **Circular imports:** None — plain `<script>` tag load order
- **Reaction recursion depth:** Hard-capped at `MAX_REACTION_DEPTH = 4`
- **No verb extensibility hook:** `VERBS` (`sim.js:11`),
## Anti-Patterns
### DOM references inside `sim.js`
### Mutating `world` state outside `Sim.performAction()`
### Special-casing behavior per scenario/verb name
## Error Handling
- `checkPreconditions()` returns `{ ok: false, reason }` for expected
- `Parser.parseCommand()` returns `{ error }` for unparseable input
- `getAgent()` throws `Error('Unknown agent: <id>')` (`sim.js:168-172`)
- `presentation.js` surfaces both `parsed.error` and `result.reason` to
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
