# Coding Conventions

**Analysis Date:** 2026-08-12

## Naming Patterns

**Files:**
- Lowercase, single word, no separators: `sim.js`, `parser.js`, `presentation.js`, `style.css`, `index.html`.
- Documentation files are UPPERCASE with hyphens: `PERSON-MODEL.md`, `CLAUDE.md`, `README.md`.

**Functions:**
- `camelCase`, verb-first for actions/mutators: `performAction`, `applyEffects`, `checkPreconditions`, `pushEmotion`, `adjustNeed`, `resolveGoal`.
- Predicate/boolean-returning functions read as questions or state checks: `believesDead(agent, id)`, `coLocated(world, aId, bId)`.
- Getter-style helpers prefixed `get`: `getAgent`, `getValueWeight`, `getWorldviewWeight`.
- Internal/private helpers are not exported and are declared as top-level `function` statements in `sim.js` (not arrow functions assigned to `const`) — e.g. `relOf`, `generalCareOf`, `appraiseEvent`, `reassessGoals`. Reserve `const fn = (...) => {}` arrow syntax for short inline callbacks passed to `.map`/`.filter`/`.reduce`, not for named top-level functions.

**Variables:**
- `camelCase` throughout: `witnessId`, `priorRelationship`, `effectiveConfidence`, `landedSeverity`.
- Short, local scratch names are fine for tight scopes: `m` for `agent.mind`, `a`/`b` in `Array.find`/`filter` predicates, `rel` for a relationship object.
- Booleans read as predicates without a `is`/`has` prefix requirement, but use one when it clarifies: `isVictim`, `isPlayer`, `contradicted`, `truthful`, `contested`.

**Constants:**
- Module-level constant data structures are `UPPER_SNAKE_CASE`: `LOCATIONS`, `VERBS`, `VALUES`, `WORLDVIEW_BELIEFS`, `PREDICATE_LABELS`, `EMOTION_HALFLIFE_TICKS`, `MAX_REACTION_DEPTH`.
- A mutable module-level counter is lowerCamelCase even though declared with `let` at module scope: `reactionDepth` in `sim.js:185`. This is the one intentional piece of module-level mutable state (a recursion-depth guard, reset via increment/decrement in a `try/finally`) — do not add more module-level mutable state without equally tight scoping.

**Types/predicates (data, not classes):**
- No classes anywhere in the codebase. Predicate names for beliefs use `snake_case` strings, not code identifiers: `'stole_from'`, `'is_dead'`, `'is_trustworthy'`, `'is_dangerous'`, `'provoked'`. Event/action-derived belief predicates use a `did:` prefix + PascalCase verb: `` `did:${event.verb}` `` (e.g. `did:Take`).
- Verb names themselves (`VERBS` array, `event.verb`, `checkPreconditions`/`applyEffects` switch cases) are PascalCase strings: `'Take'`, `'Give'`, `'Attack'`, `'Tell'`, `'Move'`.

## Code Style

**Formatting:**
- No formatter (Prettier/Biome) or linter (ESLint) is configured — no config files present for either. Style is maintained by hand; match surrounding code exactly rather than relying on a formatter.
- 2-space indentation throughout `sim.js`, `parser.js`, `presentation.js`.
- Semicolons used consistently — every statement terminated.
- Single quotes for strings (`'square'`, `'Take'`); template literals (backticks) used for any string with interpolation or embedded HTML, never string concatenation with `+`.
- Object/array literals use trailing commas only when multi-line; single-line literals omit them.

**Line length / density:**
- Lines are allowed to run long (well past 100 chars) when it keeps a compound expression or template literal together — e.g. `sim.js:474` (a single filter/map chain). Not a hard-wrapped codebase.

**Braces:**
- `switch` statements use `case 'X': { ... }` block scoping with an early `return` in each case, no `break` needed — see `checkPreconditions` and `applyEffects` in `sim.js:215-294`.
- Single-line `if` guard clauses without braces are common for early returns: `if (!a) throw new Error(...)`, `if (impact === 0) return;`.

## Import Organization

**Module system:**
- No ES modules, no bundler, no `import`/`export` keywords. Plain browser globals loaded via `<script>` tags in dependency order in `index.html:59-61`: `sim.js` → `parser.js` → `presentation.js`.
- Each file exposes its public surface via a single object literal assigned at the bottom of the file (`const Sim = {...}`, `const Parser = {...}`), then dual-registered for both environments:
  ```javascript
  if (typeof window !== 'undefined') window.Sim = Sim;
  if (typeof module !== 'undefined') module.exports = Sim;
  ```
  This dual-registration is what makes ad hoc Node-based headless verification scripts possible (see `TESTING.md`) — preserve it any time `sim.js` or `parser.js` is edited; it is not decorative.
- `presentation.js` consumes `Sim` and `Parser` as ambient globals (no `require`/`import` — this file has no Node-side use, browser-only).

**No path aliases** — none needed, no module resolution beyond script tag order.

## Error Handling

**Fatal/programmer errors:**
- `throw new Error(...)` only for truly-should-never-happen states, e.g. `getAgent` throwing on an unknown agent id (`sim.js:170`). This is the sole `throw` site in the codebase.

**Expected/domain failures — result objects, not exceptions:**
- Action validation returns a `{ ok: boolean, reason?: string }` shape from `checkPreconditions`, and `performAction` returns `{ success: boolean, reason?: string }` or `{ success: true, event }`. Callers (`parser.js` via `presentation.js`) branch on `.success`/`.error`, never on try/catch, for expected failure paths like "not enough bread" or "Mara isn't here."
- `parser.js` mirrors this with `{ error: string }` return objects for unparseable input rather than throwing — see every early return in `parseCommand`.
- Prefer this pattern for any new verb or parser branch: return a reason string, do not throw, unless the condition is a genuine invariant violation (unknown agent id) rather than a normal "this action doesn't apply right now" case.

**No global error boundary / no try-catch around rendering** — `presentation.js` assumes `Sim`/`Parser` calls succeed structurally and only checks the `.success`/`.error` result shape.

## Comments

**When to comment:**
- Comments are dense and load-bearing throughout `sim.js` — this is a codebase where *why* a formula uses the coefficients it does is written down, not left implicit. New logic that encodes a psychological/behavioral tradeoff (why Loyalty discounts an accusation, why an average-boldness witness reproduces the old flat baseline, etc.) should get a comment explaining the reasoning, not just what the code does.
- File-top comments state ownership boundaries as enforceable rules, not just descriptions — see the first lines of `sim.js`, `parser.js`, `presentation.js`. When adding a new top-level file, add an equivalent header comment declaring what it owns and what it must never touch (e.g. "no DOM references belong here").
- Section-divider comments use a consistent `// ── Label ──` banner style to mark logical regions within `sim.js` (e.g. `// ── Action pipeline...`, `// ── Perception → belief formation`, `// ── Decide + Act...`). Use this style, not `/* ... */` blocks, when adding a new logical section to a large file.

**JSDoc/TSDoc:** Not used anywhere — no `@param`/`@returns` blocks. Plain prose comments above functions/blocks explain intent instead. No TypeScript, no type annotations of any kind (plain JS throughout).

**TODO/FIXME:** None found in the codebase (`grep` for `TODO|FIXME|HACK|XXX` returns nothing in `sim.js`, `parser.js`, `presentation.js`). Known gaps and deferred work are tracked in prose in `PERSON-MODEL.md` instead of inline TODO markers — follow this pattern: document a deliberately-deferred piece of behavior in `PERSON-MODEL.md`'s "known gaps" section rather than leaving a TODO comment in code.

## Function Design

**Size:** Functions are generally single-purpose and run 10-60 lines; the largest (`decideAndAct`, `sim.js:839-998`, and `applyClaimBelief`, `sim.js:663-815`) are long because they enumerate multiple weighted scoring branches, not because of unrelated responsibilities mixed together. When a function's cyclomatic complexity grows from more scoring terms, keep it as one function with clearly comment-separated branches rather than fragmenting into many tiny indirection-only helpers — this matches the existing style in `decideAndAct`.

**Parameters:**
- Positional parameters for required, load-bearing arguments (`world`, `witness`/`actor`, `event`), consistently ordered `world` first when present.
- An `opts = {}` trailing options object is used for optional/rarely-set parameters: `performAction(world, actorId, verb, params = {}, opts = {})`, `makeAgent(id, name, opts = {})`. Follow this pattern (not more positional args) when adding an optional parameter to an existing function signature.

**Return values:**
- Functions that represent a validation/action outcome return a small object literal with a boolean discriminant field (`ok`, `success`, `contradicted`) plus context fields — never a bare boolean when the caller needs a reason too.
- Functions that compute a pure derived number return that number directly (`clamp`, `memoryStrength`, `activeEmotionIntensity`, `generalCareOf`) — no wrapper object for pure numeric helpers.

## Module Design

**Exports:**
- One export object per file (`Sim`, `Parser`), built as a literal at the bottom of the file listing only the intended public surface — internal helpers (`relOf`, `appraiseEvent`, `checkContradiction`, etc.) are not exported and stay module-private via closure/hoisting within the script.
- When adding a new public capability to `sim.js`, add it to the `Sim` object literal (`sim.js:1031-1041`) rather than exporting ad hoc from elsewhere.

**No barrel files** — only 3 JS files total, no need for re-export indirection.

**State ownership:**
- `sim.js` owns and mutates all world/agent state; `presentation.js` never mutates state directly, only calls `Sim.performAction` and reads through `Sim`'s public getters — enforced by convention/comment, not by any technical guard (no `Object.freeze`, no private fields). Preserve this asymmetry: new DOM-facing code goes in `presentation.js` and reads state, new state mutation goes in `sim.js` behind `performAction`.

---

*Convention analysis: 2026-08-12*
