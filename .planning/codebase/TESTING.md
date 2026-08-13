# Testing Patterns

**Analysis Date:** 2026-08-12

## Test Framework

**No test framework is configured in this repository.** There is no `package.json`, no `node_modules`, no `jest.config.*`, `vitest.config.*`, `.mocharc*`, or any other test-runner configuration. There is no `test/`, `tests/`, `__tests__/`, or `*.spec.*`/`*.test.*` file anywhere in the repo. `CLAUDE.md` states this explicitly: "There is no test suite, linter, or build command in this repo."

**Run Commands:** None exist. The only documented way to run the project is:
```bash
python3 -m http.server 8000
```
then exercising the app manually in a browser at `http://localhost:8000/index.html`, or opening `index.html` directly as a `file://` URL.

## De Facto Verification Approach: Ad Hoc Node Driver Scripts

Despite no committed test suite, `sim.js` and `parser.js` are written to support headless verification, and this capability is used in practice via **uncommitted, scratch driver scripts** — not checked into this repo. This is the project's actual verification method and should be treated as the working "test" convention until/unless a real suite is added.

**Why this works:** both `sim.js` and `parser.js` end with dual environment registration:
```javascript
if (typeof window !== 'undefined') window.Sim = Sim;
if (typeof module !== 'undefined') module.exports = Sim;
```
(`sim.js:1043-1044`, and the equivalent for `Parser` at `parser.js:100-101`). This means either file can be `require()`'d directly from plain Node with no build step, no transpilation, and no bundler — the same files that run in the browser run headlessly in Node unmodified.

**The pattern, as historically practiced:**
1. A throwaway driver script is written **outside this repo**, in a scratch/temp directory (e.g. an OS temp folder or a working scratchpad the agent session was given), never inside `SimLife/`.
2. It does `const Sim = require('<path-to-repo>/sim.js');` (and `require('<path-to-repo>/parser.js')` if exercising the parser layer) to get the same `createWorld`/`performAction`/`getAgent` API the browser UI uses.
3. Because `sim.js` uses `Math.random()` directly in a few places (`applyEffects`'s `Attack` damage roll at `sim.js:278`, `decideAndAct`'s truthful/misattribution coin-flip at `sim.js:941`, and `pickScapegoat`'s weighted-random selection at `sim.js:1019`), the driver script monkeypatches `Math.random` with a seeded **mulberry32** PRNG before calling into the sim, so a given scenario is exactly reproducible run to run instead of flaking on the random branches. A typical mulberry32 seed shim looks like:
   ```javascript
   function mulberry32(seed) {
     return function () {
       seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
       let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
       t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
       return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
     };
   }
   Math.random = mulberry32(12345);
   ```
4. The script then calls `Sim.createWorld()`, drives a sequence of `Sim.performAction(world, actorId, verb, params)` calls (or `Parser.parseCommand(world, actorId, rawText)` followed by `performAction`) representing a scenario, and inspects the resulting `world` — beliefs, relationships, `mind.log`, event log — via `console.log` / assertions written by hand (plain `if`/`throw` or `assert` from Node's built-in `assert` module — no assertion library is a repo dependency since there is no `package.json`).
5. The script and its output are discarded after use — nothing is committed back to `SimLife/`. This is why no test artifacts appear in git history despite this being the actual method used to validate belief-formation, contradiction-detection, and decision-scoring logic changes (e.g. the kind of scenario walked through in `PERSON-MODEL.md`).

**Implication for future work in this repo:** when validating a change to `sim.js` or `parser.js`, the expected approach — absent an explicit decision to add a real committed test suite — is to write exactly this kind of seeded, headless Node driver script in a scratch location, not to add files under a `test/` directory in this repo unless the user asks for a real suite to be formalized. If asked to make this durable, the natural next step would be adding a minimal `package.json` (no dependencies required — Node's built-in `assert` and `node:test` are sufficient given the zero-dependency ethos) and a committed `test/` directory, but that is a deliberate scope decision, not something to do silently.

## Test File Organization

Not applicable — no test files exist in the repository.

## Test Structure

Not applicable — no committed test structure exists. Ad hoc driver scripts (see above) are freeform Node scripts, not structured suites with `describe`/`it` blocks, since no test framework is installed to provide that DSL.

## Mocking

**No mocking framework is used or available** (no Jest/Sinon/etc. as a dependency — there is no dependency manifest at all).

**The one thing ad hoc scripts do "mock"** is `Math.random`, by direct reassignment (`Math.random = mulberry32(seed)`) rather than through a mocking library — see the mulberry32 pattern above. This is a global monkeypatch scoped to the lifetime of the driver script process, not a scoped/restorable mock. If writing such a script, capture the original `Math.random` first if any part of the scenario needs true randomness afterward, though in practice driver scripts have simply reassigned it for the whole run since the process is short-lived and discarded.

**Nothing else needs mocking:** the sim has no network calls, no file I/O, no timers, and no external services — `sim.js` is pure in-memory state manipulation, so a driver script can exercise real `Sim`/`Parser` code end-to-end with no test doubles beyond the PRNG seed.

## Fixtures and Factories

**No fixture files exist.** `Sim.createWorld()` (`sim.js:117-164`) is itself the de facto fixture factory — it returns the fixed 5-agent starting world (player, Mara, Ives, Tomas, Elena, Garrick) with hardcoded personality/values/worldview seeds and one pre-seeded asymmetric relationship (Tomas → Mara, negative affection), specifically because, per its own comment, that makes "Tomas dislikes Mara" scenarios "testable out of the box." Any driver script should call `Sim.createWorld()` fresh at the start of each scenario rather than constructing agents by hand, to stay aligned with the one shared baseline the codebase already treats as canonical for manual scenario walkthroughs (the kind documented in `PERSON-MODEL.md`).

## Coverage

**No coverage tooling configured or measured.** No `nyc`, `c8`, `istanbul`, or framework-integrated coverage exists. Confidence in `sim.js`/`parser.js` correctness currently comes entirely from targeted ad hoc scenario scripts plus manual browser exercising via the "Generate report" debug-dump feature in `presentation.js` (`buildDebugReport`, `presentation.js:139-207`), which produces a full untruncated text dump of the event log and every NPC's complete mind state for a human (or an LLM) to review by eye rather than an automated assertion.

## Test Types

**Unit Tests:** None committed. Ad hoc driver scripts function as informal unit/integration tests of `sim.js` functions reachable through the public `Sim` API (`createWorld`, `performAction`, `getAgent`, `memoryStrength`) — they cannot reach internal-only helpers like `appraiseEvent` or `checkContradiction` directly since those are not exported, so verification of those necessarily happens indirectly through `performAction`'s observable effects (events pushed, beliefs formed, relationships changed, `mind.log` entries).

**Integration Tests:** The scenario-driver pattern above is inherently integration-style — it exercises the full `perceive → believe → decide → act` pipeline through `performAction`, since that is the only entry point exposed, rather than testing pipeline stages in isolation.

**E2E Tests:** Not used. No browser automation (Playwright/Cypress/Selenium) is present or referenced anywhere in the repo. The closest equivalent is manual verification through `index.html` in an actual browser, plus the built-in "Generate report" debug dump for pasting full state back to an LLM for review.

## Common Patterns

**Async Testing:** Not applicable — nothing in `sim.js`/`parser.js`/`presentation.js` is asynchronous. `performAction` and `parseCommand` are fully synchronous; the only async-shaped code in the repo is the `navigator.clipboard.writeText(...).then(...)` call in `presentation.js:219-222`, which is UI-only and outside `sim.js`'s scope.

**Error Testing:** The one `throw` site in the codebase (`getAgent`'s "Unknown agent" error, `sim.js:170`) would be the only case worth an explicit exception-path check in a driver script (e.g. calling `performAction` with a bogus actor id and confirming it throws). All other failure paths are result-object based (`{ success: false, reason }` / `{ error }` — see `CONVENTIONS.md`), so verifying them means asserting on the returned object's `success`/`error` field rather than wrapping calls in try/catch.

---

*Testing analysis: 2026-08-12*
