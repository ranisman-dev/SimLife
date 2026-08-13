# Phase 3: Belief Decay & Needs Regeneration - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 1 modified (`sim.js`), 1 flagged as a required consequential change (`presentation.js`), 3 golden-master baseline artifacts flagged as needing regeneration (`scripts/baseline.json`, `scripts/order-baseline.json`, `scripts/order-prefix.json`)
**Analogs found:** 4 / 4 logical units (all analogs are intra-file — this phase touches no new files, so every "closest analog" is another function already in `sim.js`)

**Re-read note:** `sim.js` was re-read in full, fresh, this pass (1800 lines total, single `Read` call — under the 2,000-line threshold). All line numbers below are current as of this read, post-Phase-2. Do not reuse line numbers from CONTEXT.md's `<canonical_refs>` block without re-verifying — most still match, two do not (see below).

## File Classification

This phase adds no new files. Each row below is a logical unit inside `sim.js`, classified the same way a new file would be.

| Logical Unit | Role | Data Flow | Closest Analog (in-file) | Match Quality |
|---|---|---|---|---|
| `beliefConfidence()` + prune-on-push (D-01/D-02/D-03) | utility (decay formula) | transform (computed-live) | `memoryStrength()` / `addMemory()`, `sim.js:491-512` | exact |
| `needValue()` accessor + `needs` shape change (D-04) | utility (regen formula) | transform (computed-live) | `activeEmotionIntensity()`, `sim.js:485-489`, and `memoryStrength()`, `sim.js:496-499` | exact |
| `belonging` Give/Tell trigger (D-05) | event-driven mutator | event-driven | Take's inline `adjustNeed` hook, `sim.js:364-367`; Attack's, `sim.js:383` | role-match (new code, existing shape to mirror) |
| Retreat-gate hysteresis (D-07) | decision/control-flow | request-response (scored candidate) | the retreat candidate block itself, `sim.js:1171-1187`, inside `scoreCandidates()` | exact (self-modification, not a borrowed analog) |

**Correction to CONTEXT.md's canonical_refs line numbers:** the `safety < 0.7` retreat gate is at **`sim.js:1172`** (still accurate — did not shift), but there is a **second raw read of `mind.needs.safety`** one line away at **`sim.js:1177`** that CONTEXT.md's `<canonical_refs>` did not mention. Both must be updated for D-04, not just the gate condition. Full detail below.

---

## Pattern Assignments

### Unit 1: Belief confidence decay + known-false-exempt pruning (D-01, D-02, D-03)

**Analog:** `memoryStrength()` / `memoryStrengthForEvent()` / `addMemory()`, `sim.js:491-512`

**The exact template to mirror** (`sim.js:491-512`):
```javascript
// How strongly a memory is still felt right now. More important memories
// (bigger appraisal impact when they happened) linger far longer — a shrug
// fades in a handful of actions, a betrayal can still be sharp dozens of
// actions later. Computed live from age rather than decayed on a schedule,
// same approach as activeEmotionIntensity.
function memoryStrength(mem, currentTick) {
  const halflife = 3 + mem.importance * 35;
  return mem.importance * Math.pow(0.5, Math.max(0, currentTick - mem.tick) / halflife);
}

function memoryStrengthForEvent(agent, eventId, currentTick) {
  const mem = agent.mind.memories.find(m => m.eventId === eventId);
  return mem ? memoryStrength(mem, currentTick) : 0; // no memory record left = genuinely forgotten
}

function addMemory(agent, eventId, tick, importance) {
  // Trivial old memories quietly drop out as new ones form — nothing sits
  // around forever just because it happened once.
  agent.mind.memories = agent.mind.memories.filter(m => memoryStrength(m, tick) > 0.03);
  agent.mind.memories.push({ id: `${agent.id}-mem${eventId}`, eventId, tick, importance });
  if (agent.mind.memories.length > 40) agent.mind.memories.shift();
}
```

**D-01's substitution:** `beliefConfidence(belief, tick)` should use `belief.confidence` where `memoryStrength` uses `mem.importance` — same `halflife = 3 + X*35`, same `X * 0.5^(Δt/halflife)` shape, same `Math.max(0, currentTick - tick)` age clamp against negative-age edge cases.

**D-02/D-03's exemption + prune-on-push attachment points** — two belief-push sites, both need the filter, mirroring `addMemory`'s `.filter(m => memoryStrength(m, tick) > 0.03)` line immediately before the `.push(...)`:

**Site A — witnessed belief formation**, inside `perceiveEvent()`, `sim.js:602-611`:
```javascript
witness.mind.beliefs.push({
  id: `${witnessId}-ev${event.id}`,
  subject: event.actor,
  predicate: `did:${event.verb}`,
  data: event.data,
  confidence: 1.0,
  source: 'witnessed',
  tick: event.tick,
  eventId: event.id,
});
```
(A freshly witnessed belief is always confidence 1.0 — pruning here mainly matters for filtering the *existing* array before this push, same as `addMemory` filters before its own push.)

**Site B — `applyClaimBelief`'s push**, `sim.js:892-902`:
```javascript
witness.mind.beliefs.push({
  id: `${witness.id}-claim${eventId}`,
  subject: claim.subject,
  predicate: claim.predicate,
  data: claim,
  confidence: clamp(effectiveConfidence, 0, 1),
  source: contradicted ? `${source} (known false)` : source,
  tick,
  eventId,
  contested,
});
```
**D-02's exemption tag is created right here** — `source: contradicted ? \`${source} (known false)\` : source` at line 898 is the exact string pattern the prune filter must check for (`source.includes('known false')`) and skip regardless of decayed confidence. `contradicted` beliefs are pushed with `confidence: 0` (line 838: `let effectiveConfidence = contradicted ? 0 : confidence;`), so a naive `beliefConfidence(...) > floor` filter would delete them immediately — D-02 exists specifically to special-case this tag.

**No new tick loop** — D-03 explicitly matches `addMemory`'s shape: filter happens at push time, not via a sweep. Both belief-push sites above need the same `agent.mind.beliefs = agent.mind.beliefs.filter(b => b.source.includes('known false') || beliefConfidence(b, tick) > 0.03)` (or equivalent) immediately before their respective `.push(...)`.

---

### Unit 2: Needs regeneration — `needValue()` live accessor + structural shape change (D-04)

**Analog:** `activeEmotionIntensity()` (`sim.js:485-489`) and `memoryStrength()` (`sim.js:496-499`) — both are the "computed live from `(storedValue, formedTick, currentTick)`, never decayed on a schedule" idiom this phase must extend to needs.

```javascript
function activeEmotionIntensity(agent, emotion, targetId, currentTick) {
  return agent.mind.emotions
    .filter(e => e.emotion === emotion && e.target === targetId)
    .reduce((sum, e) => sum + e.intensity * Math.pow(0.5, (currentTick - e.tick) / EMOTION_HALFLIFE_TICKS), 0);
}
```

**Current flat-number shape to change** (`sim.js:80`, inside `makeAgent`):
```javascript
needs: { safety: 1, sustenance: 1, belonging: 0.6, ...(opts.needs || {}) },
```
→ becomes `{ safety: { value: 1, tick: 0 }, sustenance: { value: 1, tick: 0 }, belonging: { value: 0.6, tick: 0 }, ...(opts.needs || {}) }` (exact opts-spread semantics need care if any test fixture passes flat `opts.needs` overrides — grep for `opts.needs` / `{ needs:` in any driver scripts before assuming none exist; `scripts/verify.js` and `CLONE_SPEC`/`ORDER_SPEC` fixtures in this file were checked and none currently override `needs`, so this shape change has no fixture blast radius as of this read).

**The one existing mutator, which must change to write `{value, tick}` instead of a raw number** (`sim.js:476-478`):
```javascript
function adjustNeed(agent, needName, delta) {
  agent.mind.needs[needName] = clamp((agent.mind.needs[needName] ?? 1) + delta, 0, 1);
}
```
This function currently has no `tick`/`world` parameter. Both call sites pass no tick today and both have `world` in scope at the call site — the signature will need a `tick` (or `world`) parameter added, and reads of `agent.mind.needs[needName]` inside it need to become `agent.mind.needs[needName].value` (with the same `?? 1` fallback logic — careful, the fallback default differs by need key: `belonging` defaults to `0.6`, not `1`, per `sim.js:80`; `?? 1` in the current code is already slightly imprecise for `belonging` and worth checking against `needValue`'s own default-fill logic rather than copying blindly).

**Tick-stamp convention — must match, or every fresh need gets phantom regen:** `adjustNeed` fires inside `applyEffects`, which runs *before* the line that increments the tick (`tick: world.tick++` inside the `event` object literal, `sim.js:295`, executed *after* `applyEffects` returns, `sim.js:291`). Meanwhile every reader in `scoreCandidates`/elsewhere passes `event.tick` — the *post-increment* tick that gets stamped onto the event. Because `applyEffects` runs before the increment, `world.tick` at the moment `adjustNeed` would stamp `.tick` is the *pre*-increment value, which is the same value `event.tick` ends up holding once the event object is built one line later. These coincide (Δt = 0 at formation) only if `adjustNeed`'s new `tick` parameter is threaded through consistently as the same tick value that ends up on `event.tick` — pass `world.tick` (read before increment, inside `applyEffects`) at the call site, not a value read after `performAction`'s increment has already happened, or a stamped need will read as one tick stale (or fresh with negative Δt) the moment `needValue()` first reads it back.

**Both call sites that need updating to pass tick** (both already have `world` or `event.tick` in scope):
- `sim.js:365` — `adjustNeed(target, 'sustenance', -0.4)`, inside `applyEffects`'s `Take` case, which receives `world` as a parameter (`world.tick` available, pre-increment — see tick-stamp convention above).
- `sim.js:383` — `adjustNeed(target, 'safety', -0.4)`, inside `applyEffects`'s `Attack` case, same `world` in scope.

**Every raw read site of `agent.mind.needs.<key>` that must become a `needValue()` call — the highest-risk structural change in this phase.** Grepped fresh across `sim.js` (both `\.needs` and a bare `needs` token, to also rule out a destructured `const { needs } = agent.mind` read that a dotted-path grep would miss — none found), `presentation.js`, `parser.js`, and `scripts/verify.js`; these are the only four hits in `sim.js`, plus two in `presentation.js`:

| File | Line | Current code | Fix |
|---|---|---|---|
| `sim.js` | 80 | `needs: { safety: 1, sustenance: 1, belonging: 0.6, ... }` | becomes `{ value, tick }` shape (see above) |
| `sim.js` | 477 | `agent.mind.needs[needName] = clamp((agent.mind.needs[needName] ?? 1) + delta, 0, 1);` | write `.value`, stamp `.tick` |
| `sim.js` | **1172** | `if (rel.fear > 0.3 \|\| witness.mind.needs.safety < 0.7 \|\| fearEmotion > 0.2) {` | → `needValue(witness, 'safety', event.tick) < 0.7` (and see D-07 below — this literal threshold is what becomes the hysteresis band) |
| `sim.js` | **1177** | `'low safety': (1 - witness.mind.needs.safety) * 0.3 * (1 - boldness),` | → `(1 - needValue(witness, 'safety', event.tick)) * 0.3 * (1 - boldness)` — **this second raw read is easy to miss**; it is one line below the gate at 1172, inside the same `retreatTerms` object literal, and CONTEXT.md's `<canonical_refs>` only names line 1172. Both are inside `scoreCandidates()`, which already has `event.tick` in scope (used throughout the function, e.g. `activeEmotionIntensity(witness, 'Fear', actorId, event.tick)` at line 1171). |

**Outside `sim.js` — flagged as a required consequential change despite the phase's "modifies sim.js only" framing:**

| File | Line | Current code | Why it breaks |
|---|---|---|---|
| `presentation.js` | 76-78 | `Object.entries(m.needs).map(([need, v]) => ...v.toFixed(2)...)` inside the Needs bar-list render | `v` becomes `{ value, tick }`, not a number — `v.toFixed(2)` throws `TypeError: v.toFixed is not a function` the instant this renders after D-04 lands. Needs `Sim.needValue(agent, need, world.tick)` in place of raw `v`, or a `v.value` read (accessor is preferable — see Shared Patterns below). |
| `presentation.js` | 164 | `Object.entries(m.needs).map(([k, v]) => \`${k}=${v.toFixed(2)}\`)` in `buildDebugReport()` | Same failure, same fix, in the plain-text debug report. |

Neither of these is a new file and neither is `sim.js`, but both are read-sites of the exact field this phase restructures, and both will throw (not silently misbehave) the first time the mind inspector or debug report is opened after this phase lands, if left unpatched. `presentation.js`'s own top-of-file comment ("Reads engine state through `sim.js`'s public API... and never mutates world state directly") is consistent with fixing this via a new `Sim.needValue` export rather than reaching into `m.needs[key].value` directly from the presentation layer — see Shared Patterns.

**D-05's asymmetric default note:** `belonging`'s default is `0.6`, not `1` like the other two — `needValue()`'s asymptotic-approach-to-1 formula (`value += rate * (1 - value)` per elapsed tick, per D-04) still targets `1` for `belonging` too (CONTEXT.md is explicit: "passive drift toward 1" is "the general rule," `belonging` additionally gets D-05's explicit triggers on top). No special-casing needed in the formula itself, only in the initial default.

**Purity constraint — `needValue()` and `beliefConfidence()` must be read-only, exactly like their analogs:** `memoryStrength()` and `activeEmotionIntensity()` never write back to the object they read (`sim.js:485-499` — both are pure functions of their arguments, no assignment anywhere in either body). `needValue(agent, needKey, currentTick)` and `beliefConfidence(belief, tick)` must follow the same discipline: computing the regenerated/decayed value at read time and *not* writing it back into `agent.mind.needs[key].value`/`.tick` or `belief.confidence` as a caching side effect. This matters beyond style — see Baseline Blast Radius below: `snapshotWorld()` serializes whichever raw stored values are on the object at snapshot time, so a lazy write-back would make snapshot output depend on *what got read, and when* before the snapshot was taken, silently breaking the golden-master baseline's determinism (two runs with identical inputs but different read patterns along the way would snapshot differently). Keep both accessors pure; only `adjustNeed()` (an explicit, already-mutating function) and D-05's new Give/Tell hooks are allowed to write `mind.needs`, and only `applyClaimBelief`/witnessed-belief-formation's existing pushes are allowed to write `mind.beliefs`.

---

### Unit 3: `belonging`'s first trigger — positive Give / friendly Tell (D-05)

**No existing hook to extend** — checked `applyEffects`'s `Give` case (`sim.js:370-377`) and `Tell` case (`sim.js:386-389`); neither currently calls `adjustNeed` or touches `mind.needs` at all. This is new code, but the shape to mirror already exists twice in the same function, for the other two needs:

**Analog A — Take's inline sustenance hook** (`sim.js:358-369`, full `Take` case):
```javascript
case 'Take': {
  const target = getAgent(world, params.targetId);
  const item = params.item || 'bread';
  const qty = Math.min(params.quantity || 1, target.inventory[item] || 0);
  target.inventory[item] -= qty;
  actor.inventory[item] = (actor.inventory[item] || 0) + qty;
  if (!target.isPlayer && item === 'bread' && target.inventory.bread === 0) {
    adjustNeed(target, 'sustenance', -0.4);
    upsertGoal(target, 'ReplenishFood', null, 0.4, world.tick, 'future');
  }
  return { location: actor.location, data: { targetId: target.id, item, quantity: qty, consented: false } };
}
```

**Analog B — Attack's inline safety hook** (`sim.js:378-385`, full `Attack` case):
```javascript
case 'Attack': {
  const target = getAgent(world, params.targetId);
  const damage = 15 + Math.floor(rngOf(world)() * 15);
  target.health = Math.max(0, target.health - damage);
  if (target.health === 0) target.alive = false;
  if (!target.isPlayer) adjustNeed(target, 'safety', -0.4);
  return { location: actor.location, data: { targetId: target.id, damage, targetSurvived: target.alive } };
}
```

**The load-bearing detail in both analogs, easy to miss:** both guard with `!target.isPlayer` (or equivalent) before calling `adjustNeed`, because `world.agents.player.mind` is `null` (`makeAgent`, `sim.js:69`: `mind: isPlayer ? null : { ... }`). D-05's trigger raises the **giver's**/**teller's** own belonging (the *actor*, not the target) — so the guard must be `!actor.isPlayer`, not `!target.isPlayer`, since it's the player who could be the one performing `Give`/`Tell` and has no `mind` to adjust. Calling `adjustNeed` on a player actor without this guard throws immediately (`Cannot read properties of null`).

**Current `Give` case, where the trigger attaches** (`sim.js:370-377`):
```javascript
case 'Give': {
  const target = getAgent(world, params.targetId);
  const item = params.item || 'bread';
  const qty = Math.min(params.quantity || 1, actor.inventory[item] || 0);
  actor.inventory[item] -= qty;
  target.inventory[item] = (target.inventory[item] || 0) + qty;
  return { location: actor.location, data: { targetId: target.id, item, quantity: qty, consented: true } };
}
```
Note `consented: true` is already hardcoded for every `Give` — there is no "coercive framing" flag anywhere in `Give`'s params (confirmed against `parser.js:46-52`, which always produces plain `{ targetId, item, quantity }`; `Take` is the codebase's only coercive-transfer verb, always `consented: false`, `sim.js:368`). This means D-05's "no coercive framing" qualifier is **already satisfied by every `Give` unconditionally** — no new detection logic is needed to distinguish a "positive" Give from a coercive one; that distinction is `Give` vs. `Take`, which already exists.

**Current `Tell` case, where the vouching trigger attaches** (`sim.js:386-389`):
```javascript
case 'Tell': {
  const target = getAgent(world, params.targetId);
  return { location: actor.location, data: { targetId: target.id, claim: params.claim } };
}
```
`params.claim.predicate === 'is_trustworthy'` is the exact discriminator named in D-05 ("vouching for someone, `is_trustworthy` claims") — `params.claim` is already available in scope here, same object `perceiveEvent`'s existing `is_trustworthy` handling reads at `sim.js:961-964` (`applyClaimBelief`'s `is_trustworthy` branch, for reference on how this predicate is otherwise treated: `rel.trust = clamp(rel.trust + 0.2 * confidence, 0, 1); rel.affection = clamp(rel.affection + 0.1 * confidence, -1, 1);`).

---

### Unit 4: Retreat-gate hysteresis (D-07)

**Self-modification target, not a borrowed analog** — the block to change is `scoreCandidates()`'s retreat candidate, `sim.js:1171-1187`:
```javascript
const fearEmotion = activeEmotionIntensity(witness, 'Fear', actorId, event.tick);
if (rel.fear > 0.3 || witness.mind.needs.safety < 0.7 || fearEmotion > 0.2) {
  // Valuing Safety highly makes the pull to get away from danger stronger on top
  // of how scared the witness actually is right now.
  const retreatTerms = {
    fear: (rel.fear * 0.6 + fearEmotion * 0.3) * (1 - boldness),
    'low safety': (1 - witness.mind.needs.safety) * 0.3 * (1 - boldness),
    Safety: getValueWeight(witness, 'Safety') * 0.15,
  };
  const retreatScore = Object.values(retreatTerms).reduce((a, b) => a + b, 0);
  candidates.push({
    action: (why) => performAction(world, witness.id, 'Move', { toLocation: 'away' }, { causedBy: event.id, why }),
    label: 'retreat',
    score: retreatScore,
    terms: retreatTerms,
  });
}
```
Both `witness.mind.needs.safety` reads inside this block (line 1172's gate, line 1177's term) need the `needValue()` swap from Unit 2 regardless of D-07 — D-04 and D-07 land in the same lines.

**"Currently retreating" state — no existing field or scan pattern for this in the codebase today.** Candidates for the mechanism (left to planner's discretion per CONTEXT.md):
- **Log-scan approach:** `witness.mind.log` entries already carry `chose` (a label string like `'retreat'`, set at `sim.js:1232` in `decideAndAct`) and `tick`. A most-recent-log-entry scan (`witness.mind.log[witness.mind.log.length - 1]?.chose === 'retreat'`) is cheap and needs no new mutable state, consistent with this file's "no sweep loop, compute live" idiom — but note `mind.log` is *not* capped the way `mind.emotions` is (`sim.js:482`, cap of 20) or `mind.memories` is (`sim.js:511`, cap of 40); `mind.log` grows unboundedly today, so `[length - 1]` is still cheap and correct regardless, this is just a note that the log-scan approach doesn't introduce a new unbounded-growth risk, it inherits an existing one untouched by this phase.
- **New field approach:** a boolean like `witness.mind.retreatingForSafety` set/cleared inside `decideAndAct` or `scoreCandidates` when the retreat candidate wins/is superseded. This is genuinely new mutable state (not present in the `mind` box table in `CLAUDE.md`) — if chosen, `PERSON-MODEL.md` will need a one-line update per `CLAUDE.md`'s "when the person model changes, update `PERSON-MODEL.md` in the same change" rule.

**Where `Sim.TUNING` receives the two new threshold constants (D-06/D-07's shared-constants-block rule, carried from Phase 1):**
```javascript
// sim.js:44-51, currently:
const TUNING = {};
```
This is exported as `Sim.TUNING` at `sim.js:1779` and is deliberately empty today — Phase 1's own comment (`sim.js:44-50`) says it "ships empty this phase" for exactly this reason: later phases fill it. D-07's `0.65`/`0.75` thresholds (or whatever names the planner picks, e.g. `TUNING.retreatSafetyLow` / `TUNING.retreatSafetyHigh`) and D-04's regen rate constant both belong here, not as inline magic numbers in `scoreCandidates`.

---

## Baseline blast radius (Phase 1/2 regression + ordering harness)

`scripts/verify.js` (read in full this pass) is the Node-only entry point for two golden-master checks defined in `sim.js` itself: `Sim.runRegressionCheck()` (Plan 01-02/01-03) and `Sim.runOrderingCheck()` (Plan 02-01). Both diff a live snapshot against JSON committed to disk. Three baseline artifacts exist on disk right now, confirmed present:

- `scripts/baseline.json` (21,185 bytes) — loaded at `verify.js:109`, diffed inside `Sim.runRegressionCheck({ baseline })` against `snapshotWorld()`'s output for the two `buildCloneVariant()` worlds. Confirmed by direct read: contains literal `"needs": { "safety": 1, "sustenance": 1, "belonging": 0.6 }`-shaped entries (e.g. lines 200-204, 356-359) for every serialized agent.
- `scripts/order-baseline.json` (3,408 bytes) — loaded at `verify.js:113`, diffed against `orderingSnapshot()`'s output for `buildOrderingScenario()`.
- `scripts/order-prefix.json` (4,778 bytes) — the ORDER-02 "before" comparison snapshot (`verify.js:115`, `--capture-prefix-order`), informational only, never gates the exit code (`verify.js:180-181`).
- No `scripts/known-mismatch.json` is present on disk — the acknowledgement-list mechanism (`verify.js:41-79`) is currently empty, and `snapshot-matches-baseline`/`order-matches-baseline` are explicitly on the `NON_ACKNOWLEDGEABLE_CHECK_NAMES` set (`verify.js:41`) regardless — **neither can ever be silenced by an entry in that file**, only by running `--update-baseline` after a human reviews the diff.

**Four independent mechanisms in this phase will produce a non-empty baseline diff, and one can flip a qualitative check outright:**

1. **D-04's shape change is a guaranteed, unconditional diff.** `snapshotWorld()` (`sim.js:1338-1351`) serializes whole agent objects including `mind.needs` verbatim. The moment `needs.safety: 1` becomes `needs.safety: { value: 1, tick: 0 }`, `diffSnapshots()` reports a removal at path `...needs.safety` plus additions at `...needs.safety.value` and `...needs.safety.tick`, for every serialized agent, in both the `jungle` and `averse` snapshots `runRegressionCheck` produces, and in `runOrderingCheck`'s snapshot too (`orderingSnapshot()` doesn't serialize `mind` directly, but `runOrderingCheck`'s own `opts.baseline` diff is against `orderingSnapshot()`'s output, which is witness-order/reaction data, not needs — the needs diff specifically hits `runRegressionCheck`'s `snapshot-matches-baseline`, not `order-matches-baseline`, unless D-07 also reorders witnesses, see point 3).
2. **D-03's pruning changes `mind.beliefs` array contents/length** wherever any belief in either baseline scenario has decayed below the floor by the tick it's snapshotted — diffs at `...beliefs.<index>` paths, possibly a length change reported as addition/removal at the array's tail (`diffSnapshots`' array-length handling, `sim.js:1369-1374`).
3. **D-07's gate change can reorder `witnessOrder`, not just diff a value.** `orderWitnesses()` (`sim.js:444-467`) ranks witnesses by `candidates[0].score` from `scoreCandidates()` — the retreat candidate's presence (gated by the very `safety` threshold this phase changes) and its score both feed that ranking. If the hysteresis band changes whether/when the retreat candidate exists or wins for any witness in `buildOrderingScenario()` (`ORDER_SPEC`, `sim.js:1588-1612`), `runOrderingCheck`'s qualitative checks — `victim-dispatched-first`, `indifferent-witness-dispatched-last`, `dispatch-order-differs-from-agent-list` (`sim.js:1699-1745`) — are not guaranteed to keep passing; this is a real correctness risk to verify, not just a diff to re-bless.
4. **D-04's regeneration rate is coupled to the locked Phase 2 `ORDER_SPEC` fixture, not a free parameter.** In `buildOrderingScenario()`, the victim (`garrick`) is Attacked, dropping `safety` to `0.6` via `adjustNeed(target, 'safety', -0.4)` (`sim.js:383`, from `1`). Whether `needValue()` regenerates that back across the new `0.65`/`0.75` hysteresis thresholds *before* later witnesses in the same dispatch sequence are scored depends on how many ticks elapse between garrick's Attack and each subsequent witness's `scoreCandidates()` call, multiplied by whatever regen-rate constant lands in `TUNING`. A rate picked without checking this against `ORDER_SPEC`'s witness count/tick spacing risks silently flipping `runOrderingCheck`'s qualitative checks, not just producing an expected structural diff. Recommend the plan explicitly runs `node scripts/verify.js` after wiring D-04+D-07 together and reads the ordering section of the output before choosing a final rate constant, rather than tuning the rate against Unit 1-3 changes in isolation.

**Regeneration command, from `verify.js`'s own comments and flags:**
```
node scripts/verify.js                    # plain run — will show FAIL / non-empty diffs after D-04 lands, expected
node scripts/verify.js --update-baseline  # human-reviewed re-bless: refuses (verify.js:237-245) if any
                                           # *qualitative* check still fails un-acknowledged; the two
                                           # baseline-diff checks themselves are exempt from that refusal
                                           # gate (verify.js:41, 231-232) specifically so a legitimate
                                           # structural change like this phase's can be re-blessed at all
```
The planner should treat "run `--update-baseline` once the qualitative checks pass and the diff is reviewed as expected-and-explained" as an explicit task step for this phase, not an afterthought — `verify.js:146-151`/`169-174` print an actionable reminder if a baseline file goes missing, but a *present-but-stale* baseline (this phase's actual failure mode) instead prints as `FAIL snapshot-matches-baseline` / `FAIL order-matches-baseline` with a full field-by-field diff (`verify.js:141-144`, `156-159`), which is the expected, correct signal here — not a bug to chase.

---

## Shared Patterns

### Computed-live-at-read idiom (applies to Units 1 and 2)
**Source:** `activeEmotionIntensity()` (`sim.js:485-489`), `memoryStrength()` (`sim.js:496-499`)
**Apply to:** `beliefConfidence()` and `needValue()`, both new this phase.
```javascript
function activeEmotionIntensity(agent, emotion, targetId, currentTick) {
  return agent.mind.emotions
    .filter(e => e.emotion === emotion && e.target === targetId)
    .reduce((sum, e) => sum + e.intensity * Math.pow(0.5, (currentTick - e.tick) / EMOTION_HALFLIFE_TICKS), 0);
}
```
No sweep/tick loop exists anywhere in `sim.js` (confirmed by re-reading the full file this pass — there is still no `setInterval`, no per-tick update pass, nothing resembling a game loop; `world.tick` only advances inside `performAction()`, `sim.js:295`). Every new decay/regen function in this phase must follow this same `(storedValue, formedTick, currentTick) -> liveValue` shape, and must be pure — see the Purity constraint at the end of Unit 2 and the Baseline blast radius section above for why a write-back-on-read would break the golden-master snapshot's determinism.

### `Sim.TUNING` as the landing spot for new constants
**Source:** `sim.js:44-51` (declaration), `sim.js:1779` (export)
**Apply to:** D-04's regen rate, D-07's hysteresis thresholds, D-02's prune floor only if it diverges from `0.03`.
Currently `const TUNING = {};` — deliberately empty, per Phase 1's own comment explaining it ships empty so later phases (this one) fill it.

### Public API surface — `Sim` object export
**Source:** `sim.js:1773-1797`
```javascript
const Sim = {
  LOCATIONS, VERBS, VALUES, WORLDVIEW_BELIEFS, PREDICATE_LABELS, TUNING,
  isDriftEnabled, DEFAULT_SEED, seedRng, createWorld, performAction, getAgent,
  appraiseEvent, scoreCandidates, memoryStrength, scenarioParticipants,
  snapshotWorld, diffSnapshots, formatDiff, runRegressionCheck,
  buildOrderingScenario, orderingSnapshot, runOrderingCheck,
};
```
Note `memoryStrength` is already exported here (used by `presentation.js:94`, `Sim.memoryStrength(mem, world.tick)`, inside the Memories render). If `presentation.js`'s needs-bar rendering is fixed via a `Sim.needValue(agent, needKey, tick)` call (recommended — keeps `presentation.js` reading through the public API, per its own top-of-file comment), `needValue` (and possibly `beliefConfidence`, if belief-confidence display anywhere needs the live value rather than the stored one — check `presentation.js:86-90`'s belief render, which currently reads `b.confidence` raw, not live-decayed; whether that raw read also needs a `Sim.beliefConfidence()` swap is in scope for D-01 to decide, not assumed here) needs adding to this export list.

### `!actor.isPlayer` / `!target.isPlayer` guard before any `adjustNeed` call
**Source:** `sim.js:364` (`!target.isPlayer`), `sim.js:383` (`!target.isPlayer`)
**Apply to:** D-05's new Give/Tell hooks, guarding on `!actor.isPlayer` instead (see Unit 3 above for why the guarded party differs).
The player agent has `mind: null` (`sim.js:69`); any unguarded `adjustNeed(player, ...)` throws.

---

## No Analog Found

| Logical unit | Role | Data Flow | Reason |
|---|---|---|---|
| `belonging` Give/Tell trigger's specific magnitude tuning | event-driven mutator | event-driven | No existing "how much does a positive social act raise a need" precedent in the codebase — Take/Attack's existing hooks are both *negative* (-0.4 flat), giving no precedent for a positive-need-delta magnitude. Left to Claude's discretion per CONTEXT.md; `TUNING` is still the right landing spot for whatever constant is chosen. |
| "Currently retreating" state mechanism (D-07) | control-flow state | — | No existing per-agent "currently doing X" boolean or log-scan pattern anywhere in `mind` — see Unit 4's two candidate mechanisms, both plausible, neither has a direct precedent. |

## Metadata

**Analog search scope:** `sim.js` (full file, 1800 lines, single read), `presentation.js` (lines 1-180 read directly; full-file grep for `.needs` confirmed no further hits beyond lines 76-78 and 164), `parser.js` (full file, 101 lines), `scripts/verify.js` (read in full, 258 lines — baseline-path constants, `--update-baseline`/`--capture-prefix-order` flags, and the never-acknowledgeable check-name gate all confirmed directly from source), `scripts/baseline.json` (grepped for `"needs"`, confirmed current flat-number shape on disk), `PERSON-MODEL.md` (grepped for `belonging`, confirms "wired to nothing anywhere — pure stub, permanently" at line 219, matching CONTEXT.md's framing).
**Files scanned:** `sim.js`, `presentation.js`, `parser.js`, `scripts/verify.js`, `scripts/baseline.json`, `scripts/order-baseline.json` (existence confirmed via directory listing), `scripts/order-prefix.json` (existence confirmed via directory listing), `PERSON-MODEL.md`, `CLAUDE.md`
**Pattern extraction date:** 2026-08-13
