# Person Model Reference

What each box on an NPC's mind actually is, as implemented in `sim.js` —
not the intent, the code. Written because the box count and the rules for
how they interact have grown past what's easy to hold in your head across
sessions. Update this when the model changes; treat any drift between this
file and `sim.js` as a bug in one or the other.

The player has no `mind` object. Everything below applies to NPCs only.

## Personality (`mind.personality`)

OCEAN + one additional trait, each 0–1, set once in `createWorld()` and
**never mutated anywhere in the codebase.** Fully static.

`openness, conscientiousness, extraversion, agreeableness, neuroticism, boldness`

`boldness` was added because confront/retreat decisions needed a risk-taking
axis that Neuroticism alone didn't cleanly cover — the one sanctioned
addition beyond the Big Five, per "add a trait only when the sim
demonstrates a need."

**Hooks** (where each trait is actually read — worth listing explicitly
because until this pass, three of six sat declared per-NPC and read by
nothing):

- **`boldness`** — confront/retreat weighting throughout `decideAndAct()`
  (Attack score, retreat score, and the do-nothing baseline all read it), and
  gates whether a dormant `SeekRestitution` goal stays suppressed by fear
  (`reassessGoals()`).
- **`agreeableness`** — bystander care (`generalCareOf()`); how much a kind
  act settles a grievance (`applyAppraisal()`); how much a caught lie actually
  lands, via the same forgiveness formula (`reactToBeingLiedTo()`); a direct
  brake on the Attack score and a floor under the do-nothing score
  (`decideAndAct()`).
- **`neuroticism`** — how sharply Fear rises from being attacked, and now
  Anger/Indignation intensity too, both in `applyAppraisal()`.
- **`extraversion`** — raises the do-nothing baseline for introverts and is
  subtracted from the gossip (`tell confidant`) score, both in
  `decideAndAct()`. Added so silence is a reachable outcome for a
  low-boldness, low-extraversion witness, not just a lower-scored one.
- **`conscientiousness`** — small boost to `press for explanation` in
  `decideAndAct()` — wanting the facts straight before reacting further.
  Also the impulsivity gate in `reactToBeingMisattributed()`: below 0.5, a
  witness who's just discovered someone else took the blame for their own
  crime feels relief rather than indifference.
- **`openness`** — receptiveness to an unconventional `provoked` explanation,
  alongside `JustWorld`, in `applyClaimBelief()`.

**Known gap:** this is meant to be the "sticky, not static" layer — slow to
shift, capable of snapping from one intense event. Right now it's just
static. See "Gaps for the next phase" below.

## Values (`mind.values`)

`[{ value: 'Justice', weight: 0.7 }, ...]` — weight in `[-1, 1]`. Picked from
a shared 13-entry bank (`Sim.VALUES`); each NPC holds 2–4. **Absence from
the list means indifference, not opposition** — `getValueWeight()` returns
`0` for anything not present, which is a real default, not a missing value.
Also never mutated after creation.

Values are what most behavior actually reads, not personality directly.
Wired, as of this pass:

- **Honesty** — gates lying/scapegoating (`decideAndAct()`) and how much a
  caught lie actually lands (`reactToBeingLiedTo()`).
- **Justice** — scales offense at theft (`appraiseEvent()`).
- **Wealth** — gates whether restitution reads as "enough" (`applyAppraisal()`).
- **Compassion** — adds to bystander care on top of Agreeableness
  (`generalCareOf()`).
- **Safety** — scales how impactful being attacked feels, and adds to the pull
  to retreat (`appraiseEvent()`, `decideAndAct()`).
- **Loyalty** — discounts belief in a `stole_from`/`attacked` accusation
  against someone the witness already has affection for (`applyClaimBelief()`)
  — harder to credit wrongdoing about someone you're loyal to, not because the
  evidence changed.
- **Community** — adds to bystander care alongside Compassion — caring about
  the collective, not just people already liked (`generalCareOf()`).
- **Status** — boosts the Attack score, but only when someone else is around
  to see the confrontation (`decideAndAct()`) — public face-saving. Also
  decides whether being misattributed for your own crime is upsetting or a
  relief (`reactToBeingMisattributed()`) — above 0.3, you wanted the credit
  and losing it to someone else stings the same as any other caught lie.
- **Honor** — boosts the Attack score, but only when the witness is
  themself the victim (`decideAndAct()`) — defending one's own honor reads
  differently from punishing a wrong done to someone else, which Justice
  already covers upstream.
- **Curiosity** — can unlock `press for explanation` even without existing
  affection, and adds to its score (`decideAndAct()`) — wanting to know why
  doesn't require liking someone.
- **Autonomy** — pulls down the gossip (`tell confidant`) score
  (`decideAndAct()`) — prefers handling it without pulling a third party in.

**Deliberately left unwired: Tradition, Pleasure.** No honest hook in a
five-verb sim (Take/Give/Attack/Tell/Move) with no ritual, custom, or
leisure/consumption mechanic to attach them to. Forcing one in would be
exactly the kind of scenario-special-casing the architecture's one rule
prohibits. Same treatment as Superstition gets under Worldview below — named
and explicitly deferred, not silently ignored.

## Worldview (`mind.worldview`)

Durable convictions about how the world *works*, as distinct from stances
about specific incidents: "strangers are dangerous," "actions have
consequences," "might is right." These sit at the same sticky tier as
Personality and Values — not below Beliefs, not a variant of them. Same
shape as Values: `[{ belief: 'JustWorld', weight: 0.6 }, ...]`, weight in
`[-1, 1]`, absence means no strong opinion, not the opposite. Set once in
`createWorld()`, never mutated — same static status as Personality/Values
until Phase 2 (see "Gaps for the next phase").

Four entries, each grounded in a named psychology construct rather than
invented:

- **`GeneralizedTrust`** — World Values Survey's trust item ("most people
  can be trusted" vs. "you can't be too careful"). Hook: adds to the base
  confidence formula in claim-belief formation (`0.4 + trust×0.5 +
  credulity×0.15` told directly, smaller effect overheard) — general
  credulity toward testimony, deliberately separate from relationship trust
  in a specific person.
- **`JustWorld`** — Lerner's Just-World Hypothesis (people get what they
  deserve; the world isn't arbitrary). Hook: shifts confidence in a
  `provoked` justification specifically (`applyClaimBelief`) — someone who
  needs wrongdoing to have a reason is more receptive to being handed one.
- **`CompetitiveJungle`** — Duckitt's Competitive Jungle Belief ("a
  ruthless, amoral struggle for resources and power in which might is
  right"). Hook: pulls down `generalCareOf()` (bystander compassion for
  wrongs done to others) and adds a direct boost to the Attack score in
  `decideAndAct` — colder toward others' suffering, quicker to reach for
  dominance over talking.
- **`DangerousWorld`** — Duckitt & Altemeyer's Dangerous World Belief.
  Hook: shifts the *default* relationship values in `relOf()` for a
  first-ever encounter with someone new — lower starting trust/affection,
  higher starting fear, before any actual history exists.

Superstition, spirituality, and religious conviction were deliberately left
out of this bank — a separate axis to design once there's a concrete
mechanic for it to plug into, not squeezed in without one.

**Verified:** two clones of the same NPC, identical stats, opposite
`CompetitiveJungle` weight, witnessing the identical event, choose different
reactions (`do nothing` vs. `attack player`) — the core case this box exists
to make possible.

## Beliefs (`mind.beliefs`) — situational, not worldview

Propositional, not episodic — a belief is a *stance*, not a memory of
experiencing something. Tied to a specific incident (an eventId), formed
fast, evaluated for confidence. Not to be confused with Worldview above —
"Mara stole bread" is a belief; "people are fundamentally selfish" is a
worldview. Shape:

```
{ id, subject, predicate, data, confidence, source, tick, eventId, contested? }
```

Two formation paths:
- **Witnessed** (`predicate: 'did:Take'` etc.) — always pushed at 100%
  confidence for any event the agent personally perceived. **The actor of an
  event never gets one of these for their own action** — `computeWitnesses()`
  excludes the actor by construction, so an agent has no belief-array record
  of things they themselves did. `checkContradiction()`'s ground-truth checks
  can't rely on the belief array for self-authorship because of this; they
  check `world.events` directly instead.
- **Claimed** (`stole_from`, `attacked`, `is_dead`, `is_trustworthy`,
  `is_dangerous`, `provoked`) — confidence starts from trust in the source,
  then can be overridden:
  - to `0`, tagged "known false" in `source`, if `checkContradiction()`
    finds the witness has ground truth against it (self-knowledge about
    their own actions/what happened to them, being the actual — unnamed —
    perpetrator the claim misattributes to someone else, or a direct
    eyewitness record naming someone else as the real actor)
  - discounted/boosted by `findConflictingBeliefs()` when it competes with
    an existing belief about the same incident (mutual counter-accusation
    or rival suspects for the same victim) — tagged `contested: true`
  - `provoked` claims are deliberately exempt from ground-truth checking —
    "why" isn't a fact the event ledger can confirm the way "did it happen"
    is, so it's judged purely on trust in the claimant

**Beliefs decay and self-prune, mirroring Memories' formula and lifecycle.**
Effective confidence is computed live by `beliefConfidence(belief, currentTick)`,
using the same halflife shape as `memoryStrength` (`halflife = 3 +
confidence × 35`, `decayed = confidence × 0.5^(Δt/halflife)`), with the
belief's own `confidence` standing in for memory's `importance` — beliefs
have no separate importance field. Stale beliefs are pruned at push time —
the same "filter immediately before pushing" pattern `addMemory()` uses, at
both belief-push sites (witnessed and claimed) — dropping any belief whose
`beliefConfidence()` at that tick falls below `TUNING.beliefPruneFloor`
(`0.03`, the belief-side mirror of `addMemory`'s own inline floor). No
sweep pass, no length cap.

**Exemption (D-02): a belief tagged `known false` is never pruned, at any
age.** `checkContradiction()` tags a contradicted claim's `source` with the
substring `known false` and pushes it at `confidence: 0`; a naive
floor-based prune would delete that record on the very next push, and a
confidence-0 contradicted belief is the most protective record in the
mind, not the least — it's the "no, that didn't happen, and I know it
directly" record. The prune filter checks for this tag before checking the
floor, so it survives regardless of staleness. This is also why beliefs
carry no length cap the way `mind.memories` does (`addMemory`'s
`shift()` at 40): a hard cap could evict a protected `known false` belief
that the exemption is supposed to keep forever.

**The decision-path boundary — a deliberate limit, not an oversight.**
Decayed confidence is consumed by pruning and by display (the mind
inspector, the debug report) — but not by every decision-path read.
`findConflictingBeliefs()`'s `confidence <= 0.2` eligibility gate,
`existingSupport` checks, and `believesDead()`'s `confidence > 0.4` gate
all still read the belief's stored `confidence` directly, not the live
`beliefConfidence()` value. Decay reaches those gates only indirectly, by
the record disappearing on prune — the same contract
`memoryStrengthForEvent`'s own comment states explicitly: `// no memory
record left = genuinely forgotten` (`sim.js:623`). Rewiring `believesDead`
to read live confidence instead would make an NPC "forget" a death after
roughly 50 ticks (once decayed confidence crosses 0.4), which no
requirement in this phase asks for — a witnessed death is meant to stay
known until the record itself is gone, not softly doubted while it's still
on the books. This boundary was chosen once and is not accidental drift.

## Memories (`mind.memories`)

Episodic pointers, not content: `{ id, eventId, tick, importance }`. The
actual "what happened" lives in `world.events`, looked up by `eventId` when
rendered — memories don't duplicate it.

- Formed **only by direct witnessing** — `addMemory()` fires once per
  perceived event, unconditionally, regardless of verb. Being told
  something never creates a memory of the claim; that's belief-only. Being
  told something *does* create a memory of the conversation happening (you
  witnessed someone speaking to you), just not of whether it's true.
- `importance` is fixed at formation from `appraisal.impact`, which is only
  ever nonzero for Take/Attack/Give. **`appraiseEvent` has no branch for
  Tell or Move**, so every conversation-memory forms at the floor value
  (`0.1`) no matter how explosive the content was. Hearing "X is dead"
  decays exactly as fast as hearing about the weather. Real gap, not a
  design choice — content significance should presumably feed back into how
  memorable the conversation itself is.
- Strength is computed live, not stored decayed: `memoryStrength(mem, tick)
  = importance × 0.5^((tick - formedTick) / halflife)`, `halflife = 3 +
  importance × 35`. Trivial memories (importance ~0.1) fade in ~6-7 ticks;
  a major one (importance ~1) lingers for ~38.
- Self-pruning: `addMemory()` drops anything under strength `0.03` (relative
  to the current tick) before pushing the new one. No separate GC pass.
- The only place memory strength currently gates behavior:
  `checkContradiction()`'s eyewitness override, and whether a dormant
  `SeekRestitution` goal is still eligible to resurface
  (`memoryStrengthForEvent`).

## Needs (`mind.needs`)

Each need is a `{ value, tick }` record, not a flat number — `value` is the
value as of `tick`, the last time something wrote to it. `NEED_DEFAULTS`
(`{ safety: 1, sustenance: 1, belonging: 0.6 }`) is the single source of
truth for each key's starting value, read by `makeAgent`'s `buildNeeds()`,
by `needValue`'s absent-record fallback, and by `adjustNeed`'s implicit
default — no function carries its own separate fallback literal.

**Live accessor, live regeneration.** The stored record is never the
number to read directly — `needValue(agent, needKey, currentTick)` computes
the *actual* current value at read time, an asymptotic approach toward `1`
at `TUNING.needRegenRate` (`0.02`) per elapsed tick since `record.tick`:
`value += rate × (1 - value)`, applied `age` times. This is the same
lazy-computed-live idiom `memoryStrength`/`beliefConfidence` use, and it's
pure — no write-back to the record, since `snapshotWorld()` serializes
whatever raw values sit on the object at snapshot time, and a write-back-
on-read would make the golden-master baseline depend on read order.
`belonging`'s asymmetric `0.6` default is an initial value only — all
three needs regenerate toward the same ceiling of `1`.

`adjustNeed(agent, needName, delta, tick)` is the sole mutator, and it
**regenerates before applying**: it calls `needValue()` to get the current
regenerated value, adds `delta`, clamps to `[0, 1]`, and re-stamps
`record.tick = tick`. Regenerating first is what stops an adjustment from
silently erasing recovery a need had already earned — without it, a need
lowered at tick 5 and adjusted again at tick 40 would lose 35 ticks of
regeneration it had already accrued.

**Triggers, four total now, all through `adjustNeed`:** being Attacked
drops the target's `safety` by 0.4; bread hitting exactly zero after a Take
drops the target's `sustenance` by 0.4; a `Give` raises the *giver's own*
`belonging` by `TUNING.belongingGiveGain` (`0.08`); an `is_trustworthy`
`Tell` raises the *teller's own* `belonging` by `TUNING.belongingVouchGain`
(`0.05`). The last two are `belonging`'s first-ever triggers — the act of
connecting with someone (giving, vouching) raises your own sense of
belonging, not the recipient's. Both are guarded `!actor.isPlayer`, the
inverse of the Take/Attack hooks' `!target.isPlayer` guard, because these
two raise the *acting* agent's need rather than lowering the *target's* —
the player has `mind: null`, and the guard direction has to match whichever
side (`actor` or `target`) is actually being adjusted. No coercion-
detection logic exists or was needed for the Give trigger's "no coercive
framing" qualifier: every `Give` already carries `consented: true`
unconditionally, and `Take` is the codebase's only coercive-transfer verb —
the distinction is already `Give` vs. `Take` by construction.

Passive regeneration (the live `needValue()` approach-to-1) applies to all
three needs at all times, including `belonging` — its two explicit triggers
sit on top of that passive drift, not instead of it.

## Emotions (`mind.emotions`)

Transient, decaying, distinct from the slow-changing Relationship numbers:
`{ emotion, target, intensity, tick }`. Five types exist —
`Anger`, `Indignation`, `Fear`, `Gratitude`, `Relief` — pushed from
`applyAppraisal()`, `reactToBeingLiedTo()`, or `reactToBeingMisattributed()`
(`Relief`: an impulsive witness discovering someone else took the blame for
their own crime). Decays live, same pattern as
memory: `intensity × 0.5^((tick - formedTick) / 6)`. Capped at 20 entries
per agent, oldest dropped first (not decay-based pruning, just a hard cap).

Read via `activeEmotionIntensity(agent, emotion, targetId, tick)`, which
sums all matching entries' current decayed value — multiple Anger spikes
toward the same person stack rather than replace.

## Relationships (`mind.relationships`)

`{ trust, affection, fear, grievance }` per other agent, default
`{0.5, 0.3, 0, 0}`, lazily created on first `relOf()` call. **Entirely
event-driven — no passive decay or drift.** A grievance formed at tick 3 is
bit-for-bit the same at tick 3000 unless a specific event touches it. This
is the "sticky" layer working as designed for relationships specifically —
the open question is whether it should also be true forever, or whether
very old, unreinforced relationship state should eventually soften the way
memories do.

## Goals (`mind.goals.current` / `.future`)

`{ id, type, target, priority, tick, sourceEventId?, reason? }`. Only two
types exist:

- **`SeekRestitution`** — the fully-built one. Created on victimization,
  closes when grievance decays low ("settled," deleted outright), or goes
  dormant (moved to `future`, tagged with `reason: 'affection'` or
  `'fear'`) when the witness likes the target too much to bother or is too
  scared to pursue it. Dormant goals get re-checked (`reassessGoals`)
  whenever the relationship with their target shifts again — they can
  resurface into `current` if the suppressing condition reverses and the
  underlying memory hasn't decayed past relevance, or get silently pruned
  if it has.
- **`ReplenishFood`** — created once (`applyEffects`, Take) when an NPC's
  bread hits zero, pushed straight into `future`. **Never read again
  anywhere in the codebase.** Same shape as a real goal, no behavior behind
  it — a stub that shows up in the mind inspector and nothing else.

## Decision provenance (`event.why`, `mind.log[].why`)

`decideAndAct()`'s candidates (do nothing / attack / press for explanation /
tell confidant / retreat) build their scores from named terms (`{ boldness:
0.24, CompetitiveJungle: 0.08, ... }`) rather than one opaque expression, and
sum those terms to get the score actually used for ranking — the breakdown
and the number that wins are the same computation, not two parallel ones that
could drift. `explainTerms()` picks the winning candidate's top few terms
(by absolute contribution, filtering near-zero noise) and joins their labels
into a short string like `"boldness + Honor + CompetitiveJungle"`. That
string rides along on the resulting event (`event.why`) and on the decision
log entry (`mind.log[].why`), surfaced in both the live event log and the
debug report — "why did Garrick attack the player" now reads as more than a
raw score list. Purely a display aid: `why` is never read back into any
scoring or belief logic. Terms with no named lever behind them (an
impact-scaled base term every candidate shares, reflecting how bad the event
was rather than who the witness is) are deliberately left out of the
breakdown.

### Witness reaction ordering and scoring purity (Phase 2)

Scoring is now a pure function, `scoreCandidates(world, witness, event, appraisal,
priorRelationship)`, returning `{ reacts, candidates }` with `candidates` pre-sorted
descending by score and never empty. `reacts` is false exactly when
`appraisal.impact >= -0.05` — the band where a witness registers the event but does
not care enough to act — and in that case the list holds only the `do nothing`
candidate. The named-`terms` + `Object.values(...).reduce` idiom, `explainTerms()`,
`event.why`, and `mind.log[].why` are all unchanged; the extraction relocated the
code, not the maths.

Witnesses to a shared event are dispatched in descending top-candidate-score order,
not in `world.agents` insertion order. Witnesses in the no-reaction band sort last,
ties keep `agentsAt` order via a stable sort, and no randomness is involved anywhere
in ordering. The dispatched sequence is recorded on the event as `event.witnessOrder`,
a display/inspection field in the same family as `causedBy` and `why`, never read
back into scoring.

Ordering is a two-pass design: scores are computed for all witnesses first (via
`orderWitnesses()`), then each witness's `perceiveEvent` cascade runs in that order
and *recomputes* its own appraisal and candidate scores fresh. The pre-pass number
decides only position in the queue. The visible consequence, which is accepted and
not a bug: a witness can be sorted first and then take no action, because an earlier
witness's cascade moved their appraisal into the no-reaction band before their turn
came.

The "tell a confidant" candidate's truth/lie flip and `pickScapegoat` weighted draw
now happen only when that candidate wins, inside a `resolve()` hook (backed by the
named top-level `resolveGossipTell()` helper, not an inline closure, so the RNG call
site's literal source text lives outside `scoreCandidates()`'s own body).
Consequence for the mind inspector: the `considered` list shows the gossip candidate
without the `(misattributed)` marker, since misattribution is not decided until the
candidate is chosen; the `chose` label still carries it, and the misattribution is
visible on the resulting `Tell` event as `data.claim.subject` naming someone other
than the real actor.

### Retreat-gate hysteresis (Phase 3, D-07)

The old flat `safety < 0.7` retreat gate is now a two-threshold band:
`TUNING.retreatSafetyEnter` (`0.65`) and `TUNING.retreatSafetyExit`
(`0.75`). Which threshold applies to a given witness depends on whether
they're already retreating for safety reasons — `isCurrentlyRetreating(agent)`
scans `mind.log` backward for the most recent entry that **carries** the
`retreatForSafety` property at all (a presence test, `!== undefined`, not a
truthiness or label check) and returns that entry's boolean value, or
`false` if none is found. A witness not currently retreating only starts
once `safety` drops below the stricter Enter threshold; a witness already
retreating keeps retreating through the whole `[Enter, Exit]` band and only
stops once `safety` climbs back above the looser Exit threshold — this
persistence through the band is the point (it's what makes the gate not
flicker on every tick of small fluctuation).

The retreat candidate in `scoreCandidates()` carries a `safetyDriven` field
(plain returned data, set from the gate's own result at scoring time — no
mutation) recording *why* the gate opened. `decideAndAct()`'s existing
winner-log write is the only place anything is ever written: it adds
`retreatForSafety: best.label === 'retreat' && best.safetyDriven === true`
to the log entry for whichever candidate actually won. This presence-test
design is what lets the gate tell a safety-driven retreat apart from a
fear-driven one that happens to also choose `retreat` — a label-only scan
(matching any log entry whose `chose` is `'retreat'`, or whose `considered`
list contains a `retreat=` term) cannot make that distinction, since both
kinds of retreat choose the same label. This is a real behavioral
difference, not a documentation nuance: a fear-driven retreat must not
silently latch the safety-band hysteresis for a witness whose actual safety
never dropped.

The marker lives on a `mind.log` *entry*, not as new state on the `mind`
object itself, and is written only from `decideAndAct`'s winner-log push —
never from `scoreCandidates` itself. This matters because `scoreCandidates`
is called twice per witness per event (`orderWitnesses`'s read-only ranking
pre-pass, and the real dispatch) and must stay pure across both calls; if
the marker were written from inside `scoreCandidates`, the pre-pass call
would corrupt the log before the witness's real turn ever came. Putting the
write only in `decideAndAct` — the one place a decision actually resolves —
keeps `scoreCandidates` provably side-effect-free while still giving
`isCurrentlyRetreating` a durable record to scan.

**Accepted, documented residue:** if a latched witness's safety rises above
Exit and every subsequent decision only produces a no-reaction entry (or no
log write at all, whenever `appraisal.impact >= 0`), the latch stays `true`
until the next winner entry — nothing that writes only from `decideAndAct`
can close that unlogged window, and a dedicated `mind` field would have the
identical hole. This is accepted rather than chased with a sweep or a write
from inside `scoreCandidates`.

## Gaps for the next phase

### Phase 1 — Worldview, static — SHIPPED

`mind.worldview` exists, is seeded per-NPC to match established character,
and all four entries are mechanically wired (see the Worldview section
above for exact hooks). Verified against the divergent-behavior test case
this box was built to make possible. Superstition/spirituality/religion
intentionally deferred, not part of this bank.

### Phase 2 — slow drift for Personality/Values/Worldview (needs design first)

Roberts, Walton & Viechtbauer (2006)'s cumulative-continuity meta-analysis
(grounding slow personality drift), Sherif's Social Judgment Theory
(grounding resistance to change and ego-involvement), and Prochaska &
DiClemente's relapse stage as a structural parallel, not a direct citation
of the mechanism (grounding the regression trap) — intentional vs.
unintentional change, sustained pressure vs. one intense event, the
regression trap for unintentional shifts reverting once the pressure
lifts, neuroticism modulating how long a shift takes to settle. (This
passage previously mis-cited a "Phelps-Roper framework" — Megan
Phelps-Roper is a case study, not a framework author; see PROJECT.md's Key
Decisions table for the correction.) Deliberately not scoped yet — needs
concrete answers before it's buildable, not during:

- What counts as "sustained pressure"? A running counter per trait/value/
  belief that increments on contradicting events and decays when
  unreinforced, checked against a threshold?
- What counts as "intense enough to snap on its own," bypassing the slow
  path entirely?
- Does personality modulate its own drift rate (a neurotic person takes
  longer to settle) as well as everyone else's, per the note about
  rumination?
- Per-value/per-belief drift, or does one large event nudge several at
  once (a single betrayal denting both a Loyalty value and a
  GeneralizedTrust worldview)?

### Phase 3 — Belief Decay & Needs Regeneration — SHIPPED

Belief decay/pruning (D-01/D-02/D-03, with the `known false` pruning
exemption) and needs regeneration including `belonging`'s first two
triggers (D-04/D-05/D-06) and the retreat-gate hysteresis band (D-07) all
shipped — see the Beliefs, Needs, and Retreat-gate hysteresis sections
above for the exact mechanisms. One deliberate scope boundary carried
forward, not a bug: decayed belief confidence is not consumed by every
decision-path gate (see "The decision-path boundary" under Beliefs above).

### Pre-existing stubs, unrelated to Worldview

Still open, unchanged priority except where noted:

- **Decayed belief confidence not read by every decision-path gate.**
  `findConflictingBeliefs`'s eligibility gate and `believesDead`'s
  `confidence > 0.4` gate still read stored confidence, not the live
  `beliefConfidence()` value — a deliberate Phase 3 boundary, not an
  oversight (see Beliefs above for the full reasoning). Left open in case
  a future requirement asks for it explicitly.
- **`mind.log` grows unbounded.** Untouched by Phase 3 — the retreat-gate
  hysteresis's backward log scan only ever reads the tail, so it neither
  introduces nor worsens this; it was already true before Phase 3.
- **Tell/Move-aware memory importance.** Conversation memories should
  presumably inherit some signal from the claim's content, not always form
  at the floor.
- **`ReplenishFood` goal.** Created, never read again anywhere — either
  wire it to something (an agent low on food actually seeking more) or cut
  it until it does something.
- **`Tradition` and `Pleasure` values.** Declared per-NPC (Tomas holds
  Tradition, Ives holds Pleasure), deliberately never wired to any function —
  see the Values section above for why. Not a bug, a documented deferral,
  same as Superstition under Worldview.
