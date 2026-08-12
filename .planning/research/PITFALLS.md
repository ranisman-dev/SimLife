# Pitfalls Research

**Domain:** Mutable trait/opinion-drift, memory-decay/reactivation, and event-ordering fixes in an emergent, weight-driven NPC simulation with no automated tests and no seeded RNG (Tiny Town, `sim.js`)
**Researched:** 2026-08-12
**Confidence:** HIGH on mechanism (cites exact `sim.js`/`PERSON-MODEL.md` behavior), MEDIUM on downstream prediction (what breaks *because* of that behavior) — flagged per pitfall

## Critical Pitfalls

### Pitfall 1: Drift destroys the only existing regression check

**What goes wrong:**
The project's one verified behavior case (`PERSON-MODEL.md`, "Verified" note under Worldview) is: two clones, identical stats, **opposite** `CompetitiveJungle` weight, witnessing the identical event, choosing different reactions. Once `mind.worldview` (or personality/values) becomes mutable, the clones' weights stop being reliably "opposite" after any prior drift has occurred — the case becomes history-dependent. Re-running it after even one unrelated drifting event no longer tests what it originally tested; it may pass or fail depending on what happened earlier in the session, not on the mechanic it was built to verify.

**Why it happens:**
The case was designed for a world where worldview is a fixed input. Mutability turns a controlled experiment into one with an uncontrolled, silently-changing independent variable. This is a direct consequence of `PROJECT.md`'s own stated constraint: "changes should be checked by hand against the existing verified case... until real tests exist" — but drift is precisely the change that invalidates the case's precondition.

**How to avoid:**
Add a world-level toggle (e.g., `world.driftEnabled = false`) that disables all mutation paths, so the original static-worldview case remains runnable byte-for-bit as before. Write a second, drift-enabled variant of the same case that asserts divergence still holds *at tick 0*, before any drift has had a chance to run — this is the actual regression surface for Phase 2, not the original case verbatim.

**Warning signs:**
The two-clone case starts failing (or passing for the wrong reason) after adding unrelated events earlier in a session; nobody can explain a divergence result without also re-tracing every prior event's drift effect.

**Phase to address:**
First phase that introduces any mutation to personality/values/worldview — before landing the actual drift/snap formulas, land the toggle and the tick-0 variant of the verified case.

---

### Pitfall 2: Absence-vs-zero ambiguity once drift can create or erase entries

**What goes wrong:**
`getValueWeight()`/`getWorldviewWeight()` return `0` for anything **absent** from the array — `PERSON-MODEL.md` calls this "a real default, not a missing value" (indifference, not opposition, not a weak-but-present opinion). If drift logic can *create* a new value/worldview entry (an NPC starts at indifferent and drifts into holding `CompetitiveJungle` at weight 0.05) or drift an existing entry down toward zero without removing it, there are now two representations of "basically indifferent" that every downstream consumer (`decideAndAct`, `applyAppraisal`, `applyClaimBelief`, `generalCareOf`) currently treats identically but that mean different things narratively (never held the belief vs. it faded to near-nothing).

**Why it happens:**
Absence-as-zero was designed for a static bank assigned once in `createWorld()`. It was never designed to be a *destination* mutation logic can drift toward, only a starting condition.

**How to avoid:**
Decide explicitly, in one place, whether drift can (a) create new entries for previously-absent values/worldview items, (b) remove entries that drift to ~0 (collapsing back to true absence), and (c) how weights clamp to `[-1, 1]`. Implement all three as one shared mutation function (e.g., `applyDrift(mind, box, key, delta)`) rather than letting each drift call site reimplement create/clamp/remove logic slightly differently.

**Warning signs:**
Two NPCs who "shouldn't" behave alike (one never held Justice, one drifted Justice down to 0.01) start scoring identically in `decideAndAct` when the design intent was for the drifted one to still carry residual weight in `event.why`'s displayed terms, or vice versa.

**Phase to address:**
Same phase as Pitfall 1 — this is a precondition for the drift mutation function's API, not something to retrofit after formulas exist.

---

### Pitfall 3: Drift compounding within a single reaction cascade

**What goes wrong:**
`performAction()` → `perceiveEvent()` → `decideAndAct()` can recurse up to `MAX_REACTION_DEPTH = 4` (`sim.js:186`) for one originating event, and `activeEmotionIntensity()` **sums** stacking same-target emotion entries rather than replacing them. If snap/drift speed is emotion-modulated (an explicit Active requirement), a single originating event can cause up to 4 nested reactions, each computing and applying its own drift increment, each looking at an emotion pool that the *previous* reaction in the same cascade already inflated — one push at the surface event can produce a full snap by the bottom of the cascade purely from self-reinforcing intermediate state, not from four independently-earned intense moments.

**Why it happens:**
The reaction-depth cap was designed to bound infinite recursion, not to bound how many times one mutation formula fires per "logical" event. Drift/snap logic that reads live emotion state and applies immediately at each depth level inherits an amplification the cap was never meant to prevent.

**How to avoid:**
Accumulate drift *pressure* during the cascade (a per-agent, per-trait pending delta) rather than mutating personality/values/worldview live inside `perceiveEvent`/`decideAndAct`. Commit the accumulated pressure once, when `reactionDepth` returns to 0 (the existing `try/finally` unwind point at `sim.js:461-469` is the natural commit hook).

**Warning signs:**
An NPC snaps a trait after a cascade of bystander reactions to one event, when tracing shows no single reaction in that cascade was individually intense enough to justify a snap on its own.

**Phase to address:**
The phase that implements the drift/snap accumulation mechanism itself — this needs to be an architectural decision (accumulate-then-commit vs. apply-live) made before any formula tuning, not discovered after tuning looks "too twitchy."

---

### Pitfall 4: Snap can never fire from being told something, only from witnessing it

**What goes wrong:**
`appraiseEvent()` (`sim.js:472-495`) has no branch for `Tell` or `Move` — `impact` stays `0` for those verbs, and `addMemory()` clamps importance to a `0.1` floor regardless of content. If snap intensity derives from `appraisal.impact` (the natural, already-existing signal for "how big was this"), an NPC who *witnesses* a bread theft can snap a value, but an NPC who is *told* "Garrick killed someone" — objectively more severe — mechanically cannot, because the event that would trigger it always appraises as impact-zero.

**Why it happens:**
`appraiseEvent`'s Tell/Move gap predates this milestone (documented in `PERSON-MODEL.md`'s "Gaps for the next phase" and `CONCERNS.md`) but was low-stakes while nothing read `impact` for anything except memory strength. Snap/drift is the first mechanic that would make this gap behaviorally load-bearing rather than cosmetic.

**How to avoid:**
Treat the Tell/Move-aware memory importance fix (already an Active requirement) as a **hard dependency of snap/drift**, not an independent parallel fix. Land it first, or in the same phase, so snap has a real impact signal to read for claim-based events before any snap formula ships.

**Warning signs:**
Playtesting shows NPCs only ever snap from things they directly witnessed, never from things they were told, even when the told content is narratively more extreme than anything witnessed in the same session.

**Phase to address:**
Sequence explicitly: Tell/Move importance fix lands before or together with snap-threshold logic, not after.

---

### Pitfall 5: Naive belief pruning deletes exactly the beliefs that must never be re-forgotten

**What goes wrong:**
`checkContradiction()` sets a claimed belief's confidence to `0` and tags its `source` as "known false" when the witness has ground truth against it (`PERSON-MODEL.md`, Beliefs section). A pruning rule that removes beliefs below a confidence/staleness threshold will target confidence-0 "known false" entries first — deleting them re-opens the witness to being fooled by the exact same lie again, since the belief array is also what `checkContradiction()` consults (indirectly, via ground-truth checks against `world.events`, but corroboration/conflict checks in `findConflictingBeliefs()` do scan the live belief array).

**Why it happens:**
Confidence and "worth remembering" look like the same axis but aren't — a confidence-0 "known false" belief is maximally *important* to retain even though it scores minimally on the naive metric a decay formula would reuse from `memoryStrength()`.

**How to avoid:**
Prune by staleness (time since formed/reinforced, mirroring `memoryStrength()`'s live-computed decay) explicitly, not by confidence. Exempt any belief tagged "known false" in `source` from pruning regardless of computed staleness, or give it its own much longer halflife.

**Warning signs:**
An NPC who previously caught someone in a lie (and thus holds a confidence-0 "known false" belief about it) later re-forms a naive belief in the same false claim from the same or a different source, because the protective record was pruned away.

**Phase to address:**
The belief decay/pruning phase — write the "known false" exemption test case before writing the decay formula, not after.

---

### Pitfall 6: Reactivation without a refresh/immortality guard, and an undecided event-log question

**What goes wrong:**
Two related traps in "intense-event memories persist far longer and can re-trigger":
1. If a reactivation ("triggered by a reminder") **refreshes** `formedTick` the way ordinary reinforcement might, the memory's decay clock resets every time it's triggered — since triggering is itself presumably more likely while the memory is still strong, this is a self-sustaining loop that can make an intense memory functionally immortal, contradicting "persists longer" (a multiplier) with "never decays" (unbounded).
2. `memoryStrength()`'s existing halflife formula (`halflife = 3 + importance × 35`, capping even importance-1.0 memories around ~38 ticks) mathematically limits how long *any* current memory can persist. "Far longer than ordinary memories" needs either an exemption from this formula for intense memories or an explicit multiplier term — reactivation alone, layered on the existing formula, will not produce "far longer" on its own.

Separately, an undecided design question with real architectural weight: is a reactivation event pushed onto `world.events` (auditable in the log, consumes a `world.tick`, visible to `event.why`) or a silent mind-only update (invisible to the log and mind inspector, doesn't perturb tick-based systems)? Both are defensible; picking neither and discovering the answer implicitly during implementation is the pitfall.

**Why it happens:**
The requirement text ("re-trigger moments of emotion/belief") describes behavior, not mechanism — it's easy to implement the emotional/belief *effect* of reactivation without also deciding the decay-formula and event-log questions that determine whether the effect is bounded and observable.

**How to avoid:**
Decide and document, before implementation: (a) whether reactivation refreshes `formedTick` (recommend: no — track reactivation count/last-reactivated-tick separately from formation tick, and cap total reactivations or apply diminishing returns per reactivation), (b) whether intense memories get a separate halflife term or an explicit floor-immunity, (c) whether reactivation is a loggable event or silent. Write the decision into `PERSON-MODEL.md` alongside the formula, per the project's doc-sync rule.

**Warning signs:**
An NPC's oldest, most-reactivated memory never decays below "highly relevant" for the rest of a long session; the mind inspector/debug report shows emotion/belief changes with no corresponding entry anywhere explaining why they happened.

**Phase to address:**
The memory-reactivation phase, before formula tuning — this is a design decision, not a bug to catch in testing.

---

### Pitfall 7: Needs regeneration crossing a decision-gate threshold repeatedly (oscillation)

**What goes wrong:**
`needs.safety < 0.7` is one of the OR-conditions gating the retreat candidate in `decideAndAct()` (`sim.js:968`, per `CONCERNS.md`). Passive regeneration (an Active requirement) will move `safety` back up over time — but if it drifts slowly across the `0.7` boundary while small negative events keep nudging it back down, the retreat candidate can appear and disappear from the NPC's candidate set repeatedly across a session, producing visibly indecisive behavior (retreat this tick, not next, retreat again) that has nothing to do with the NPC's actual state trajectory, only where the raw number happens to sit relative to a hard cutoff. This is the classic utility-AI "dithering near a threshold" failure mode, here expressed through a needs gate rather than a scored candidate.

A second, more subtle trap: `world.tick` increments once per *action* (`sim.js:199`), not per unit of narrative time, so tick-based regeneration recovers needs faster during a busy reaction cascade (many actions per "moment") than during a quiet stretch — the regen rate is accidentally coupled to how eventful the session has been, not to elapsed time.

**Why it happens:**
`0.7` is a hard threshold with no hysteresis band, inherited from a codebase where needs never moved (so the threshold was never actually crossed dynamically — it only mattered as a one-time floor after a single Attack). Regeneration is the first mechanic that turns this into a value crossing the boundary repeatedly.

**How to avoid:**
Apply a hysteresis/deadband around any needs threshold used as a candidate gate: e.g., retreat becomes eligible below `0.65` but only becomes ineligible again above `0.75`, so a single value can't flicker a candidate in and out with small movements. This is a standard technique for utility-AI dithering (re-scoring cadence, stickiness bonus for the currently-active choice, or a switch threshold different from the eligibility threshold) — apply the same principle to the needs gate specifically, not just to `decideAndAct`'s own candidate scores. Separately, decide whether regen should be keyed to `world.tick` (accept the coupling to event density) or to a new independent time counter — don't leave it implicit.

**Warning signs:**
An NPC's retreat behavior looks "flickery" in the event log — present, absent, present again — across a session with no correspondingly flickery underlying cause (no repeated attacks); regen behaves differently in a session with heavy reaction cascades vs. a sparse one, given the same wall-clock number of top-level actions.

**Phase to address:**
The needs-regeneration phase — build the hysteresis band into the same change that adds the regen trigger, since retrofitting it after `decideAndAct` has been tuned around a hard `0.7` cutoff is more disruptive.

---

### Pitfall 8: Landing witness-ordering and drift/snap changes in the same phase makes both unverifiable

**What goes wrong:**
The urgency-based witness reordering fix (Active requirement, `CONCERNS.md`'s "Witness reaction order" item) changes *who reacts first*, which changes what later witnesses perceive, which changes their beliefs, emotions, and now — with Phase 2 — their drift/snap trajectory. If ordering and drift/snap logic change in the same phase or are tested together, any behavioral difference observed can't be attributed to either mechanism individually: a different final relationship value after the same scripted scenario could be "ordering now lets the victim retaliate before bystanders act" or "drift now nudges CompetitiveJungle after the second witnessed event" — indistinguishable without isolating the two.

**Why it happens:**
Both changes touch the same reaction-cascade code path (`performAction` → witness dispatch → `decideAndAct`) and both are motivated by the same milestone, making it tempting to land them together since they're conceptually adjacent ("fixing the reaction pipeline").

**How to avoid:**
Sequence: capture a small set of scripted-scenario baselines (fixed action sequence, recorded `event.why`/final relationship+need+emotion state) *before* either change lands. Land witness reordering alone first, re-run and diff against baseline, understand every difference. Only then land drift/snap on top of the reordered baseline. Never land both without a baseline in between.

**Warning signs:**
A behavioral regression is found and neither the ordering fix nor the drift logic can be confidently identified as the cause without re-running with one of the two changes reverted.

**Phase to address:**
Explicit phase ordering: witness-ordering fix as its own phase (or the first sub-step of a combined phase) with a baseline checkpoint, before drift/snap formulas land.

---

### Pitfall 9: A single pressure counter cannot represent "temporarily activated but not changed"

**What goes wrong:**
The Active requirements distinguish two things that sound similar but are structurally different: (1) slow drift toward a permanent trait change under sustained pressure, and (2) "repeated events that echo an intense event make its charge stickier/slower to fade **without that alone constituting a full Change to Person**." A single running-pressure-counter-against-a-threshold model (one of the two open designs floated in `PERSON-MODEL.md`) naturally implements (1) but not (2) — a counter that's high but hasn't crossed the change threshold is indistinguishable from "on its way to changing," which is exactly the state (2) says should *not* read as an in-progress permanent change. Implementing only a counter will look feature-complete (drift exists, snap exists, repeated echoes raise a number) while silently failing to model the requirement's actual distinction.

**Why it happens:**
"Stickier and slower to fade" and "closer to permanently changing" both describe a quantity going up, so a single number satisfies the surface description of both requirements simultaneously — the gap only shows up when someone asks "is this NPC currently different, or currently just keyed-up," and the single-counter model has no way to answer.

**How to avoid:**
Model at least two per-trait quantities: an accumulating **pressure** value that determines when a permanent drift/snap fires (crosses a threshold → trait actually changes), and a separate, faster-decaying **activation/charge** value that governs "this is currently top of mind and coloring reactions" without itself being the thing that changes on threshold-cross. Repeated echoes can boost activation's decay rate (sticker) without necessarily moving pressure at the same rate.

**Warning signs:**
Design review or playtesting can't produce an NPC who is "worked up about something recent" without that NPC's underlying trait value having already moved measurably — the two concepts collapse into one in practice even though the requirements describe them as distinct.

**Phase to address:**
The initial drift/snap design-and-data-model phase — this is a modeling decision to nail down before formulas are written, since it determines how many fields the mutation function needs to touch.

---

### Pitfall 10: Unseeded RNG turns single-event randomness into compounding, untraceable divergence

**What goes wrong:**
Today, `Math.random()` (unseeded, `sim.js:278`/`941`/`1019`) affects one action's outcome — a damage roll, a truth-or-scapegoat gossip choice — and its blast radius is local. Once drift/snap exist, a random roll that happens to push an intense event over the snap threshold (or not) changes a trait, which changes every subsequent scored decision for that NPC for the rest of the session — the randomness compounds into permanent divergence rather than a one-off variance. A traced bug ("Garrick attacked instead of retreating") becomes unreproducible not just for that tick but for the NPC's entire subsequent trajectory, since replaying the same scripted scenario can produce a different snap/no-snap outcome at the RNG-influenced step and cascade differently from there.

**Why it happens:**
The existing gap (no seedable-RNG abstraction, flagged in `CONCERNS.md`'s Performance Bottlenecks section) was tolerable when randomness only affected damage numbers or a single gossip roll. Drift/snap is qualitatively different because it makes randomness *session-shaping* rather than *event-local*.

**How to avoid:**
This is explicitly out of scope as "add a test suite," but a seeded RNG behind one call site (a small mulberry32-style generator, per `CONCERNS.md`'s own suggested fix) is not a test suite — it is what makes the project's own mandated manual verification step ("check by hand against the existing verified case") actually re-runnable once drift is in play. Without it, Pitfall 1's tick-0 regression case and Pitfall 8's scripted-scenario baselines are both undermined by the same randomness that used to be safely ignorable. Recommend introducing a single `rng()` call site (swappable, seeded by default in scripted/debug runs) as an infrastructure prerequisite for this milestone, distinct from and smaller than "add automated tests."

**Warning signs:**
A "verified by hand" regression check passes once and fails on a second identical-looking run with no code change between them; bug reports captured via `buildDebugReport()` can't be reproduced by re-running the same scripted action sequence.

**Phase to address:**
Infrastructure step at or before the start of the drift/snap phase — small enough to bundle with Pitfall 1's toggle work, not a separate large effort.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Mutate personality/values/worldview live inside `decideAndAct`/`perceiveEvent` instead of accumulate-then-commit | Simpler to write, fewer new fields | Cascade-amplified drift (Pitfall 3), impossible to reason about per-event | Never — commit-on-unwind is barely more code |
| Single pressure counter per trait instead of pressure + activation | Faster to ship, satisfies requirement text superficially | Silently fails the "activated, not changed" requirement (Pitfall 9) | Only as an explicit, documented MVP cut with the gap named in `PERSON-MODEL.md` |
| Prune beliefs by confidence threshold | Simple, reuses existing "confidence" field | Deletes protective "known false" records (Pitfall 5) | Never |
| Reuse `memoryStrength()`'s halflife formula unchanged for "intense memories persist far longer" | No new formula to design | Mathematically caps persistence at ~38 ticks regardless of intensity (Pitfall 6) | Only if "far longer" is redefined as "within the existing ~38-tick ceiling," which likely doesn't match intent |
| Skip the seeded-RNG call site because "test suite is out of scope" | Avoids infra work this milestone didn't budget for | Makes the project's own mandated manual verification step non-repeatable once drift exists (Pitfall 10) | Not acceptable for this milestone specifically, given the explicit manual-check requirement in `PROJECT.md` |

## Integration Gotchas

N/A — no external services, APIs, or third-party dependencies exist in this codebase (vanilla JS, no build step, no backend). This section is not applicable to this milestone.

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Belief array pruning added without also bounding `checkContradiction`/`findConflictingBeliefs` scan cost | Scans stay O(events-so-far) even after pruning shrinks the *displayed* array if pruning logic itself re-scans everything | Bound the scan alongside the prune, per `CONCERNS.md`'s own noted improvement path | Currently invisible at 5-NPC/few-hundred-event scale; would matter first if session length or NPC count grows |
| Reactivation checks scanning full memory array per witnessed event to find "reminders" | Added per-event cost proportional to memory count, on top of existing unbounded `world.events`/`mind.beliefs` growth | Key reactivation lookups by predicate/actor (whatever "reminder" match criteria phase design settles on) with an index, not a full scan per event | Same small-scale invisibility as above; flag if reactivation lookup is O(memories) per event, since that stacks on existing O(events) belief scans |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| None new introduced by this milestone | Drift/snap/memory-reactivation logic operates entirely on internal numeric mind-state and fixed value/worldview bank names — no new free-text or user-controlled input path is added | No action needed; the existing `innerHTML`-escaping gap noted in `CONCERNS.md` is unaffected by this milestone's scope |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|------------------|
| Trait/value/worldview drift happens invisibly — `event.why` is explicitly display-only and never read back into scoring (`PERSON-MODEL.md`) | Player watching the log/mind inspector can't tell "this NPC just permanently changed" from "this NPC is temporarily activated," even though the requirements treat these as meaningfully different states | Surface drift/snap and activation as distinct, visible mind-inspector signals (not just folded into existing `mind.log`), so a permanent Change to Person reads differently in the UI from a transient spike |
| Reactivated old memories re-trigger emotion/belief with no log trace if implemented as a silent mind update (see Pitfall 6) | Player sees an NPC suddenly act differently with no visible cause in the event log or debug report | Decide reactivation's observability explicitly (Pitfall 6) and, if silent, still surface it in the mind inspector even if not in `world.events` |

## "Looks Done But Isn't" Checklist

- [ ] **Drift/snap implemented:** Often missing the pressure-vs-activation split — verify an NPC can be "currently worked up" without its trait value having already moved (Pitfall 9)
- [ ] **Snap threshold implemented:** Often missing Tell/Move impact wiring — verify snap can actually fire from a claimed/told event, not only a witnessed one (Pitfall 4)
- [ ] **Belief decay/pruning implemented:** Often missing the "known false" exemption — verify a confidence-0 contradicted belief survives pruning and still blocks re-belief in the same lie (Pitfall 5)
- [ ] **Needs regeneration implemented:** Often missing hysteresis around the `0.7` retreat gate — verify a slowly-regenerating `safety` value near the threshold doesn't flicker the retreat candidate in and out across consecutive ticks (Pitfall 7)
- [ ] **Witness ordering fix implemented:** Often bundled with drift changes in the same commit — verify a scripted-scenario baseline exists from *before* the ordering change, diffed in isolation (Pitfall 8)
- [ ] **Regression case re-verified:** Often "verified" only against the original static-worldview case — verify a tick-0 drift-enabled variant of the two-clone case also passes, and that a toggle exists to reproduce the original case exactly (Pitfall 1)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|-----------------|
| Regression check silently invalidated by drift (Pitfall 1) | LOW | Add the `driftEnabled` toggle and tick-0 variant retroactively; re-verify by hand once |
| Cascade-amplified drift producing over-eager snaps (Pitfall 3) | MEDIUM | Refactor live mutation calls into accumulate-then-commit at cascade unwind; re-tune thresholds against the (now-stable) commit point |
| Naive belief pruning already shipped and deleted protective records (Pitfall 5) | MEDIUM | Add the "known false" exemption; for already-running sessions, no recovery of lost state is possible mid-session, but the fix prevents recurrence |
| Needs-gate oscillation observed in playtesting (Pitfall 7) | LOW | Add hysteresis band around the existing `0.7` threshold; no data migration needed since needs are live-computed, not stored-decayed |
| Ordering and drift changes landed together, regression unattributable (Pitfall 8) | HIGH | Requires reverting one change in isolation and re-running scripted scenarios to separate the two effects after the fact — expensive enough that prevention (sequencing) is much cheaper than recovery |
| Unseeded RNG blocking reproduction of a traced drift bug (Pitfall 10) | LOW | Introduce the seeded `rng()` call site; cannot retroactively reproduce past unseeded runs, but unblocks all future tracing |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. Drift destroys the only regression check | Phase introducing any mutation to personality/values/worldview | `driftEnabled=false` toggle reproduces original two-clone case exactly; drift-enabled tick-0 variant also passes |
| 2. Absence-vs-zero ambiguity | Same phase as #1, before formula tuning | One shared `applyDrift()` mutation function used by every drift/snap call site; explicit create/remove/clamp rules documented in `PERSON-MODEL.md` |
| 3. Cascade-compounding drift | Drift/snap accumulation-mechanism phase | Trace a 4-deep reaction cascade from one event; confirm drift/snap mutation fires once, at `reactionDepth === 0`, not once per depth level |
| 4. Snap can't fire from Tell/Move | Sequenced before or with snap-threshold phase | Scripted scenario: an intense `Tell` claim snaps a trait, matching an equivalently intense witnessed event |
| 5. Naive belief pruning deletes protective records | Belief decay/pruning phase | Scripted scenario: NPC with a "known false" belief about a lie survives pruning and rejects the same lie retold later |
| 6. Reactivation immortality / undecided log question | Memory-reactivation phase | Explicit written decision in `PERSON-MODEL.md` on refresh behavior, halflife exemption, and event-log visibility, before formula lands |
| 7. Needs-gate oscillation | Needs-regeneration phase | Scripted scenario: `safety` regenerating slowly near `0.7` does not flip the retreat candidate in and out across 3+ consecutive ticks |
| 8. Ordering + drift landed together | Witness-ordering phase, sequenced before drift/snap | Scripted-scenario baseline captured pre-ordering-fix, diffed in isolation post-fix, before drift/snap changes touch the same path |
| 9. Single-counter model conflates activation and change | Drift/snap design phase (data model), before formulas | Design doc/PERSON-MODEL.md shows two distinct per-trait quantities (pressure, activation) with different decay/threshold behavior |
| 10. Unseeded RNG compounds under drift | Infrastructure step at/before drift/snap phase start | Same scripted scenario run twice with seeded `rng()` produces identical `event.why`/final state both times |

## Sources

- `PERSON-MODEL.md` (this repo) — authoritative formulas, hooks, and the "Verified" two-clone regression case; primary source for Pitfalls 1, 2, 4, 5, 6, 9
- `.planning/codebase/CONCERNS.md` (this repo, dated 2026-08-12) — exact line-numbered fragility notes (witness ordering, belief/needs gaps, unseeded RNG, magic-number scoring); primary source for Pitfalls 3, 7, 8, 10
- `.planning/PROJECT.md` (this repo) — Active requirements and explicit scope boundary excluding an automated test suite; source for the scope tension named in Pitfall 10
- [Real Pursuit AI / hysteresis-comparator pattern discussion](https://engineerfix.com/how-a-hysteresis-comparator-prevents-oscillation/) — MEDIUM confidence, general electronics/control-systems source used only to confirm the standard hysteresis/deadband technique referenced in Pitfall 7 (not games-specific, but the mechanism generalizes directly)
- [Golden Master / Characterization Testing overview](https://en.wikipedia.org/wiki/Characterization_test) and [practical guide](https://blog.testunity.com/how-to-test-legacy-codebase-zero-tests) — MEDIUM confidence, general legacy-code technique referenced only as the underlying concept behind "capture a scripted-scenario baseline before changing shared code paths" (Pitfall 8), not adopted wholesale as "add a test suite," which is out of scope per `PROJECT.md`

---
*Pitfalls research for: Tiny Town Phase 2 person model (trait drift/snap, memory reactivation) + belief/needs/ordering fixes*
*Researched: 2026-08-12*
