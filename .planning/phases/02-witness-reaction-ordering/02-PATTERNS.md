# Phase 2: Witness Reaction Ordering - Pattern Map

**Mapped:** 2026-08-12
**Files analyzed:** 1 (`sim.js` — modified, no new files this phase)
**Analogs found:** all analogs are same-file internal precedent (this is a
single-file engine; there is no cross-file "controller/service" split to draw
from — the closest analog to any new function in `sim.js` is an existing
function in `sim.js`)

**Line numbers below were read fresh from the current `sim.js` (1423 lines)
on 2026-08-12.** `.planning/codebase/CONCERNS.md`'s citations for this bug
are stale relative to today's file — see the mapping table at the bottom of
this document before following any CONCERNS.md line reference directly.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `sim.js` — new `scoreCandidates()` (extracted from `decideAndAct`) | service/utility (pure scoring function) | transform | `appraiseEvent` (`sim.js:550-573`) | same-file internal, exact (pure-function shape) |
| `sim.js` — sort-then-dispatch replacing `witnesses.forEach` in `performAction` | dispatch/orchestration | event-driven | `candidates.sort((a,b) => b.score - a.score)` (`sim.js:1063`) inside `decideAndAct` | same-file internal, exact (identical sort-by-score idiom, one level up) |
| `sim.js` — `perceiveEvent` call sites (unchanged signature, or gains optional precomputed-state params) | event-driven consumer | event-driven | `perceiveEvent` itself (`sim.js:500-548`) | same file, modify in place |

There is only one file in scope. The "analog" relationship here is
**intra-file**: the new sort-then-dispatch logic should read like the sort
logic that already exists one call-frame deeper (`decideAndAct`'s own
`candidates.sort`), and the new `scoreCandidates()` should read like
`appraiseEvent` — the one existing function in `sim.js` that is already a
pure, side-effect-free scorer/classifier called ahead of the mutating work
it informs.

## Pattern Assignments

### `scoreCandidates(world, witness, event, appraisal, priorRelationship)` — extracted from `decideAndAct`

**Analog for "pure scorer separated from the mutating pipeline that consumes it":** `appraiseEvent` (`sim.js:550-573`)

```javascript
// sim.js:550-573 — appraiseEvent
function appraiseEvent(world, witness, event) {
  const isVictim = event.data && event.data.targetId === witness.id;
  const victimAffection = (!isVictim && event.data && event.data.targetId) ? relOf(witness, event.data.targetId).affection : 0;
  const scale = event.data && event.data.quantity ? clamp(event.data.quantity / 2, 1, 3) : 1;
  let impact = 0;
  // ...verb-specific impact math, all reads of world/witness/event, no writes...
  return { isVictim, impact, event };
}
```

`appraiseEvent` is the template for what "no side effects or mutation" (D-01)
looks like in this codebase: it reads `world`, `witness`, `event` via
`relOf`/`getValueWeight`, and returns a plain object. It is called once in
`perceiveEvent` (`sim.js:504`) before any mutating step (`addMemory`,
`witness.mind.beliefs.push`, `applyAppraisal`). `scoreCandidates` should have
the same shape: build and return the `candidates` array, touch nothing on
`world` or `witness`.

**Extraction source — the candidate-building body to lift out of `decideAndAct`** (`sim.js:917-1064`):

```javascript
// sim.js:917-934 — signature + doNothing candidate (always safe to extract as-is)
function decideAndAct(world, witness, event, appraisal, priorRelationship) {
  const { boldness, extraversion, agreeableness, conscientiousness } = witness.mind.personality;
  const doNothingTerms = {
    boldness: (0.5 - boldness) * 0.4,
    extraversion: (0.5 - extraversion) * 0.25,
    agreeableness: (agreeableness - 0.5) * 0.15,
  };
  const doNothingScore = clamp(0.15 + doNothingTerms.boldness + doNothingTerms.extraversion + doNothingTerms.agreeableness, 0.05, 0.65);
```

```javascript
// sim.js:1063 — the sort idiom the new dispatch-ordering pass should mirror
candidates.sort((a, b) => b.score - a.score);
```

```javascript
// sim.js:1078-1083 — pickConfidant: sorting an agent list by a computed key,
// the second-closest analog for "rank agents by a live score"
function pickConfidant(world, witness, excludeId, excludeVictimId) {
  const others = agentsAt(world, 'square', witness.id).filter(a => a.id !== excludeId && a.id !== excludeVictimId && !a.isPlayer);
  if (others.length === 0) return null;
  others.sort((a, b) => relOf(witness, b.id).trust - relOf(witness, a.id).trust);
  return others[0].id;
}
```

**Named-`terms`-object + `Object.values(...).reduce` idiom** — every
candidate score in `decideAndAct` is built this way (e.g. `confrontTerms`
at `sim.js:973-981`, `pressTerms` at `sim.js:1001-1006`, `gossipTerms` at
`sim.js:1030-1035`, `retreatTerms` at `sim.js:1049-1053`). This idiom must
survive the extraction unchanged — it's what feeds `explainTerms()` for the
mind-inspector `why` field, and per CONTEXT.md's "Established Patterns"
section, this candidate-scoring shape is explicitly untouched by this phase,
only relocated into a separate callable unit.

**Critical gotcha — RNG calls currently live inside candidate construction, not just inside the chosen action:**

```javascript
// sim.js:1017-1022 — the "tell confidant" (gossip) candidate
if (confidant && !believesDead(witness, confidant)) {
  const honestyWeight = getValueWeight(witness, 'Honesty');
  const truthful = rngOf(world)() < clamp(0.5 + honestyWeight * 0.45, 0.05, 0.97); // <-- RNG roll #1, at scoring time
  const subject = truthful ? actorId : pickScapegoat(world, witness, actorId, event.data.targetId); // <-- may trigger RNG roll #2
  ...
}
```

```javascript
// sim.js:1092-1101 — pickScapegoat's own RNG roll
function pickScapegoat(world, witness, actualActorId, victimId) {
  ...
  let roll = rngOf(world)() * total; // <-- RNG roll #2, weighted-random scapegoat pick
  ...
}
```

D-01 requires `scoreCandidates()` to have **no side effects**. `rngOf(world)()`
increments `world.rngCalls` (`sim.js:246`) — a side effect — every time it's
called, and it is currently called once per witness who reaches the gossip
branch, regardless of whether gossip ends up the winning candidate. Note
that `truthful`/`subject` only affect the candidate's **label** and the
**claim content used if this action is chosen** — they do not feed
`gossipScore` (`sim.js:1036`, computed purely from `appraisal.impact` and
`gossipTerms`). That's what makes deferral safe: the two RNG rolls must move
out of candidate construction and into the **action closure**, evaluated
lazily only when `best.action(why)` actually fires (`sim.js:1075`), exactly
like the other candidates' `action` closures (e.g. `sim.js:984`,
`sim.js:1008`, `sim.js:1056`) already defer their `performAction` call until
invoked. If this isn't done, `scoreCandidates()` cannot be called twice
(once for ordering, once inside `decideAndAct`'s real dispatch, per D-01's
"both `decideAndAct()` and the new ordering pass" reuse) without double-
consuming RNG and silently changing which claim gets told and to whom
between the pre-pass and the real run.

**Corollary:** deferring these rolls changes total RNG draw count and
therefore `world.rngCalls` (snapshotted verbatim at `sim.js:1163` inside
`snapshotWorld`), and — because it shifts the RNG stream's position for
every subsequent draw — every downstream `Attack` damage roll
(`sim.js:356`) too. Any before/after regression comparison for this phase
(ORDER-02) will show this as noise unrelated to ordering correctness if it
asserts on whole-snapshot equality via `diffSnapshots`/`formatDiff`
(`sim.js:1204-1236`, the `Sim.diffSnapshots`/`Sim.formatDiff` reusable
machinery named in CONTEXT.md's "Reusable Assets"). The discriminating
signal for "did ordering change correctly" is **reaction sequence** — the
order of `world.events[].actor`/`causedBy` entries, or the order of each
witness's `mind.log` entries relative to other witnesses — not
`events[].data.damage` or `rngCalls`, both of which are expected to drift
once RNG rolls move.

**Gotcha — the early return leaves some witnesses without a candidate list:**

```javascript
// sim.js:936-947
if (appraisal.impact >= -0.05) {
  if (appraisal.impact < 0) {
    witness.mind.log.push({
      tick: event.tick,
      trigger: `ev#${event.id} ${event.verb} by ${event.actor}`,
      considered: [`do nothing=${doNothingScore.toFixed(2)}`],
      chose: `barely noticed — didn't care enough to react`,
      why: explainTerms(doNothingTerms),
    });
  }
  return; // <-- decideAndAct exits here for mildly-negative/neutral/positive impact; candidates[] is never built
}
```

D-02 defines urgency as "the top candidate's score from `scoreCandidates()`,"
but for a witness whose `appraisal.impact >= -0.05`, `decideAndAct` today
never builds a `candidates` array at all — it exits before line 949. If
`scoreCandidates()` is extracted to cover only the post-line-947 body, it has
no defined return value for this case. **CONTEXT.md does not resolve this —
it's a decision the plan must make explicitly, not infer:** either (a)
`scoreCandidates()` includes the `doNothingScore` computation (`sim.js:929-934`,
which is unconditional and side-effect-free) and always returns at least
`[{ action: null, label: 'do nothing', score: doNothingScore, terms:
doNothingTerms }]`, so urgency is well-defined for every witness, or (b)
witnesses whose impact clears the `-0.05` threshold are excluded from the
sort entirely and appended in existing `agentsAt` order (consistent with
D-04's stable-tiebreak fallback). Flag this as an open call for the planner;
do not silently pick one.

**Gotcha — the two `mind.log.push` sites must NOT ride along into the extraction:**

```javascript
// sim.js:938-944 — logged inside the early-return branch above
// sim.js:1067-1073 — logged after candidates.sort(), once the winner is picked
witness.mind.log.push({
  tick: event.tick,
  trigger: `ev#${event.id} ${event.verb} by ${actorId}`,
  considered: candidates.map(c => `${c.label}=${c.score.toFixed(2)}`),
  chose: best.label,
  why,
});
```

Both `mind.log.push` calls are mutation. If `scoreCandidates()` is called
once in the new ordering pre-pass and again inside `decideAndAct`'s real
dispatch (as D-01 implies — reused by both), and either log-push site ends
up inside the extracted function, every witness gets double-logged (once
from the scoring pass, once from the real dispatch), corrupting the mind
inspector's `mind.log` display. Keep both `push` calls in `decideAndAct`
(or wherever the real, single-fire dispatch lives), never inside
`scoreCandidates()` itself.

---

### Sort-then-dispatch replacing `witnesses.forEach` — `performAction`'s witness loop

**Analog:** the sort idiom one call-frame deeper, `sim.js:1063`
(`candidates.sort((a, b) => b.score - a.score)`) — same "compute every
candidate's score, then sort descending" shape, just applied one level up
(witnesses instead of a single witness's action candidates).

**Current code to replace** (`sim.js:287-288`):

```javascript
const witnesses = computeWitnesses(world, event);
witnesses.forEach(w => perceiveEvent(world, w, event));
```

**`computeWitnesses` (unaffected by this phase, still returns `agentsAt`-order ids)** (`sim.js:374-377`):

```javascript
function computeWitnesses(world, event) {
  if (event.location !== 'square') return [];
  return agentsAt(world, 'square', event.actor).map(a => a.id);
}
```

**`agentsAt` — the insertion-order source this phase must NOT change, only stop relying on for reaction sequencing** (`sim.js:194-196`):

```javascript
function agentsAt(world, locationId, excludeId) {
  return Object.values(world.agents).filter(a => a.location === locationId && a.id !== excludeId && a.alive);
}
```

D-04 requires this exact order survive as the **tiebreak** when two
witnesses' top-candidate scores are equal — Array.prototype.sort is stable
in all JS engines this project targets (Node 12+, all evergreen browsers),
so a plain `.sort((a, b) => b.score - a.score)` over witnesses already in
`agentsAt` order satisfies D-04 without extra tiebreak code, as long as the
scored array is built by mapping over `computeWitnesses`'s output in order
before sorting.

**Gotcha — `appraisal`/`priorRelationship` go stale between the scoring pre-pass and the real dispatch.** `perceiveEvent` currently computes both fresh, in this order:

```javascript
// sim.js:500-521
function perceiveEvent(world, witnessId, event) {
  const witness = getAgent(world, witnessId);
  if (witness.isPlayer) return;

  const appraisal = appraiseEvent(world, witness, event);
  addMemory(witness, event.id, event.tick, clamp(Math.abs(appraisal.impact), 0.1, 1));

  witness.mind.beliefs.push({ /* ... */ });

  // Standing rapport as it was walking in, before this event's own fallout
  // colors it...
  const priorRelationship = { ...relOf(witness, event.actor) };

  applyAppraisal(world, witness, event, appraisal);
  // ...Tell-specific belief application...
  // ...reaction gate + decideAndAct call, sim.js:539-547...
}
```

If witness A's reaction (triggered first in sorted order) cascades into a
new event that witness B also perceives, B's relationships can shift before
B's real `perceiveEvent`/`decideAndAct` call — but the pre-pass score used
to place B in the sort order was computed against B's *pre-cascade* state.
This is inherent to any two-pass "compute all scores, then dispatch" design
and is implicitly accepted by D-03's phrasing ("compute all witnesses'
candidate scores first... breadth-first rather than depth-first per
witness") — flag it in the plan rather than silently resolving it. The
concrete choice the planner must make: does `perceiveEvent` gain optional
precomputed `appraisal`/`priorRelationship`/`candidates` parameters (reusing
the pre-pass values — the more literal reading of "breadth-first, compute
once") or does it keep recomputing them fresh at real-dispatch time
(simpler, but appraisal-then-mutation ordering already means a "computed
once, used twice" design would need `appraiseEvent`'s memory/belief
mutations in `perceiveEvent` sequenced very carefully relative to the
pre-pass). Either way, this is the actual integration point — `perceiveEvent`'s
signature, not just the `performAction` loop at `sim.js:288` — and should be
named explicitly in the plan rather than left as "modify the dispatch loop."

**Recursion gate — must keep working under reordered dispatch, unchanged in this phase** (`sim.js:263-264`, `sim.js:539-547`):

```javascript
// sim.js:263-264
let reactionDepth = 0;
const MAX_REACTION_DEPTH = 4;
```

```javascript
// sim.js:539-547
if (!witness.mind.reactedEventIds.has(event.id) && reactionDepth < MAX_REACTION_DEPTH) {
  witness.mind.reactedEventIds.add(event.id);
  reactionDepth++;
  try {
    decideAndAct(world, witness, event, appraisal, priorRelationship);
  } finally {
    reactionDepth--;
  }
}
```

Worth gating the new scoring pre-pass on `reactionDepth < MAX_REACTION_DEPTH`
too — if a cascade is already at max depth, every witness at that level is
provably going to be skipped by this same guard inside `perceiveEvent`
regardless of score, so running `scoreCandidates()` (and any RNG calls still
inside it, if any survive the deferral above) for all of them is wasted work
and, worse, wasted RNG draws that would shift the stream for no behavioral
effect. `CONVENTIONS.md:24` also flags `reactionDepth` as the one sanctioned
piece of module-level mutable state — do not add a second one; any new
per-call state the ordering pass needs should be a local variable inside
`performAction`, threaded as an argument, not a new module-level `let`.

---

## Shared Patterns

### Purity boundary before mutation
**Source:** `appraiseEvent` (`sim.js:550-573`), called once per witness before any mutating step in `perceiveEvent`
**Apply to:** `scoreCandidates()` — same shape, read `world`/`witness`/`event`/`appraisal`/`priorRelationship`, return a plain array, mutate nothing (including no RNG draws — see gotcha above).

### Score-then-sort-descending
**Source:** `candidates.sort((a, b) => b.score - a.score)` (`sim.js:1063`); `others.sort((a, b) => relOf(witness, b.id).trust - relOf(witness, a.id).trust)` (`sim.js:1081`)
**Apply to:** the new witness-ordering pass in `performAction` — build an array of `{ witnessId, score }` (or reuse full candidate lists) in `computeWitnesses`'s existing order, then `.sort((a, b) => b.score - a.score)`. JS's stable sort gives D-04's list-order tiebreak for free.

### Named-terms + `Object.values(...).reduce` scoring idiom
**Source:** every candidate builder inside `decideAndAct` (e.g. `confrontTerms`/`confrontScore` at `sim.js:973-982`)
**Apply to:** must survive intact inside the extracted `scoreCandidates()` — it's what `explainTerms()` and the mind-inspector `why` field depend on; this phase does not touch scoring math, only where the code that produces it lives (CONTEXT.md D-01/D-02).

### try/finally recursion guard
**Source:** `sim.js:539-547`
**Apply to:** unaffected by this phase but must keep wrapping the real `decideAndAct` call after reordering — do not let the scoring pre-pass increment/decrement `reactionDepth`, only the real dispatch should.

### Deferred RNG execution via action closures
**Source:** every candidate's `action: (why) => performAction(...)` closure (e.g. `sim.js:984`, `sim.js:1008`, `sim.js:1038`, `sim.js:1056`) already defers its `performAction` call until `best.action(why)` fires (`sim.js:1075`)
**Apply to:** the gossip candidate's `truthful`/`pickScapegoat` RNG rolls (`sim.js:1019-1020`, `sim.js:1097`) need the same treatment — move them inside that candidate's `action` closure rather than evaluating them during candidate construction, so `scoreCandidates()` stays RNG-free and safely callable twice.

## No Analog Found

None — every new piece of logic in this phase (pure scorer, sort-then-dispatch
loop) has a direct, in-file precedent to model against, per the table above.
This phase intentionally does not introduce a new file, new role, or new data
flow shape the codebase hasn't already got an example of.

## CONCERNS.md Line-Number Drift (stale → current)

`.planning/codebase/CONCERNS.md`'s "Witness reaction order is list-position,
not urgency-driven" entry cites line numbers from an earlier version of
`sim.js`. Current numbers (verified 2026-08-12, matches CONTEXT.md's
`<canonical_refs>` section exactly):

| CONCERNS.md citation | Current `sim.js` location |
|---|---|
| `sim.js:209-213` (performAction witness dispatch) | `sim.js:287-288` |
| `sim.js:296-299` (computeWitnesses) | `sim.js:374-377` |
| `sim.js:179-181` (agentsAt) | `sim.js:194-196` |
| `sim.js:186` (MAX_REACTION_DEPTH) | `sim.js:263-264` |
| `sim.js:839-998` (decideAndAct) | `sim.js:917-1076` |
| `sim.js:422-469` (perceiveEvent, recursion gate) | `sim.js:500-548` |

CONTEXT.md's own `<canonical_refs>` numbers were already re-verified against
current `sim.js` and match exactly — trust CONTEXT.md's citations over
CONCERNS.md's for this phase.

## Metadata

**Analog search scope:** `sim.js` in full (1423 lines), read via targeted
non-overlapping `Read` calls (lines 180-280, 280-380, 379-500, 500-550,
550-625, 917-1027, 1017-1127, 1127-1257, 1390-1423) plus `Grep` for function
declarations and `.sort(`/`rngOf` call sites to avoid re-reading ranges
already in context.
**Files scanned:** 1 (`sim.js`) — this is a single-file engine per
`CLAUDE.md`'s "File layout" section (`presentation.js` and `parser.js` are
explicitly out of scope: `presentation.js` never touches engine internals,
`parser.js` only builds `{ verb, params }` requests, neither has any witness-
dispatch or scoring logic to draw an analog from).
**Pattern extraction date:** 2026-08-12
