# Codebase Structure

**Analysis Date:** 2026-08-12

## Directory Layout

```
SimLife/
├── .claude/                # Claude Code local settings (not app code)
│   └── settings.local.json
├── .git/                   # Git metadata
├── .planning/               # GSD planning artifacts
│   └── codebase/            # This directory — generated codebase maps
├── CLAUDE.md                 # Instructions for Claude Code working in this repo
├── PERSON-MODEL.md           # Authoritative reference for NPC mind-box formulas/hooks
├── README.md                 # Project overview, how to run, history
├── index.html                 # Page shell — the only HTML file, loads all three scripts
├── sim.js                     # Engine — world state, verbs, perception, belief, decide/act
├── parser.js                  # Player sentence -> action request translator
├── presentation.js            # DOM rendering, event wiring, debug report — only DOM-touching file
└── style.css                  # Visual styling only, no behavior
```

There are no subdirectories under the project root for source code — this
is a flat, four-file static site (`sim.js`, `parser.js`,
`presentation.js`, `index.html`, plus `style.css`). No `src/`, no
`node_modules`, no build output directory, because there is no build step.

## Directory Purposes

**Project root (`/`):**
- Purpose: holds every source file — the entire application
- Contains: 3 JS files, 1 HTML file, 1 CSS file, 2 Markdown reference
  docs, 1 README
- Key files: `sim.js` (engine), `parser.js` (intent parsing),
  `presentation.js` (DOM), `index.html` (shell)

**`.planning/codebase/`:**
- Purpose: GSD-generated codebase map documents (this file and its
  siblings — ARCHITECTURE.md, STACK.md, etc. as they're produced)
- Contains: UPPERCASE.md reference documents, not application code
- Generated: yes, by `/gsd:map-codebase`
- Committed: depends on project convention — not application source

**`.claude/`:**
- Purpose: Claude Code local tooling configuration
- Contains: `settings.local.json`
- Not part of the application's runtime or architecture

## Key File Locations

**Entry Points:**
- `index.html`: page shell, script load order (`sim.js` → `parser.js` →
  `presentation.js`), all DOM element ids the presentation layer binds to
- `presentation.js:286` (`document.addEventListener('DOMContentLoaded', init)`):
  the actual runtime entry point once the page loads

**Configuration:**
- None. No `package.json`, no build config, no environment files, no
  linter/formatter config. The project intentionally has zero
  dependencies and zero build tooling (per `CLAUDE.md`: "Static site, no
  build step, no dependencies, no package.json").

**Core Logic:**
- `sim.js`: all world state, verb effects, perception, belief formation,
  and the NPC decide/act utility-AI loop
- `parser.js`: all player-input parsing (regex-based command matching)

**Rendering / UI:**
- `presentation.js`: all DOM manipulation, split into render functions
  (`renderWorld`, `renderLog`, `renderMind`), the debug-report builder
  (`buildDebugReport`/`serializeWorld`), and input wiring (`init`,
  `submitCommand`)
- `style.css`: all visual styling, no JS-driven class logic beyond a
  handful of static class names (`is-player`, `is-error`, `empty`, etc.)

**Reference Documentation (read before editing behavior):**
- `PERSON-MODEL.md`: exact formulas and hooks for each of the nine
  `mind` boxes (personality, values, worldview, beliefs, memories, needs,
  emotions, relationships, goals) — treat drift between this file and
  `sim.js` as a bug in one or the other
- `CLAUDE.md`: architecture summary and the engine/parser/presentation
  boundary rule for AI agents working in this repo

**Testing:**
- None present. No test files, no test framework, no `*.test.*` /
  `*.spec.*` files, no CI config found in the repository.

## Naming Conventions

**Files:**
- Lowercase, purpose-named, no suffixes (`sim.js`, `parser.js`,
  `presentation.js`) — one file per architectural layer, not one file per
  feature/class
- Markdown reference docs are UPPERCASE (`README.md`, `PERSON-MODEL.md`,
  `CLAUDE.md`)

**Functions (within JS files):**
- `camelCase` throughout, verb-first for actions/mutators
  (`performAction`, `applyEffects`, `checkPreconditions`, `pushEmotion`,
  `adjustNeed`), noun/adjective-first for pure queries/predicates
  (`coLocated`, `believesDead`, `memoryStrength`)
- Event-pipeline stage functions are named after the pipeline itself:
  `perceiveEvent`, `appraiseEvent`, `applyAppraisal`,
  `applyClaimBelief`, `decideAndAct` — the function names mirror the
  perceive → believe → decide → act stages described in `CLAUDE.md`

**Constants:**
- `SCREAMING_SNAKE_CASE` for module-level constant data:
  `LOCATIONS`, `VERBS`, `VALUES`, `WORLDVIEW_BELIEFS`,
  `PREDICATE_LABELS`, `EMOTION_HALFLIFE_TICKS`, `MAX_REACTION_DEPTH`
  (`sim.js:6-42`, `sim.js:186`)

**Public API surface:**
- Each layer exposes a single capitalized object attached to `window`
  (and `module.exports` for potential Node consumption): `Sim`
  (`sim.js:1031-1044`), `Parser` (`parser.js:99-101`) — everything else
  in the file is an unexported, module-private function

**IDs:**
- Agent ids are lowercase first names used as keys directly:
  `player`, `mara`, `ives`, `tomas`, `elena`, `garrick` (`sim.js:118-151`)
- Location ids: `square`, `away` (`sim.js:6-9`)
- Verb strings: capitalized exactly as in `VERBS`: `'Take'`, `'Give'`,
  `'Attack'`, `'Tell'`, `'Move'` — used as literal `switch` cases and
  event `verb` fields throughout, and as label text in the UI
- Belief predicates: lowercase, colon-namespaced for witnessed events
  (`'did:Take'`) vs. bare snake_case for claims (`'stole_from'`,
  `'is_dead'`, `'is_trustworthy'`, `'is_dangerous'`, `'provoked'`,
  `'attacked'`)
- DOM element ids referenced from `presentation.js` match `index.html`
  exactly (`tick`, `world-panel`, `log-panel`, `mind-panel`,
  `command-form`, `command-input`, `action-result`, `example-list`,
  `reset-btn`, `generate-report-btn`, `copy-status`, `debug-output`)

## Where to Add New Code

**New verb:**
- Add the literal string to `VERBS` (`sim.js:11`)
- Add a `case` branch to `checkPreconditions()` (`sim.js:215`)
- Add a matching `case` branch to `applyEffects()` (`sim.js:254`)
- If the verb should be player-typeable, add a regex branch to
  `parseCommand()` in `parser.js` and an example string to `EXAMPLES`
  (`parser.js:19-30`)
- If the verb should affect appraisal/impact, add a branch to
  `appraiseEvent()` (`sim.js:472`) — verbs with no branch there default
  to `impact = 0` and form floor-importance memories only (see
  PERSON-MODEL.md's "Tell/Move-aware memory importance" gap for the
  known consequence of skipping this)
- Add a `describeEvent()` case in `presentation.js:45` for the event log
  rendering

**New belief predicate (claim type):**
- Add a label formatter to `PREDICATE_LABELS` (`sim.js:33-40`) — used by
  both the event log and mind inspector for display
- Add ground-truth handling to `checkContradiction()` if the claim is a
  checkable fact (`sim.js:537`), or leave it unchecked like `provoked`
  if it's inherently a matter of trust, not verifiable fact
- Add predicate-specific relationship effects to the bottom of
  `applyClaimBelief()` (`sim.js:782-812`)
- Add a `Tell` sentence pattern to `parseCommand()`'s claim-matching
  block in `parser.js:73-91`

**New value or worldview entry:**
- Add the name string to `VALUES` (`sim.js:16-19`) or
  `WORLDVIEW_BELIEFS` (`sim.js:31`)
- Wire at least one real hook reading `getValueWeight()` /
  `getWorldviewWeight()` somewhere in `appraiseEvent`, `applyAppraisal`,
  `applyClaimBelief`, `generalCareOf`, or `decideAndAct` — per
  `PERSON-MODEL.md`, declared-but-unwired values/worldview entries are
  treated as a documented gap, not silently acceptable (see `Tradition`,
  `Pleasure`, and Superstition-class entries as the sanctioned exception:
  named and explicitly deferred, not silently ignored)
- Update `PERSON-MODEL.md` in the same change — the project treats drift
  between it and `sim.js` as a bug

**New candidate reaction in `decideAndAct()`:**
- Add a new candidate object (`{ action, label, score, terms }`) to the
  `candidates` array inside `decideAndAct()` (`sim.js:839-998`), scored
  from named personality/value/worldview/relationship/emotion terms the
  same way the existing five are (do nothing, attack, press for
  explanation, tell confidant, retreat)
- The `terms` object must sum to `score` exactly — this is what keeps
  `explainTerms()`'s displayed "why" honest (see the Utility-AI candidate
  abstraction in ARCHITECTURE.md)

**New UI panel/section:**
- Add the section markup to `index.html` inside `<main class="layout">`
- Add a corresponding `render*()` function in `presentation.js`, called
  from `renderAll()` (`presentation.js:126-130`)
- Style additions go in `style.css`; `presentation.js` must not set
  inline styles beyond the existing `display:none`/`display:block`
  toggle pattern already used for `#debug-output`

**Tests (none exist yet):**
- No test directory or framework is present. If tests are introduced,
  `sim.js` and `parser.js` already support `module.exports` (`sim.js:1044`,
  `parser.js:101`) for Node-based testing without touching the DOM;
  `presentation.js` has no such export and would need a DOM-simulation
  environment (e.g. jsdom) to test directly.

## Special Directories

**`.planning/`:**
- Purpose: GSD workflow state and generated planning/codebase-map
  documents
- Generated: yes
- Committed: not application source; follow repo convention for whether
  `.planning/` itself is tracked

**`.claude/`:**
- Purpose: Claude Code local settings
- Generated: yes (tool-managed)
- Committed: typically local-only (`settings.local.json` suggests
  machine-specific, not shared, configuration)

No other special directories exist — no `node_modules`, `dist`, `build`,
`coverage`, or `.github` workflow directory in this repository.

---

*Structure analysis: 2026-08-12*
