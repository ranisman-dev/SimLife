# Phase 4: Tell/Move-Aware Memory Importance - Pattern Map

**Mapped:** 2026-08-13
**Files analyzed:** 1 modified (`sim.js`), 1 modified (`scripts/verify.js`), 2 golden-master
baseline artifacts flagged as needing regeneration (`scripts/baseline.json`,
`scripts/order-baseline.json`), 2 doc files flagged for the mandatory sync
(`PERSON-MODEL.md`, `CLAUDE.md`)
**Analogs found:** 5 / 5 logical units (all analogs are intra-file — this phase touches no
new files; every "closest analog" is another function/block already in `sim.js`, or the
`runDecayCheck`/`verify.js` wiring pattern Phase 3 established for exactly this kind of
qualitative-check addition)

**Re-read note:** `sim.js` is 2,474 lines. Read via six non-overlapping targeted `Read` calls
this pass (lines 1-100, 379-478, 500-590, 590-830, 1060-1140, 1992-2474), each covering a
distinct region named in `04-CONTEXT.md`'s `<canonical_refs>`. All line numbers below were
confirmed live against the current file. **In addition, the damping-magnitude claims in
Units 2 and 3 below were verified numerically against the live `Sim.appraiseEvent`/
`generalCareOf` formulas via `node -e` (allowlisted), not estimated** — see the inline
numbers and the reasoning was corrected after a first pass understated how much the
existing generic scaling block damps Tell/Move impacts (see Units 2 and 3).

## File Classification

This phase adds no new files. Each row is a logical unit inside `sim.js` (or `scripts/verify.js`), classified the same way a new file would be.

| Logical Unit | Role | Data Flow | Closest Analog (in-file) | Match Quality |
|---|---|---|---|---|
| `appraiseEvent`'s `Tell` branch + severity table (D-01/D-02) | utility (pure appraisal/scoring) | transform (computed-live, called twice) | `appraiseEvent`'s existing `Take`/`Attack`/`Give` branches, `sim.js:785-794` | exact |
| `isVictim`/`victimAffection` block extension for Tell's `claim.subject` (D-03) | utility (pure appraisal scaling) | transform | the existing generic block itself, `sim.js:796-799` | exact (self-extension) — **but see the numeric compounding warning in Unit 2** |
| `appraiseEvent`'s `Move` branch + causal-chain check (D-04) | utility (pure appraisal/scoring) | transform | `applyClaimBelief`'s `matchedEvent` world-ledger trace, `sim.js:1080-1089` | exact — **but see the numeric floor-collapse warning in Unit 3** |
| `perceiveEvent`'s `addMemory` clamp ceiling (D-05) | config constant + one-line call-site change | transform | `TUNING.needRegenRate`/`retreatSafetyEnter`/`retreatSafetyExit` (Phase 3's `TUNING` additions), `sim.js:74, 94-95` | exact |
| New MEMORY-01/MEMORY-02 check function, wired into `verify.js` | test/check runner | request-response (build world, assert, return `{pass, checks}`) | `runDecayCheck()`, `sim.js:2002-2439`, and its `verify.js` wiring, `verify.js:121-123, 132, 180-181` | exact |

---

## Numeric verification: the generic damping block eats most of D-01/D-04's suggested magnitudes

Before the per-unit patterns, one finding that changes how those magnitudes must be read.
Computed live against the actual fixture agents (`node -e` against `Sim.createWorld()` +
`Sim.seedRng()`, no hand-waving — reproducible by re-running the same probes):

**`generalCareOf(witness) * 0.3`** (the multiplier the generic block at `sim.js:798` applies
whenever `victimAffection <= 0`, which is the branch a `Move` event ALWAYS falls into — see
Unit 3) for the five fixture NPCs:

| Witness | `generalCareOf` | `generalCareOf * 0.3` |
|---|---|---|
| mara | 0.395 | 0.1185 |
| ives | 0.130 | 0.0390 |
| tomas | 0.170 | 0.0510 |
| elena | 0.715 | 0.2145 |
| garrick | 0.300 | 0.0900 |

Applying D-04's suggested base `-0.5` through this multiplier: `|impact|` = `0.0195`
(ives), `0.0255` (tomas), `0.0450` (garrick), `0.0593` (mara), `0.1073` (elena). **Four of
five fixture witnesses land below `0.1`** — `addMemory`'s `clamp(Math.abs(impact), 0.1,
TUNING.maxMemoryImportance)` (`sim.js:720`) then clamps them all back UP to exactly `0.1`,
the literal floor value MEMORY-01 exists to move memories off of. Only `elena` — the fixture
agent with the highest `agreeableness`/`Compassion`/`Community` weights — clears the floor at
all, and only barely.

**The same collapse hits overheard `Tell`.** Simulating an overheard `is_dead` claim (witness
is not the told party, so the generic block's `victimAffection > 0` boost branch applies
instead, using default relationship affection ≈0.3, and D-02's overheard confidence formula
`clamp(0.2 + trust*0.3 + credulity*0.1, 0, 1)`):

| Witness | trust | overheard confidence | `victimAffection` | `generalCareOf` | resulting `impact` |
|---|---|---|---|---|---|
| mara | 0.500 | 0.380 | 0.300 | 0.395 | -0.1013 |
| ives | 0.500 | 0.330 | 0.300 | 0.130 | -0.0290 |
| tomas | 0.300 | 0.290 | 0.300 | 0.170 | -0.0333 |
| elena | 0.560 | 0.438 | 0.345 | 0.715 | -0.2431 |
| garrick | 0.440 | 0.332 | 0.255 | 0.300 | -0.0571 |

Three of five (ives, tomas, garrick) collapse to the floor again — for `is_dead`, D-01's
highest-severity predicate, overheard by a bystander. Only the **direct-told** case (which
skips the generic block entirely, since `isVictim = true` there) reliably produces real
signal: `-1 * 1.5 * clamp(0.4 + trust*0.5 + credulity*0.15, 0, 1)` ≈ `-0.975` for mara's
trust of 0.5 — comfortably above the floor and using real range up toward the new `1.5`
ceiling.

**What this means for the plan, concretely:** D-01/D-04's stated magnitudes (`1.5`, `1.0`,
`0.7`, `0.6`, `0.4`, `-0.5`) are the values BEFORE the generic post-branch scaling runs, not
the values `addMemory` will actually see. The planner must choose one of:
1. **Accept the floor-collapse for bystanders/overhearers/generic Move as correct behavior**
   ("a bystander who overheard something secondhand about someone they don't especially care
   about should form a weak memory, same as before") and scope MEMORY-01's success criterion
   to the direct-told/flagship case only — in which case the check function (Unit 5) must
   assert against the direct-told scenario specifically, not an arbitrary Tell/Move.
2. **Size the severity table/flight-impact magnitude up** so that even after the worst-case
   fixture multiplier (`ives`'s 0.039, the smallest `generalCareOf*0.3` in the table above),
   the result still clears `0.1` by a stated margin — e.g. a `Move` flight impact of `-3.0`
   rather than `-0.5` would put `ives` at `-0.117`, just over the floor. **Constraint on any
   rescaled magnitude:** it must stay below the SAME witness's impact for the causing Attack/Take
   event, or a bystander ends up remembering someone fleeing more vividly than the violence they
   fled from. Checked: at `-3.0`, elena's flight-Move impact is `3.0 * 0.2145` ≈ `0.64`, while
   elena witnessing the SAME causing Attack (a non-victim witness, so the boost arm of the
   generic block applies: `1.2 * victimAffection * generalCareOf * 1.5`) lands around `0.44` —
   already inverted at this magnitude. A rescaled Move base should be picked low enough to keep
   this ordering intact, or the plan should explicitly accept and justify the inversion.
3. **Exempt `Tell`/`Move` from the generic block** the way an `isVictim`-only verb would
   (structurally larger change, not what D-03/D-04's text asks for, but worth naming as the
   rejected alternative).
This is a real constraint the plan must resolve and state, not a caveat to note in passing —
see Units 2 and 3 below for where each option attaches structurally.

---

## Pattern Assignments

### Unit 1: `appraiseEvent`'s `Tell` branch — severity table + duplicated confidence formula (D-01, D-02)

**Analog:** `appraiseEvent`'s existing verb branches, `sim.js:779-802` (read in full, reproduced below):

```javascript
function appraiseEvent(world, witness, event) {
  const isVictim = event.data && event.data.targetId === witness.id;
  const victimAffection = (!isVictim && event.data && event.data.targetId) ? relOf(witness, event.data.targetId).affection : 0;
  const scale = event.data && event.data.quantity ? clamp(event.data.quantity / 2, 1, 3) : 1;
  let impact = 0;

  if (event.verb === 'Take' && event.data.consented === false) {
    const justiceWeight = getValueWeight(witness, 'Justice');
    const offense = clamp(0.5 + justiceWeight * 0.5, 0, 1); // absent Justice value -> moderate baseline offense
    impact = -1 * offense * scale;
  } else if (event.verb === 'Attack') {
    const safetyWeight = getValueWeight(witness, 'Safety'); // absent Safety value -> baseline -1.2
    impact = -1.2 * (1 + safetyWeight * 0.3);
  } else if (event.verb === 'Give') {
    impact = 0.4 * scale;
  }

  if (!isVictim) {
    const generalCare = generalCareOf(witness);
    impact *= victimAffection > 0 ? victimAffection * generalCare * 1.5 : generalCare * 0.3;
  }

  return { isVictim, impact, event };
}
```

**The template to follow exactly:** each verb gets its own `if`/`else if` arm inside the
existing chain (line 785 onward), assigning to the same `impact` local, before the shared
`if (!isVictim) { ... }` block runs. A new `Tell` arm attaches as another `else if
(event.verb === 'Tell')` in this same chain — do not create a separate function or a switch
statement; every existing branch here is an inline `if`/`else if`, not a `switch` (unlike
`checkPreconditions`/`applyEffects`, which do use `switch (verb) { case 'X': { ... } }`
block-scoping — `appraiseEvent` deliberately does not follow that pattern, and Tell/Move
should match `appraiseEvent`'s own local convention, not the other two functions).

**D-01's severity table — no existing table-shaped constant to mirror exactly, but the
calibration source is real and load-bearing:** `applyClaimBelief`'s per-predicate magnitudes,
`sim.js:1099-1122`:

```javascript
if (claim.predicate === 'stole_from' || claim.predicate === 'attacked') {
  const rel = relOf(witness, claim.subject);
  rel.trust = clamp(rel.trust - 0.25 * effectiveConfidence, 0, 1);
  rel.affection = clamp(rel.affection - 0.2 * effectiveConfidence, -1, 1);
  const caresAboutVictim = claim.victim === witness.id ? true : (claim.victim && relOf(witness, claim.victim).affection > 0);
  rel.grievance = clamp(rel.grievance + (caresAboutVictim ? 0.5 : 0.15) * effectiveConfidence, 0, 5);
} else if (claim.predicate === 'is_trustworthy') {
  const rel = relOf(witness, claim.subject);
  rel.trust = clamp(rel.trust + 0.2 * confidence, 0, 1);
  rel.affection = clamp(rel.affection + 0.1 * confidence, -1, 1);
} else if (claim.predicate === 'is_dangerous') {
  const rel = relOf(witness, claim.subject);
  rel.fear = clamp(rel.fear + 0.3 * confidence, 0, 1);
} else if (claim.predicate === 'provoked') {
  const provokerRel = relOf(witness, claim.subject);
  provokerRel.trust = clamp(provokerRel.trust - 0.15 * confidence, 0, 1);
  provokerRel.affection = clamp(provokerRel.affection - 0.15 * confidence, -1, 1);
  provokerRel.grievance = clamp(provokerRel.grievance + 0.3 * confidence, 0, 5);
  ...
}
```

`is_dead` has no entry here at all (no relationship-effect branch for it anywhere in
`applyClaimBelief`) — D-01's `1.5` for `is_dead` is the one severity-table entry with no
calibration precedent in the file, consistent with CONTEXT.md's framing of it as the
deliberately-uncapped "paradigm explosive case." The other five map to a real existing
coefficient (per D-01's own text: `stole_from`≈0.7, `attacked`≈1.0 mirrors Attack's 1.2;
`is_trustworthy`≈0.4; `is_dangerous`≈0.6; `provoked`≈0.4).

**Placement of the table itself** — `PREDICATE_LABELS` (`sim.js:33-40`) is the existing
per-predicate constant object closest in shape and adjacency:

```javascript
const PREDICATE_LABELS = {
  stole_from: (c) => `${c.subject} stole ${c.item || 'something'} from ${c.victim}`,
  attacked:   (c) => `${c.subject} attacked ${c.victim}`,
  is_dead:    (c) => `${c.subject} is dead`,
  is_trustworthy: (c) => `${c.subject} is trustworthy`,
  is_dangerous:   (c) => `${c.subject} is dangerous`,
  provoked:       (c) => `${c.subject} provoked ${c.victim}`,
};
```

A new `TELL_SEVERITY` object beside it (same six keys, numeric magnitudes instead of
label-functions) is the more discoverable placement per the file's "module-level constant
data structures are `UPPER_SNAKE_CASE`" convention. CONTEXT.md's `<discretion>` block
explicitly leaves "named `TUNING` entries vs. one small table object" open — `TELL_SEVERITY`
beside `PREDICATE_LABELS` matches the file's existing shape better than six scattered
`TUNING` entries, and per the Numeric Verification section above, these six magnitudes should
be understood and possibly sized as **pre-damping bases**, not final impact values.

**D-02's duplicated confidence formula — copy verbatim, do not refactor into a shared
helper.** The exact source, `perceiveEvent`, `sim.js:754-766`:

```javascript
if (event.verb === 'Tell' && event.data.targetId === witnessId) {
  const trust = relOf(witness, event.actor).trust;
  const credulity = getWorldviewWeight(witness, 'GeneralizedTrust');
  applyClaimBelief(world, witness, event.actor, event.data.claim, clamp(0.4 + trust * 0.5 + credulity * 0.15, 0, 1), `told:${event.actor}`, event.tick, event.id);
} else if (event.verb === 'Tell') {
  // overheard secondhand — weaker confidence than being told directly
  const trust = relOf(witness, event.actor).trust;
  const credulity = getWorldviewWeight(witness, 'GeneralizedTrust');
  applyClaimBelief(world, witness, event.actor, event.data.claim, clamp(0.2 + trust * 0.3 + credulity * 0.1, 0, 1), `overheard:${event.actor}`, event.tick, event.id);
}
```

Inside `appraiseEvent`'s new `Tell` branch, the direct-vs-overheard split reads
`event.data.targetId === witness.id` (note: `witness.id`, not `witnessId` — `appraiseEvent`'s
signature is `(world, witness, event)`, it has no separate `witnessId` string parameter the
way `perceiveEvent` does). The two `clamp(0.4 + trust*0.5 + credulity*0.15, 0, 1)` / `clamp(0.2
+ trust*0.3 + credulity*0.1, 0, 1)` expressions are copied byte-for-byte — the same
duplication shape Phase 3's D-01 already established for `beliefConfidence()` mirroring
`memoryStrength()` (see Shared Patterns below).

**Assembling the branch — full shape to write, with the sign term flagged as a required,
CONTEXT.md-unstated decision:**

```javascript
} else if (event.verb === 'Tell') {
  const claim = event.data.claim;
  const baseSeverity = TELL_SEVERITY[claim.predicate] || 0; // unknown predicate -> no severity signal, not a throw
  const directTold = event.data.targetId === witness.id;
  const trust = relOf(witness, event.actor).trust;
  const credulity = getWorldviewWeight(witness, 'GeneralizedTrust');
  const claimConfidence = directTold
    ? clamp(0.4 + trust * 0.5 + credulity * 0.15, 0, 1)
    : clamp(0.2 + trust * 0.3 + credulity * 0.1, 0, 1);
  const sign = claim.predicate === 'is_trustworthy' ? 1 : -1; // only positive-polarity claim among the six
  impact = sign * baseSeverity * claimConfidence;
  // D-03's additional claim.subject affection scaling attaches here, see Unit 2 below.
}
```

The `sign` term isn't named in CONTEXT.md's decisions but is load-bearing: `applyAppraisal()`
(`sim.js:804` onward) branches on `impact < 0` vs. `impact >= 0` to decide
Anger/Indignation/Fear vs. the forgiveness path — an unsigned `Tell` impact would silently
route `is_dead`/`attacked`/`stole_from`/`is_dangerous` claims through the positive-impact
trust/affection-boost path, which is almost certainly wrong. `is_trustworthy` is the only
positive-polarity predicate of the six.

---

### Unit 2: `isVictim`/`victimAffection` block extension for Tell's `claim.subject` (D-03)

**Analog:** the existing generic block itself, `sim.js:796-799`, which runs unconditionally
after every verb branch (including the new `Tell`/`Move` branches — a shared downstream step,
not something a new branch can opt out of by construction):

```javascript
if (!isVictim) {
  const generalCare = generalCareOf(witness);
  impact *= victimAffection > 0 ? victimAffection * generalCare * 1.5 : generalCare * 0.3;
}
```

Here, `isVictim`/`victimAffection` are computed from `event.data.targetId` — for a `Tell`,
that's who was *told*, not who the claim is *about*. D-03 asks for a **second, additive**
scaling factor, independent of this block, using `claim.subject` instead:
`relOf(witness, claim.subject).affection`. This must be applied inside the `Tell` branch
itself (multiplying `impact` there), not by modifying lines 796-799, since those lines
already correctly express a different, valid signal ("do I care about who was told") that
should keep applying to Tell exactly as it does to every other verb.

**Numeric warning, verified against the fixture, not assumed:** the naive literal reading of
"the same way the existing block scales by `victimAffection`" — i.e. `impact *= subjectAffection
> 0 ? clamp(subjectAffection, 0, 1) : 1` — is a further **damping** multiply, because default
relationship affection sits around `0.3` (`relOf`'s lazy-init default, `sim.js:158-163`:
`affection: clamp(0.3 - dangerWeight * 0.15, -1, 1)`). Applied to the flagship direct-told
`is_dead` case computed in the Numeric Verification section (mara: `-0.975` before this
extension), a `* 0.3` multiply collapses it to roughly `-0.29` — a `70%` reduction of exactly
the case D-01 designed to be the one that reaches the new `1.5` ceiling. That is very likely
not the intent (D-01's whole point is that `is_dead` should "reach comparable severity from
an ordinary witness too," and an ordinary witness has exactly this ~0.3 default affection
toward most people).

**Two structurally different readings the plan must choose between, not both loosely implied
by D-03's text:**
1. **Damping form** (literal transcription of "scales the same way," i.e. mirrors the `else`
   arm of the block at line 798 — multiply down when affection is low/absent): `impact *=
   subjectAffection > 0 ? clamp(subjectAffection, 0, 1) : someFloorMultiplier`. Faithful to
   the literal instruction but compounds with Unit 1/Numeric-Verification's existing
   floor-collapse problem for anyone but a witness with above-default affection for the
   claim's subject.
2. **Boost form** (mirrors the block's *other* arm — care about someone amplifies rather than
   only dampens, matching the `victimAffection > 0 ? victimAffection * generalCare * 1.5`
   shape used when the target IS someone the witness has affection for): `impact *= (1 +
   clamp(subjectAffection, 0, 1) * k)` for some small `k`. Preserves the flagship case's
   severity while still scaling up further for someone dearly cared about.

CONTEXT.md's text supports either reading in isolation ("the same way the existing block
scales by `victimAffection`" — that block itself has both a damping arm and a boost arm). The
plan needs to pick one explicitly and verify the flagship `is_dead` case's post-scaling
`|impact|` numerically (the same `node -e` probe style used above), not assume it clears a
useful threshold.

**`provoked`'s carve-out, named explicitly in D-03:** "for predicates that name a subject
other than the witness (..., `provoked` when the witness isn't the provoker)" — `provoked`'s
`claim.subject` is the *provoker*, not the victim (confirmed via `applyClaimBelief`'s own
handling, `sim.js:1112-1129`); scaling by care-about-the-provoker only makes sense when the
witness isn't themselves the one being called a provoker. A one-line guard, not a silent
omission.

---

### Unit 3: `appraiseEvent`'s `Move` branch — causal flight detection (D-04)

**Analog:** `applyClaimBelief`'s `matchedEvent` world-ledger trace, `sim.js:1080-1089` — the
only existing pattern in the file for "scan `world.events` for a prior event matching a
verb+target shape":

```javascript
const matchedEvent = (claim.predicate === 'stole_from' || claim.predicate === 'attacked') &&
  world.events.find(ev =>
    ev.actor === claim.subject && ev.data && ev.data.targetId === claim.victim &&
    ((claim.predicate === 'stole_from' && ev.verb === 'Take' && ev.data.consented === false) ||
     (claim.predicate === 'attacked' && ev.verb === 'Attack'))
  );
```

**D-04's shape, substituting `event.causedBy` for a claim-based match:**

```javascript
} else if (event.verb === 'Move') {
  const causeEvent = event.causedBy && world.events.find(ev => ev.id === event.causedBy);
  const isFlightFromViolence = causeEvent && causeEvent.data && causeEvent.data.targetId === event.actor &&
    (causeEvent.verb === 'Attack' || (causeEvent.verb === 'Take' && causeEvent.data.consented === false));
  impact = isFlightFromViolence ? -0.5 : 0;
}
```

`event.causedBy` is set on every event object at creation (`performAction`, `sim.js:362`:
`causedBy: opts.causedBy || null`), and every reaction-dispatched action already threads it
through (`sim.js:1294, 1318, 1388, 1476` all pass `{ causedBy: event.id, why }`) — no new
field, purely a read.

**Confirmed event.data shapes, load-bearing for the `targetId === event.actor` check:**
- `Attack`'s effect (`sim.js:454`): `data: { targetId: target.id, damage, targetSurvived: target.alive }`
- `Take`'s effect (`sim.js:430`): `data: { targetId: target.id, item, quantity: qty, consented: false }`
- `Move`'s own effect (`sim.js:475`): `data: { from, to }` — **no `targetId` field at all.**

**Numeric floor-collapse, verified — this is the single most important correction to this
document versus a first pass:** because `Move`'s own `event.data` has no `targetId`, the
generic `isVictim`/`victimAffection` block (`sim.js:796-799`) evaluates `isVictim = false` and
`victimAffection = 0` for EVERY `Move` event, unconditionally — meaning it ALWAYS falls into
the `else` arm: `impact *= generalCareOf(witness) * 0.3`. Computed against the five live
fixture agents (see the Numeric Verification table above), D-04's suggested `-0.5` base
produces post-scaling `|impact|` of `0.0195`–`0.1073` — **four of the five fixture NPCs
(ives, tomas, garrick, mara) land below `0.1` and get clamped straight back to the exact
floor value MEMORY-01 exists to move memories off of.** Only `elena` clears it, and barely.

This is not "likely still noticeably above the floor" (a first-pass reading of this document
said that; it is wrong) — it is a near-certain floor-collapse for a majority of witnesses at
the suggested magnitude. The plan must resolve this using one of the three options in the
Numeric Verification section above (accept-and-rescope to a specific tested witness/scenario,
size the base magnitude up using the table's own multiplier data — e.g. `-3.0` clears `ives`'s
worst-case `0.039` multiplier at `-0.117` — or structurally exempt Move from the generic
block) and its MEMORY-01 check (Unit 5) must assert against whichever witness/scenario was
actually chosen, with the real post-scaling number in the check's `detail` string, not merely
`impact !== 0`.

---

### Unit 4: `perceiveEvent`'s `addMemory` clamp ceiling — `TUNING.maxMemoryImportance` (D-05)

**Analog:** how Phase 3 introduced its own new `TUNING` constants (`sim.js:55-96`, current
`TUNING` block, reproduced in relevant part):

```javascript
const TUNING = {
  beliefPruneFloor: 0.03,
  needRegenRate: 0.02,
  belongingGiveGain: 0.08,
  belongingVouchGain: 0.05,
  retreatSafetyEnter: 0.65,
  retreatSafetyExit: 0.75,
};
```

Each entry carries a comment block above it explaining derivation/calibration and any
verification history — match that shape for `maxMemoryImportance: 1.5`: state what it widens
(the `addMemory` clamp ceiling), why `1.5` (halflife 38→55.5 ticks, prune-crossover ~190→~278,
per CONTEXT.md's own arithmetic), and that it applies uniformly to every event type per D-05.

**The one-line call-site change**, `perceiveEvent`, `sim.js:720`:

```javascript
addMemory(witness, event.id, event.tick, clamp(Math.abs(appraisal.impact), 0.1, 1));
```
→
```javascript
addMemory(witness, event.id, event.tick, clamp(Math.abs(appraisal.impact), 0.1, TUNING.maxMemoryImportance));
```

**Confirmed by direct grep** (`grep -n "addMemory(" sim.js`): `addMemory` is called exactly
once in the entire file, at this line (the other two hits are the function's own declaration
at `sim.js:626` and a comment reference at `sim.js:56`) — this is the only call site to
change.

**A second write to memory records worth naming, found while reading `applyClaimBelief`
(`sim.js:1091-1097`):** when a claim corroborates an event the witness already knows
firsthand, `applyClaimBelief` re-stamps the existing memory's `tick` (`if (mem) mem.tick =
tick;`) without changing its `importance`. This doesn't need to change for D-05, but it's a
second, pre-existing write path into `mind.memories` beyond `addMemory`'s own — worth a line
in the MEMORY-02 check's design, since a scripted "does a high-importance memory persist"
check that accidentally triggers corroboration (a bystander independently retelling something
the test's witness already witnessed) would refresh `.tick` and produce a false pass that
looks like persistence but is actually reinforcement. Keep the MEMORY-02 scenario to a single
formation event with no corroborating retell if the check is meant to isolate D-05's ceiling
effect specifically.

---

### Unit 5: New MEMORY-01/MEMORY-02 check function + `verify.js` wiring

**Analog:** `runDecayCheck()`'s exact contract and header comment, `sim.js:1992-2002`:

```javascript
// ── Belief decay checks (DECAY-01/DECAY-02) ──────────────────

// Follows runOrderingCheck's/runRegressionCheck's contract exactly: builds
// its own deterministic world, returns { pass, checks }, never prints, never
// throws, never touches the filesystem. No baseline, no snapshot — these are
// qualitative checks only. Every check's `detail` carries the observed
// numbers verbatim so a failure is diagnosable from the printed line alone.
function runDecayCheck(opts = {}) {
  const checks = [];
  // ... individual checks, each: checks.push({ name, pass, detail }) ...
  return { pass: checks.every(c => c.pass), checks };
}
```

**Individual-check shape to copy** (`sim.js:2078-2102`, the needs-regeneration check — a
representative example of the "real-path, not hand-poked" discipline every check in this file
follows: move uninvolved NPCs `away` first for isolation, then call real `performAction(...)`,
then assert on the real resulting state):

```javascript
const needsWorld = createWorld();
needsWorld.driftEnabled = false;
seedRng(needsWorld);
['mara', 'ives', 'tomas', 'elena'].forEach(id => performAction(needsWorld, id, 'Move', { toLocation: 'away' }));
const safetyVictim = needsWorld.agents.garrick;
const attackRes = performAction(needsWorld, 'player', 'Attack', { targetId: 'garrick' });
// ... assert on real state produced by performAction ...
checks.push({ name: 'needs-regenerate-over-time', pass: safetyRegenerates, detail: `...` });
```

**A new function — name left to the planner, e.g. `runMemoryImportanceCheck()`** — should
follow this same contract. Given the Numeric Verification findings above, its checks should
explicitly target the scenario(s) the plan decided actually clear the floor (per Unit 3's
three options) rather than an arbitrary witness — e.g. a direct-told `is_dead` Tell check
should specifically use a witness/actor pair and assert the real computed `|impact|` value in
`detail`, the same way `needs-regenerate-over-time`'s `detail` string embeds the actual
observed numbers rather than just pass/fail. Minimum checks implied by ROADMAP's Phase 4
success criteria: (1) a severe `Tell` producing an impact "noticeably above the flat floor,"
(2) a high-importance memory (any event type) surviving past the ~38-tick pre-Phase-4 prune
horizon where a pre-Phase-4 `memoryStrength()` sample at the same age would have fallen below
`addMemory`'s `> 0.03` retention floor.

**`verify.js` wiring — copy `runDecayCheck`'s three touch points exactly:**

1. Call site, `verify.js:121-123`.
2. `allChecks` concat, `verify.js:132`: `const allChecks = result.checks.concat(orderResult.checks, decayResult.checks);`
3. Print block + section header, `verify.js:180-181`.

A fourth batch (e.g. `const memoryResult = Sim.runMemoryImportanceCheck();`, folded into
`allChecks`, with its own `lines.push('Tell/Move memory importance (MEMORY-01/MEMORY-02)')`
header) mirrors this exactly. Also export the new function from `Sim` (`sim.js:2443-2471`,
alongside `runDecayCheck`).

**Naming caution, confirmed by direct read of `verify.js:41`:**
`NON_ACKNOWLEDGEABLE_CHECK_NAMES = new Set(['snapshot-matches-baseline',
'order-matches-baseline'])` — a new qualitative check name from this phase must NOT be added
to that set; it has no baseline file of its own (same as `runDecayCheck`'s checks), so it's
naturally acknowledgeable if needed, unlike the two true golden-master diffs.

---

## Baseline blast radius (`scripts/baseline.json`, `scripts/order-baseline.json`)

`snapshotWorld()` (`sim.js:1559-1572`) serializes `world.agents` — including every agent's
`mind.memories` array — verbatim, `importance` field included. This phase changes the
`importance` value stored for essentially every `Tell`/`Move` memory formed in either baseline
scenario (`CompetitiveJungle`'s two-clone fixture and `ORDER_SPEC`'s ordering fixture), and can
also change every direct `Attack` VICTIM's stored importance in either fixture — verified via
`node -e` against `Sim.appraiseEvent`: an Attack victim has `isVictim = true`, which SKIPS the
generic damping/boost block entirely (`sim.js:796`), so the un-damped baseline
`-1.2 * (1 + safetyWeight * 0.3)` already equals `-1.2` at `safetyWeight = 0` — past the OLD
ceiling of `1` for every fixture NPC regardless of Safety value, confirmed identical
(`impact = -1.2`) for all five fixture NPCs when appraising an Attack targeting themselves.
Every direct victim's stored `importance` therefore moves from the old clamped `1` to `1.2`
(or higher, up to the new `1.5` ceiling, for any victim who also holds a positive Safety value)
— this is the mechanism to look for in the diff, not a "high-Safety witness" case. (A
NON-victim BYSTANDER of an Attack, by contrast, DOES pass through the generic block and, even
at the fixture's largest observed boost multiplier [elena's `victimAffection * generalCareOf *
1.5` ≈ 0.37], tops out around `-0.58` — nowhere near the old ceiling. No bystander in either
fixture was ever clamped by the old `1` limit; only direct victims were, unconditionally.)
Expect a non-empty `Baseline diff:` on the first `node scripts/verify.js` run after landing
this phase's `sim.js` changes. Follow the exact staged workflow Phase 3's `03-05-PLAN.md`
executed: implement first with NO `--update-baseline`, review + classify every diff entry
against the mechanisms this document predicts (a `mem.importance` value at a `Tell`/`Move`
path? a shifted `Attack` importance?), only then run `--update-baseline`, re-run to confirm
`OVERALL: PASS`, confirm `git status --short` shows only the two baseline files changed.

**Doc sync obligation, same rule Phase 3's `03-05-PLAN.md` executed:** `CLAUDE.md` states
"When the person model changes, update `PERSON-MODEL.md` in the same change." This phase
changes `appraiseEvent`'s behavior and adds a `TUNING` entry — `PERSON-MODEL.md`'s
memory-importance/`appraiseEvent` description and its list of `TUNING` constants should be
updated in the closing plan, the same way `03-05-PLAN.md` Task 2 updated the Beliefs/Needs
sections and the `TUNING` constant list after Phase 3 landed.

---

## Shared Patterns

### Formula duplication for purity, not refactored into a shared helper
**Source:** `beliefConfidence()` mirroring `memoryStrength()` (Phase 3's own precedent,
`sim.js:603-619`); the direct-vs-overheard Tell confidence formula duplicated a second time
inside `appraiseEvent` (D-02, Unit 1 above).
**Apply to:** the `Tell` branch's confidence calculation. `appraiseEvent` is called from two
sites that must compute identically — `orderWitnesses`'s read-only pre-pass at `sim.js:536`
and `perceiveEvent`'s real dispatch at `sim.js:719` — so any shared logic between them must
either be a pure function of `(world, witness, event)` alone, or duplicated inline. Threading
`perceiveEvent`'s already-computed confidence into `appraiseEvent` as a parameter is
explicitly rejected by D-02; duplicating the two-line formula is the sanctioned choice.

### `Sim.TUNING` as the landing spot for new constants
**Source:** `sim.js:55-96` (declaration + all six Phase 3 entries), `sim.js:2449` (export).
**Apply to:** `TUNING.maxMemoryImportance` (D-05) and, if the planner chooses named entries
over a `TELL_SEVERITY` object, the six Tell severity constants (D-01).

### Module-level constant tables keyed by predicate string
**Source:** `PREDICATE_LABELS`, `sim.js:33-40`.
**Apply to:** `TELL_SEVERITY` (D-01), same six `snake_case` predicate keys, same adjacency.

### World-ledger causal trace: `world.events.find(ev => ...)` matched-shape scan
**Source:** `applyClaimBelief`'s `matchedEvent`, `sim.js:1080-1089`.
**Apply to:** D-04's `Move` flight-detection trace via `event.causedBy`.

### `runXCheck()` qualitative-check contract + `verify.js` three-point wiring
**Source:** `runDecayCheck()`, `sim.js:2002-2438`; `verify.js:121-123` (call), `132`
(`allChecks` concat), `180-181` (print block + section header).
**Apply to:** the new MEMORY-01/MEMORY-02 check function this phase adds.

### Golden-master re-bless staged as the phase's closing plan, never inline with behavior changes
**Source:** `03-05-PLAN.md` (Phase 3's single sanctioned re-bless plan); `verify.js:231-252`
(`--update-baseline`'s refusal gate, which blocks the flag while any qualitative check fails,
but exempts the two non-acknowledgeable baseline-diff checks so a legitimate structural change
can still be blessed).
**Apply to:** this phase's `scripts/baseline.json`/`scripts/order-baseline.json` diff from
raised memory-importance values.

---

## No Analog Found

| Logical unit | Role | Data Flow | Reason |
|---|---|---|---|
| `Tell` impact's polarity/sign term (`is_trustworthy` positive, other five negative) | control-flow (branch selector) | — | No existing per-predicate sign table anywhere in the file — `applyClaimBelief`'s branches each hardcode their own sign inline per relationship dimension rather than via a shared signed-magnitude table. Flagged in Unit 1 as a required-but-CONTEXT.md-unstated decision, now resolved with a concrete recommendation (`is_trustworthy` positive, rest negative). |
| Damping-vs-boost shape for D-03's `claim.subject` affection scaling | (design tension with numeric evidence, not a missing pattern) | — | Verified numerically in Unit 2: the literal "damping" reading of D-03's text collapses the flagship direct-told `is_dead` case by ~70%. Two structurally different readings are named in Unit 2; the plan must pick one and re-verify the flagship case's post-scaling magnitude. |
| Move's post-branch `isVictim`-block interaction | (design tension with numeric evidence, not a missing pattern) | — | Verified numerically in Unit 3: D-04's suggested `-0.5` collapses to the exact `0.1` floor for 4 of 5 fixture witnesses once the generic block's unconditional `generalCareOf * 0.3` damping applies. Three resolution options are named in the Numeric Verification section; the plan must pick one and size/scope the check accordingly. |

## Metadata

**Analog search scope:** `sim.js` (2,474 lines total; read via 6 non-overlapping targeted
`Read` calls covering lines 1-100, 379-478, 500-590, 590-830, 1060-1140, 1992-2474 — every
range CONTEXT.md's `<canonical_refs>` names, plus `checkPreconditions`/`applyEffects`'s
`Take`/`Attack`/`Tell`/`Move` cases and the `Sim` export block), `scripts/verify.js` (read in
full, 264 lines), `.planning/phases/03-belief-decay-needs-regeneration/03-PATTERNS.md` (read
in full as the direct structural precedent for this document), `.planning/phases/
03-belief-decay-needs-regeneration/03-01-PLAN.md` and `03-05-PLAN.md` (read for the
check-runner wiring and staged-rebless precedents respectively). All damping-multiplier and
post-scaling-impact numbers in this document were computed via `node -e` against the live
`sim.js` module (`Sim.createWorld()`, `Sim.seedRng()`, `Sim.appraiseEvent()`, and a
locally-reimplemented `generalCareOf`/`getValueWeight`/`getWorldviewWeight` matching the
source verbatim), not estimated from the formulas alone.
**Files scanned:** `sim.js`, `scripts/verify.js`, `.planning/phases/
03-belief-decay-needs-regeneration/03-PATTERNS.md`, `03-01-PLAN.md`, `03-05-PLAN.md`,
`.planning/phases/04-tell-move-aware-memory-importance/04-CONTEXT.md`,
`.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`.
**Pattern extraction date:** 2026-08-13
