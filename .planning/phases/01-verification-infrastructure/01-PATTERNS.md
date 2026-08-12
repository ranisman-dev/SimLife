# Phase 1: Verification Infrastructure - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 8 (5 sim.js sub-changes treated as distinct pattern targets, 1 new script, 1 new fixture/baseline file, 1 doc fix)
**Analogs found:** 7 / 8 (1 has no direct in-repo analog — documented conceptual analog only)

**No RESEARCH.md exists for this phase** (intentionally skipped — mechanical, no open design question per ROADMAP.md). This map is built from `01-CONTEXT.md`, direct reads of `sim.js`, `parser.js`, `presentation.js`, `index.html`, and `.planning/codebase/{CONVENTIONS,TESTING,CONCERNS,STRUCTURE}.md`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `sim.js` — `Sim.seedRng(world, seed)` + `world.rng` stream | utility (state-attach) | transform | `makeAgent()` (`sim.js:44-74`) opts-pattern + `relOf()` (`sim.js:76-89`) lazy-init-on-object pattern | role-match |
| `sim.js` — 3 RNG call-site swaps (Attack damage, gossip flip, scapegoat pick) | transform (in-place edit) | transform | The existing `Math.random()` call sites themselves (`sim.js:278`, `941`, `1019`) | exact (self-analog) |
| `sim.js` — `world.driftEnabled` toggle | model field (world state) | n/a (flag, not read yet) | none exact; nearest shape is `world.nextEventId`/`world.tick` — primitive fields set once and read elsewhere (`sim.js:158-163`) | partial |
| `sim.js` — `Sim.TUNING` constants block | config | n/a | `VALUES`/`WORLDVIEW_BELIEFS`/`PREDICATE_LABELS`/`EMOTION_HALFLIFE_TICKS`/`MAX_REACTION_DEPTH` (`sim.js:11-42`, `186`) | exact |
| `sim.js` — `Sim.runRegressionCheck()` | service (scenario runner) | batch / transform | `performAction()` (`sim.js:188-213`) for orchestration shape; `serializeWorld()` (`presentation.js:134-137`) for the snapshot step it needs internally | role-match |
| `scripts/verify.js` (new) | script / CLI entry point | file-I/O + batch | TESTING.md's documented (previously uncommitted) ad hoc Node driver-script pattern, lines 26-44; mulberry32 shim at TESTING.md:31-38 | conceptual (no committed in-repo file, doc-only analog) |
| golden-master baseline data file (new, e.g. `scripts/baseline.json`) | fixture/config data | file-I/O | none — TESTING.md states explicitly "No fixture files exist" | **no analog** |
| `PERSON-MODEL.md` §"Gaps for the next phase" citation fix | documentation | n/a | `PROJECT.md:130` (Key Decisions table row) — already-corrected wording to mirror | exact |

## Pattern Assignments

### `sim.js` — `Sim.seedRng(world, seed)` + `world.rng` (utility, transform)

**Analog 1 — `makeAgent()` opts pattern** (`sim.js:44-74`):
```javascript
function makeAgent(id, name, opts = {}) {
  const isPlayer = !!opts.isPlayer;
  return {
    id,
    name,
    isPlayer,
    location: opts.location || 'square',
    ...
```
Copy: trailing `opts`-style optional parameter for the overridable seed (D-04 — `Sim.seedRng(world)` with no arg uses a hardcoded default constant; `Sim.seedRng(world, seed)` overrides it). Matches CONVENTIONS.md:87-89's rule: "An `opts = {}` trailing options object is used for optional/rarely-set parameters ... Follow this pattern (not more positional args)." For a 2-arg function a plain optional positional param (`seedRng(world, seed = DEFAULT_SEED)`) is the closer fit than an opts object — CONVENTIONS.md's own example, `performAction(world, actorId, verb, params = {}, opts = {})`, uses positional args with defaults up through the point an object is genuinely optional-bag-shaped; a single seed value doesn't need bag-shaping.

**Analog 2 — `relOf()` lazy state-attach on an object** (`sim.js:76-89`):
```javascript
function relOf(agent, otherId) {
  if (!agent.mind.relationships[otherId]) {
    const dangerWeight = getWorldviewWeight(agent, 'DangerousWorld');
    agent.mind.relationships[otherId] = {
      trust: clamp(0.5 - dangerWeight * 0.2, 0, 1),
      ...
    };
  }
  return agent.mind.relationships[otherId];
}
```
Copy: the shape of "attach a new structured piece of state onto an existing object, keyed by a field name, computed once." `seedRng` differs in that it should *always* (re)attach (a fresh call re-seeds), not lazy-init-if-absent — call this out explicitly to whoever implements, since blindly copying the `if (!...)` guard would make a second `Sim.seedRng(world, otherSeed)` call silently no-op.

**Where new state lives — explicit constraint from CONTEXT.md D-03**, grounded in `sim.js:185-186` (`reactionDepth`, module-level `let`) and CONVENTIONS.md:24: `world.rng` (a closure/function) or equivalent must live *on* `world`, never as new module-level mutable state. `reactionDepth` is flagged in CONCERNS.md:263-279 as fragile precisely because it's module-global; do not add a second instance of that problem.

**Seeded PRNG algorithm — copy verbatim, do not reinvent** (`TESTING.md:31-38`, already committed to this exact repo as the documented pattern):
```javascript
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
CONTEXT.md's "Claude's Discretion" section explicitly names mulberry32-style as an acceptable choice with no specific algorithm mandated — this is the one already documented for this codebase, reuse it rather than picking a different one.

**Naming convention for the getter** — follow `getAgent`/`getValueWeight`/`getWorldviewWeight` (`get`-prefixed helpers, CONVENTIONS.md:14) if a `getRng(world)` accessor is added; keep `seedRng` verb-first per CONVENTIONS.md:12 ("`camelCase`, verb-first for actions/mutators").

---

### `sim.js` — RNG call-site swaps (transform, in-place edit)

**Site 1 — Attack damage** (`sim.js:278`):
```javascript
const damage = 15 + Math.floor(Math.random() * 15);
```
**Site 2 — gossip honest-vs-lying flip** (`sim.js:941`):
```javascript
const truthful = Math.random() < clamp(0.5 + honestyWeight * 0.45, 0.05, 0.97);
```
**Site 3 — scapegoat weighted selection** (`sim.js:1019`):
```javascript
let roll = Math.random() * total;
```
Pattern: replace each bare `Math.random()` with a call through `world.rng()` (or whatever accessor `seedRng` installs). These are the *only three* sites in scope per D-05 — RNG scope discipline is LOCKED and cross-phase; do not seed any other randomness, and do not let a future phase read the RNG for anything decision-affecting (`decideAndAct`'s scoring must stay fully deterministic — this is already true today and must not regress).

Note: `parser.js:96` also calls `Math.random()` (picking a random example command on a parse failure) — **out of scope**, not one of the three named call sites, purely UI/help-text flavor, do not touch.

---

### `sim.js` — `world.driftEnabled` toggle (model field)

No direct analog exists — nothing currently reads or writes a toggle field on `world` outside `createWorld()`'s own initial literal (`sim.js:158-163`: `tick`, `agents`, `events`, `nextEventId`). Two open questions for the planner, flagged rather than resolved here (per advisor review):

1. **Where does the field get its initial value?** D-02 forbids touching `createWorld()`'s signature/RNG-related code, but says nothing about a non-RNG boolean field. Either `createWorld()` gains one inert `driftEnabled: true` (or similar) literal alongside `tick`/`agents`/`events`, or the field starts `undefined` and only the regression-check/verify path ever sets it explicitly. Both are structurally plausible from existing code; this phase's own D-02 wording is silent on non-RNG fields.
2. **Falsy-coercion trap — read this like a Known Bug warning.** CONCERNS.md's one documented Known Bug (`params.quantity || 1` at `sim.js:222/259/271`) is exactly this failure class: `0`/`false` silently coerced to a default. Any future code that reads `driftEnabled` (this phase or Phase 5's actual drift mechanic) must use `world.driftEnabled !== false`, never `world.driftEnabled || true`-style coercion, or an explicit `false` silently reverts to "enabled."

Since nothing in the codebase reads this field yet (drift itself is Phase 5, per ROADMAP.md), it ships inert this phase — its only consumer this phase is the regression check itself (setting it `false` before running the two-clone scenario).

---

### `sim.js` — `Sim.TUNING` constants block (config)

**Analog — existing module-level constant blocks** (`sim.js:11-42`, `186`):
```javascript
const VERBS = ['Take', 'Give', 'Attack', 'Tell', 'Move'];

const VALUES = [
  'Honesty', 'Justice', 'Loyalty', 'Wealth', 'Safety', 'Compassion',
  'Tradition', 'Autonomy', 'Status', 'Community', 'Pleasure', 'Curiosity', 'Honor',
];
...
const EMOTION_HALFLIFE_TICKS = 6;
...
const MAX_REACTION_DEPTH = 4;
```
Copy: top-of-file placement, `UPPER_SNAKE_CASE` naming for the block itself if module-scoped (CONVENTIONS.md:23), added to the `Sim` export object literal (`sim.js:1031-1041`) per CONVENTIONS.md:99 ("When adding a new public capability to `sim.js`, add it to the `Sim` object literal ... rather than exporting ad hoc from elsewhere").

**Scope constraint — do not over-fill this block.** D-07 is explicit: scoped to *new* Phase 2+ numbers only. `MAX_REACTION_DEPTH`, `EMOTION_HALFLIFE_TICKS`, and every existing inline magic number in `decideAndAct`/`applyAppraisal`/`applyClaimBelief` (the ones CONCERNS.md:244-261 flags as fragile) are explicitly **not** retrofitted into this block by this phase. Since Phase 1 itself "delivers no new NPC-visible behavior" (CONTEXT.md `<domain>`), `Sim.TUNING` may legitimately ship as an empty object or a stub with only a top comment explaining what it's for and who adds to it next (Phase 2 onward) — do not invent placeholder numbers to populate it.

---

### `sim.js` — `Sim.runRegressionCheck()` (service, batch)

**Analog 1 — orchestration/result-object shape**, `performAction()` (`sim.js:188-213`):
```javascript
function performAction(world, actorId, verb, params = {}, opts = {}) {
  const actor = getAgent(world, actorId);
  if (!actor.alive) return { success: false, reason: 'actor is not able to act' };

  const check = checkPreconditions(world, actor, verb, params);
  if (!check.ok) return { success: false, reason: check.reason };
  ...
  return { success: true, event };
}
```
Copy the **result-object idiom**, not print statements — CONVENTIONS.md:66/92: "Functions that represent a validation/action outcome return a small object literal with a boolean discriminant field ... never a bare boolean when the caller needs a reason too." `runRegressionCheck()` should return something like `{ pass: boolean, diffs: [...] }`, not `console.log` internally — `sim.js` has zero I/O anywhere today (no `console.log`, no file access); keep that boundary. Let `scripts/verify.js` and the browser-console caller do the printing/formatting.

**Analog 2 — snapshot serialization**, `serializeWorld()` (`presentation.js:134-137`):
```javascript
function serializeWorld() {
  // mind.reactedEventIds is a Set, which JSON.stringify silently drops.
  return JSON.parse(JSON.stringify(world, (key, value) => (value instanceof Set ? Array.from(value) : value)));
}
```
This is the right shape for the byte-for-bit snapshot D-08/D-09 needs, and it already solves the one non-obvious gotcha (`reactedEventIds` is a `Set`, dropped silently by plain `JSON.stringify` without the replacer). Two things to flag for whoever implements, not resolve here:
- This function currently lives in `presentation.js` (DOM-adjacent, browser-only global `world`) — the regression-check version needs to be copied into `sim.js` (or the new engine-side check module) taking `world` as an explicit parameter, not closing over a global, so it also runs headlessly under Node per `scripts/verify.js`.
- `JSON.stringify` also silently drops **functions** — once `world.rng` exists as a closure, it will vanish from the snapshot the same way `reactedEventIds` would have without the replacer. That's the *correct* outcome (the RNG closure itself isn't meaningful to diff), but note it as deliberate, not an oversight, when documenting the snapshot's scope.

**Analog 3 — field-by-field human-readable formatting**, `buildDebugReport()` (`presentation.js:139-207`), specifically the per-field line-accumulator style:
```javascript
lines.push(`relationships:`);
Object.entries(m.relationships).forEach(([id, r]) => {
  const name = world.agents[id] ? world.agents[id].name : id;
  lines.push(`  - ${name}: trust=${r.trust.toFixed(2)} affection=${r.affection.toFixed(2)} fear=${r.fear.toFixed(2)} grievance=${r.grievance.toFixed(2)}`);
});
```
Copy the `lines.push(...)` / `lines.join('\n')` accumulator pattern and the `field=value` terse formatting for D-09.3's "human-readable diff output — field-by-field, old value → new value." A diff formatter extends this same idiom to two values per field (`trust: 0.50 → 0.62`) rather than one.

**Snapshot scoping — D-09.1, LOCKED, reused by Phase 2.** No existing code computes "which agents are involved in/witnessing a given scenario" as a standalone helper — `computeWitnesses()` (`sim.js:296-299`) is the closest live concept (it already answers "who witnessed *this event*") but operates per-event, not per-scenario. The regression check's snapshot-scoping helper is new logic; build it from `computeWitnesses` + the actor/target ids across the scenario's whole event sequence, not a hardcoded agent list — the user explicitly rejected assuming a fixed pair (2 clones today, 3+ agents for Phase 2's witness-ordering case tomorrow).

**Qualitative assertion vs. snapshot diff — both are needed, not just one.** PERSON-MODEL.md:140-143 documents the two-clone `CompetitiveJungle` case only as prose ("choose different reactions (`do nothing` vs. `attack player`)") — it was manually verified per CONCERNS.md:311-314, never encoded as a repeatable check, and there is no stored "original" snapshot anywhere in the repo to diff against. `runRegressionCheck()` therefore needs: (a) a qualitative assertion reproducing the prose claim itself (clone A's outcome is "do nothing", clone B's is "attack") — this is the actual regression tie-back to "the original" case; and (b) the golden-master snapshot/diff mechanism (D-09), whose *first* baseline gets captured from current `HEAD` (there's nothing older to compare against) and is what all *future* phases diff against going forward.

**Building the two clones — API constraint to flag, not resolve.** `Sim`'s exported surface is `{ LOCATIONS, VERBS, VALUES, WORLDVIEW_BELIEFS, PREDICATE_LABELS, createWorld, performAction, getAgent, memoryStrength }` (`sim.js:1031-1041`) — no exported way to construct a standalone agent with a chosen worldview weight outside `createWorld()`'s fixed 5-agent literal, and D-02 freezes `createWorld()`'s signature. TESTING.md:64 already blesses `createWorld()` as the one legitimate fixture factory ("Any driver script should call `Sim.createWorld()` fresh at the start of each scenario ... rather than constructing agents by hand"). The two most structurally plausible paths — mutate an existing agent's `mind.worldview` in place after `createWorld()` returns (e.g., clone `mara`'s stats onto a second in-place agent), or add a new exported capability — are both viable; which one is a planner decision, not a pattern-mapping one.

---

### `scripts/verify.js` (new file — script/CLI entry point)

**No committed in-repo analog exists** — `scripts/` does not currently exist (confirmed: no subdirectories under project root per STRUCTURE.md). The closest thing to a pattern is *documented but never committed*: TESTING.md §"De Facto Verification Approach: Ad Hoc Node Driver Scripts" (TESTING.md:15-44) describes, in detail, exactly the kind of script `scripts/verify.js` now formalizes — this phase is explicitly turning an established-but-uncommitted convention into a real, committed file (D-01).

**What to copy from TESTING.md's documented pattern:**
```javascript
// TESTING.md:28 — the require pattern, enabled by sim.js's dual-export guard
const Sim = require('<path-to-repo>/sim.js');
```
And the mulberry32 body at TESTING.md:31-38 (reproduced above under the `seedRng` section) — copy that function's *body* into wherever `seedRng` is implemented; `verify.js` itself should not reimplement mulberry32 separately, it should call `Sim.seedRng(world, SEED)`.

**What NOT to copy from TESTING.md — these are exactly the practices D-01/D-09 supersede:**
- TESTING.md:29/58's `Math.random = mulberry32(seed)` **global monkeypatch** — the whole point of D-02/D-03 is that RNG state lives on `world.rng`, explicitly threaded, not a reassigned global. `scripts/verify.js` calls `Sim.seedRng(world, seed)`, never touches `Math.random`.
- TESTING.md:27/44's "driver scripts live outside this repo, in a scratch directory, never committed" — D-01 deliberately reverses this: `scripts/verify.js` **is** committed, inside the repo. TESTING.md will read as stale/superseded on this specific point once this phase lands (worth a note back to whoever next regenerates the codebase map, though updating TESTING.md itself isn't in this phase's CONTEXT.md scope).

**Ownership header comment** — per CONVENTIONS.md:76, every top-level file states its ownership boundary as an enforceable rule in a file-top comment, matching `sim.js`'s (`sim.js:1-4`):
```javascript
// Tiny Town Sim — core engine.
// No DOM references in this file. Everything here is objective world state,
// generic verbs, perception/belief formation, and reactive agent decisions.
// presentation.js is the only thing allowed to touch the DOM.
```
`scripts/verify.js` needs an equivalent: e.g. "Node-only verification entry point. Requires `sim.js`/`parser.js` directly (their dual `module.exports` guard makes this possible with zero build step) — never runs in the browser, never touches the DOM."

**CLI flag handling (`--update-baseline`)** — no existing analog for argv parsing anywhere in the repo (zero-dependency, no CLI tooling exists yet); this is genuinely new surface. Keep it consistent with the rest of the codebase's minimalism (CONVENTIONS.md: no formatter/linter, hand-styled) — plain `process.argv.includes('--update-baseline')` is proportionate; no argv-parsing library, this is a zero-dependency project (TESTING.md:44).

**`.claude/settings.local.json` integration** — already allowlists `node -e '...'` and specific `require('./sim.js')` invocations (see `.claude/settings.local.json`); a plain `node scripts/verify.js` invocation fits the same allowlist shape (`Bash(node tiny-town-driver.js)` is already an existing entry) and should not need new permission grants, per CONTEXT.md's Integration Points note.

---

### Golden-master baseline data file (new — e.g. `scripts/baseline.json`)

**No analog found.** TESTING.md states explicitly: "No fixture files exist. `Sim.createWorld()` is itself the de facto fixture factory." There is no precedent anywhere in this repo for a committed JSON snapshot file. Build this fresh, informed by `serializeWorld()`'s replacer-based JSON shape (see `Sim.runRegressionCheck()` section above) — the baseline is that same snapshot shape, persisted to disk and re-read by `--update-baseline`/plain-run modes of `scripts/verify.js`.

---

### `PERSON-MODEL.md` §"Gaps for the next phase" citation fix (documentation)

**Analog — already-corrected wording**, `.planning/PROJECT.md:130` (Key Decisions table row):
> "Research corrected the citation: 'the Phelps-Roper framework' named in `PERSON-MODEL.md`'s Phase 2 gap notes isn't a real citable source (Megan Phelps-Roper is a case study, not a framework author). Real per-claim grounding: Roberts/Walton/Viechtbauer (2006) cumulative-continuity meta-analysis for slow drift, Sherif's Social Judgment Theory for resistance-to-change/ego-involvement, Prochaska & DiClemente's relapse stage as a structural parallel for the regression trap."

**Exact target in PERSON-MODEL.md** (`PERSON-MODEL.md:301-304`):
```markdown
The Phelps-Roper framework (intentional vs. unintentional change, sustained
pressure vs. one intense event, the regression trap for unintentional
shifts reverting once the pressure lifts, neuroticism modulating how long
a shift takes to settle). Deliberately not scoped yet — needs concrete
answers before it's buildable, not during:
```
Replace "The Phelps-Roper framework" with the corrected citation wording (mirroring PROJECT.md:130's phrasing), keeping the rest of the sentence's content (intentional/unintentional change, sustained pressure vs. one intense event, regression trap, neuroticism-modulated settling time) intact — that's still the accurate design description, only the citation name is wrong.

**Second site found in this repo, not named in CONTEXT.md's scope — flag, don't silently fix.** `.planning/codebase/CONCERNS.md:141` also names "the Phelps-Roper framework, per `PERSON-MODEL.md`" (a generated codebase-map doc, not application source). CONTEXT.md's Claude's Discretion section only scopes the fix to `PERSON-MODEL.md`. Whether `CONCERNS.md` (and `.planning/PROJECT.md:130`'s own clause "`PERSON-MODEL.md` needs the same correction when Phase 2 lands," which goes stale the moment this phase lands) also get touched is a planner/user call, not resolved here — `.planning/codebase/*.md` are regenerated-map docs, typically not something a feature phase edits directly.

## Shared Patterns

### Dual-export Node/browser registration
**Source:** `sim.js:1043-1044`, `parser.js:100-101`
```javascript
if (typeof window !== 'undefined') window.Sim = Sim;
if (typeof module !== 'undefined') module.exports = Sim;
```
**Apply to:** Any new public function added to `Sim` (`seedRng`, `runRegressionCheck`, `TUNING`) — add to the `Sim` object literal at `sim.js:1031-1041`; this dual-registration already makes it reachable from both `scripts/verify.js` (via `require`) and the browser console (`Sim.runRegressionCheck()`, D-01's second entry point) with zero extra plumbing. Do not remove or alter this guard.

### Result-object over exceptions/prints
**Source:** `sim.js:188-213` (`performAction`), CONVENTIONS.md:60-70
**Apply to:** `Sim.runRegressionCheck()`, and any check function `scripts/verify.js` calls into on the `sim.js` side — return `{ pass, diffs }`/`{ ok, reason }`-shaped objects; leave all printing/formatting to the caller (`scripts/verify.js` for the terminal, whatever wraps the browser console call for that surface). `sim.js` has no `console.log`/file I/O anywhere today — preserve that.

### New state lives on `world`, never module-level
**Source:** `sim.js:185-186` (`reactionDepth`, the one existing exception, explicitly flagged fragile), CONVENTIONS.md:24, CONCERNS.md:263-279
**Apply to:** `world.rng`, `world.driftEnabled` — both must be fields on the `world` object passed explicitly through function calls, not new `let` declarations at module scope in `sim.js`. This is D-03's explicit rationale.

### Top-of-file constant blocks
**Source:** `sim.js:11-42`
**Apply to:** `Sim.TUNING` — same placement convention (top of file, alongside `VALUES`/`WORLDVIEW_BELIEFS`/etc.), same `UPPER_SNAKE_CASE` naming if module-scoped.

### File-top ownership-boundary comments
**Source:** `sim.js:1-4`, `parser.js:1-4`, `presentation.js` (first lines), CONVENTIONS.md:76
**Apply to:** `scripts/verify.js` — new top-level file needs an equivalent header stating what it owns (Node-only, no DOM, requires `sim.js`/`parser.js` directly) and what it must never do.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| golden-master baseline data file (`scripts/baseline.json` or similar) | fixture/config data | file-I/O | TESTING.md states explicitly no fixture files exist anywhere in this repo; `Sim.createWorld()` is the only precedent for canonical starting state, and it's code, not a data file. Build from `serializeWorld()`'s JSON shape (see `Sim.runRegressionCheck()` pattern assignment above), no existing file to pattern-match against. |
| `scripts/` directory itself | n/a | n/a | Does not exist yet; STRUCTURE.md confirms zero subdirectories under project root today. This phase creates the first one. |

## Metadata

**Analog search scope:** `sim.js` (full file, 1044 lines, read in one pass), `parser.js` (full file, 101 lines), `presentation.js:130-210` (debug-report section, targeted read), `index.html:50-64` (script load order), `.claude/settings.local.json`, `.planning/codebase/{CONVENTIONS,TESTING,CONCERNS,STRUCTURE}.md` (full reads), `PERSON-MODEL.md:100-170,285-325` (targeted reads), `.planning/PROJECT.md:130` (grep), `.planning/ROADMAP.md` Phase 1 + Phase 2 sections, `.planning/REQUIREMENTS.md` VERIF-01/02/03.
**Files scanned:** 8 source/doc files directly read; repo-wide grep for `Phelps-Roper` (11 hits across `.planning/` and 2 in application source: `PERSON-MODEL.md:301`, `.planning/codebase/CONCERNS.md:141`).
**Pattern extraction date:** 2026-08-12
