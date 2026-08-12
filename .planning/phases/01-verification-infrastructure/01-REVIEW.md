---
phase: 01-verification-infrastructure
reviewed: 2026-08-12T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - PERSON-MODEL.md
  - presentation.js
  - scripts/baseline.json
  - scripts/verify.js
  - sim.js
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-12T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This phase adds a seeded-RNG layer (`mulberry32`/`seedRng`/`rngOf`) and a golden-master
regression harness (`scenarioParticipants`, `snapshotWorld`, `diffSnapshots`,
`formatDiff`, `runRegressionCheck`, plus the two-clone `CLONE_SPEC`/`buildCloneVariant`
fixtures) to `sim.js`, a Node CLI (`scripts/verify.js`) that runs it, and a checked-in
`scripts/baseline.json` golden master. `presentation.js` picks up two lines to seed the
interactive world from `Date.now()`. `PERSON-MODEL.md` gets a citation fix only.

Positively verified, not just read: `grep`'d `sim.js` and `scripts/verify.js` for
residual `Math.random`/`Date.now`/`new Date`/`performance.now` — none found outside the
three sites already converted to `rngOf(world)()`, so the golden-master path is fully
deterministic as designed. Ran `node scripts/verify.js` against the committed baseline
(clean PASS on all six checks) and then re-ran `runRegressionCheck` against a
deliberately tampered copy of `baseline.json` (flipped one relationship field) — the
tool correctly failed with the exact field path and both values, confirming the diff
mechanism catches real regressions rather than only passing by construction. No
Critical-severity defects found. The findings below are robustness and maintainability
gaps in the new CLI wrapper and one drift risk between `sim.js` and `presentation.js`
that predates this phase but is newly relevant given this phase's own `TUNING` block.

## Warnings

### WR-01: `scripts/verify.js` has no error handling anywhere in its I/O or engine-call path

**File:** `scripts/verify.js:34-37` (`loadJsonIfPresent`), `:76` (`Sim.runRegressionCheck` call), `:171` (`fs.writeFileSync`)
**Issue:** None of the three risky operations in this file are wrapped in `try`/`catch`:
- `loadJsonIfPresent()` calls `JSON.parse(fs.readFileSync(filePath, 'utf8'))` for both
  `baseline.json` and `known-mismatch.json` with no guard. A hand-edited or
  merge-conflicted `known-mismatch.json`, or a corrupted `baseline.json`, throws a raw
  `SyntaxError` with a Node stack trace instead of the clean, actionable
  `FAIL`/`REFUSED` output this tool is designed to always produce.
- `main()` calls `Sim.runRegressionCheck(...)` directly. `sim.js`'s action pipeline can
  throw (e.g. `getAgent()` throws `Unknown agent: X` on a bad id) — currently unreachable
  from the fixed `CLONE_SPEC` scenario, but nothing structurally prevents a future change
  to that scenario (or to `sim.js`) from tripping it, and the file's own header comment
  claims "sim.js never throws on a failed check" as an invariant this file relies on
  without enforcing it.
- The `--update-baseline` write at `fs.writeFileSync(BASELINE_PATH, ...)` (line 171) has
  no guard — a permissions error, read-only file, or full disk throws an unhandled
  exception instead of a clean exit.
**Fix:** Wrap `loadJsonIfPresent`'s `JSON.parse` in try/catch and report a clear
`ERROR: scripts/<file> is not valid JSON` message; wrap the `runRegressionCheck` call
and the baseline write in try/catch in `main()`, printing the error message and calling
`process.exitCode = 1` (see WR-02 for why not `process.exit(1)` directly) rather than
letting the exception propagate.

### WR-02: `process.exit()` called immediately after `console.log`, risking truncated output on piped/redirected stdout

**File:** `scripts/verify.js:144`, `:167`, `:176`
**Issue:** `console.log` on Node is asynchronous when stdout is not a TTY (e.g. piped to
`| tail`, redirected to a file in CI, or captured by a parent process). `process.exit()`
called right after a batch of `console.log` calls (`lines.forEach((line) =>
console.log(line))` at line 141, followed by `process.exit(...)` at line 144/167/176)
can terminate the process before the buffered writes flush, silently truncating the
report — most likely to bite exactly when `formatDiff` has produced a long multi-line
diff, i.e. the case where the output matters most. The interactive test run in this
review was small enough to not exhibit truncation, so this did not surface empirically
here, but the risk is structural, not hypothetical.
**Fix:** Replace the three `process.exit(code)` calls with `process.exitCode = code;
return;` (or just let `main()` fall off the end after setting `process.exitCode`), so
Node exits naturally once its event loop drains and stdout has flushed.

## Info

### IN-01: Emotion decay half-life duplicated as a magic number in `presentation.js`, unlike the sibling `memoryStrength` constant

**File:** `presentation.js:82`, `presentation.js:167`; compare `sim.js:42`, `sim.js:390-394`
**Issue:** `sim.js:42` defines `const EMOTION_HALFLIFE_TICKS = 6;`, consumed internally
by `activeEmotionIntensity()` (`sim.js:390-394`) — but neither the constant nor the
helper is exported on the `Sim` public API. `presentation.js` independently reimplements
the same decay formula with the literal `6` hardcoded twice: `renderMind()` (line 82)
and `buildDebugReport()` (line 167). Contrast this with `memoryStrength`, which *is*
exported and correctly reused via `Sim.memoryStrength()` at `presentation.js:94` and
`:183` — the project's own established pattern for this exact kind of shared
computation. This phase adds a `TUNING` block explicitly to house future retuning
constants for Phases 2-7; if `EMOTION_HALFLIFE_TICKS` (or its Phase-2+ equivalent) is
ever tuned, the two hardcoded `6`s in `presentation.js` will silently go stale and the
UI will misrepresent live emotion intensity without any test catching it.
**Fix:** Export `activeEmotionIntensity` (or at minimum `EMOTION_HALFLIFE_TICKS`) from
`Sim` and have both `presentation.js` call sites use it, the same way `memoryStrength`
is already handled.

### IN-02: New public API surface (`TUNING`, `isDriftEnabled`, `scenarioParticipants`, `snapshotWorld`, `diffSnapshots`) has no caller outside `sim.js` itself

**File:** `sim.js:1401-1420` (Sim export object)
**Issue:** Of the five new names added to the `Sim` export object this phase,
`scripts/verify.js` only consumes `DEFAULT_SEED`, `runRegressionCheck`, and
`formatDiff`. `TUNING`, `isDriftEnabled`, `scenarioParticipants`, `snapshotWorld`, and
`diffSnapshots` are exported but currently have no external caller. This is very likely
intentional per the file's own comments (`runRegressionCheck` is documented as one of
"two entry points" — the other being manual invocation from the browser dev console
while `index.html` is open — and `TUNING`/`isDriftEnabled` are explicitly staged for
Phases 2-7), so this is not treated as dead code to delete, only flagged per the
"unused exports" review category so a future pass doesn't remove them without checking
this rationale first.
**Fix:** None required; if a linter or code-search tool flags these as unused, point it
at this note rather than deleting them.

### IN-03: `CLAUDE.md` no longer fully describes the repo's tooling/file layout

**File:** `CLAUDE.md` ("Running it" and "File layout" sections — not in the reviewed
file set, but drift-relevant to `scripts/verify.js`)
**Issue:** `CLAUDE.md` states "There is no test suite, linter, or build command in this
repo" and its "File layout" section lists only `sim.js`, `parser.js`, and
`presentation.js`. This phase adds a real, committed verification command
(`node scripts/verify.js`) and a `scripts/` directory with a golden-master baseline.
`CLAUDE.md` itself asserts (for `PERSON-MODEL.md`) that "the project treats drift
between it and `sim.js` as a bug in one or the other" — the same standard arguably
applies to `CLAUDE.md`'s own description of the repo's verification tooling.
**Fix:** Update `CLAUDE.md`'s "Running it" section to mention `node scripts/verify.js`
as the regression check, and/or add `scripts/verify.js` to the file-layout list.

### IN-04: Orphaned or mistyped `known-mismatch.json` acknowledgment entries are never surfaced

**File:** `scripts/verify.js:84-100`
**Issue:** `STALE-ACK` detection (line 88, 98-100) only fires when a check named in
`knownMismatch.acknowledged` is currently passing. If an acknowledgment entry's name
doesn't match any check currently returned by `runRegressionCheck` at all — because a
check was renamed, or because of a typo when the entry was hand-written — it is silently
ignored forever with no diagnostic anywhere in the output. This fails safe (an
unmatched acknowledgment has zero effect; the corresponding real check, if failing,
still shows as an unacknowledged `FAIL`), so this is a hygiene gap rather than a
correctness risk.
**Fix:** Optionally, after the main `result.checks.forEach` loop, compute
`knownMismatch.acknowledged.filter(name => !result.checks.some(c => c.name === name))`
and print an `UNKNOWN-ACK <name>` line for each, so a maintainer notices a
no-longer-effective entry instead of assuming it's still doing something.

### IN-05: DOM rendering in `presentation.js` has no output-escaping layer; safety currently depends entirely on `parser.js`'s input regexes

**File:** `presentation.js:17`, `:38`, `:61`, `:111`, `:260` (all `.innerHTML =` assignments)
**Issue:** Every render function builds HTML via template-literal interpolation of
dynamic values (agent names, event data such as `ev.data.item`, claim contents via
`Sim.PREDICATE_LABELS`) and assigns it straight to `.innerHTML`, with no escaping
anywhere in this file. This is confirmed **not currently exploitable**: `parser.js`
(read for context, not in this review's file set) constrains the only genuinely
free-text field reachable from the player (`item`, in `take`/`give` commands) to
`\w+` via regex, and every other interpolated field (agent tokens) must resolve through
`findAgentId()` against the fixed roster of five NPC names, so no HTML-bearing string
can currently reach `.innerHTML`. This is flagged as Info specifically because it's a
single point of failure: the rendering layer itself provides no defense-in-depth, so if
`parser.js`'s `item` regex is ever relaxed (e.g. to support multi-word item names) or a
second code path starts feeding claim/event data into these render functions without
going through the current parser, the DOM-XSS surface reopens with no test to catch it.
**Fix:** No action required now; if/when `parser.js`'s free-text fields are relaxed,
switch the affected interpolations to `textContent`/`createElement` or add an explicit
HTML-escaping helper rather than continuing to rely solely on upstream regex validation.

### IN-06: `diffSnapshots` reports `NaN` as unequal to itself; unreachable today, but undocumented as a contract gap

**File:** `sim.js:1204-1225` (`diffSnapshots`), leaf comparison at `sim.js:1222`
**Issue:** The leaf comparison `if (a !== b) diffs.push(...)` treats two `NaN` values as
different, since `NaN !== NaN` in JavaScript. Verified interactively
(`diffSnapshots({a:NaN},{a:NaN})` returns a spurious diff entry). This cannot currently
produce a false positive in this codebase because every value that reaches
`diffSnapshots` — both `snapshotWorld()`'s output and a `baseline.json` loaded via
`JSON.parse` — has already been round-tripped through `JSON.stringify`, which serializes
`NaN` to `null` before it can appear as a leaf. `diffSnapshots` is exported on the
public `Sim` API, though, and its comment describes it as operating on "any two plain
JSON-shaped values" without stating the round-trip precondition that makes this safe.
**Fix:** No functional fix needed while both callers stay JSON-round-tripped; consider
either adding a `Number.isNaN(a) && Number.isNaN(b)` special case, or documenting the
"must be JSON-round-tripped first" precondition explicitly in the function's comment so
a future caller doesn't pass raw values.

---

_Reviewed: 2026-08-12T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
