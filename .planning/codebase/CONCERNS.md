# Codebase Concerns

**Analysis Date:** 2026-08-12

This document tracks technical debt, bugs, fragile areas, and structural risk in
Tiny Town. Several items here are intentional, already-documented deferrals —
`PERSON-MODEL.md`'s "Gaps for the next phase" section is the authoritative source
for those, and they're folded in below rather than re-litigated. Items not sourced
from `PERSON-MODEL.md` were found by tracing `sim.js`, `parser.js`, and
`presentation.js` directly.

## Tech Debt

**Witness reaction order is list-position, not urgency-driven (live concern, found this session).**
- Issue: `computeWitnesses()` (`sim.js:296-299`) returns witnesses in the fixed
  order `agentsAt()` (`sim.js:179-181`) produces, which is `Object.values(world.agents)`
  filtered — i.e., the insertion order agents were created in (`player, mara, ives,
  tomas, elena, garrick`, `sim.js:118-151`), never anything about the event itself.
  `performAction()` then does `witnesses.forEach(w => perceiveEvent(world, w, event))`
  (`sim.js:210`) — synchronous, depth-first: each witness's `perceiveEvent` →
  `decideAndAct` → (if it reacts) `performAction` → its own witnesses → their
  `perceiveEvent`, all fully unwinds via the call stack (bounded by
  `MAX_REACTION_DEPTH = 4`, `sim.js:186`) before the `forEach` moves to the next
  witness in the original list.
- Files: `sim.js:209-213` (`performAction` witness dispatch), `sim.js:296-299`
  (`computeWitnesses`), `sim.js:422-469` (`perceiveEvent`, recursion gate),
  `sim.js:839-998` (`decideAndAct`, where the Attack/retaliate candidate is scored).
- Impact: reaction *timing* in the event log currently reflects witness list
  position, not the psychological score `decideAndAct` computes. In one traced
  interaction, the actual attack victim scored highest for "attack" (the
  retaliate candidate) but sat later in `computeWitnesses()`'s output than two
  uninvolved bystanders — so the victim's retaliation landed several ticks after
  both bystanders had already reacted and their own cascades had fully resolved.
  This reads, in the log and mind inspector, as if the victim was slow or
  indifferent to being attacked, when the actual cause is plumbing: whose turn
  came up first in a `forEach`. Because each reaction consumes a tick
  (`world.tick++` in `performAction`, `sim.js:199`), the delay is baked into the
  event numbering itself, not just an artifact of console output order.
- Fix approach: two independent problems bundled together — (1) *within* one
  event, witnesses should probably be scored and dispatched in order of
  reaction urgency (e.g., compute all witnesses' candidate scores first, then
  fire the highest-scoring reaction across all witnesses before any of their
  followups, breadth-first rather than depth-first per witness); (2) even with
  correct ordering, the "many ticks later" symptom is inherent to a model where
  every reaction increments the same global tick counter — consider whether
  reactions to the *same* originating event should share a tick, or whether
  `event.tick` needs a sub-ordering field independent of `world.tick` so log
  consumers can tell "same moment, different order" from "genuinely delayed."
  Worth revisiting before reaction timing is used for anything beyond flavor
  (e.g., if a future feature reads "who reacted first" as meaningful).

**Belief decay/pruning never implemented.**
- Issue: `mind.beliefs` (`sim.js:429-438`, `sim.js:719-729`) only ever grows —
  no counterpart to `addMemory()`'s self-pruning (`sim.js:333-339`) or
  `memoryStrength()`'s live decay (`sim.js:323-326`) exists for beliefs, despite
  a witnessed belief being formed directly downstream of a memory.
- Files: `sim.js:429-438`, `sim.js:719-729`, all belief-array reads
  (`checkContradiction`, `findConflictingBeliefs`, `believesDead`).
- Impact: an NPC's belief array is unbounded and every entry stays at whatever
  confidence it was last set to forever, even ones formed from a single
  overheard, unreinforced claim ticks ago. Long sessions grow this array
  without limit (see Performance Bottlenecks below), and behaviorally, a
  witness never "forgets" a stale accusation the way they'd forget the memory
  underlying it.
- Fix approach: PERSON-MODEL.md flags this as open, not yet designed — the
  natural approach is a live-computed staleness function mirroring
  `memoryStrength()`, gated on the belief's `tick` and whether it's been
  reinforced since (a repeated claim already partially handles "reinforcement"
  via the corroboration path in `applyClaimBelief`, `sim.js:743-780`).

**Needs never regenerate; `belonging` has no triggers at all.**
- Issue: `mind.needs` (`safety`/`sustenance`/`belonging`) only ever drops.
  Exactly two triggers exist in the whole codebase: Attack drops `safety` by
  0.4 (`sim.js:281`), and bread hitting exactly zero after a Take drops
  `sustenance` by 0.4 (`sim.js:262-264`). Nothing raises any need back toward
  1, and `belonging` (default 0.6) is never touched by anything, anywhere.
- Files: `sim.js:65` (default), `sim.js:262-264`, `sim.js:281`, `sim.js:303-305`
  (`adjustNeed`, the only mutator, called from just those two sites).
- Impact: once an NPC is attacked or runs out of bread, that dimension of
  `needs` is depressed for the rest of the session — no recovery mechanic
  exists (no eating, no "felt safe for a while"). `needs.safety < 0.7` is one
  of the three OR-conditions gating the retreat candidate in `decideAndAct`
  (`sim.js:968`), so an NPC attacked once early in a session carries a
  permanent, never-recovering bias toward retreating for every subsequent
  session, regardless of how much time or how many positive events pass.
- Fix approach: documented as open in `PERSON-MODEL.md`; needs a regeneration
  rule (e.g., passive drift toward 1 absent new negative triggers) and at
  least one trigger for `belonging` before it's more than a stub field the
  mind inspector displays and nothing reads meaningfully.

**Tell/Move-aware memory importance not implemented — conversation memories always form at floor value.**
- Issue: `appraiseEvent()` (`sim.js:472-495`) has no branch for `Tell` or
  `Move` — `impact` stays `0`, and `addMemory()` (`sim.js:427`) clamps
  importance to a `0.1` floor regardless. `memoryStrength()`'s halflife formula
  (`halflife = 3 + importance × 35`, `sim.js:324`) means every conversation
  memory decays in ~6-7 ticks, identical to a shrug-worthy event, no matter how
  consequential the claim was ("X is dead" fades exactly as fast as small talk).
- Files: `sim.js:472-495` (`appraiseEvent`), `sim.js:427` (importance clamp).
- Impact: an NPC who was just told something explosive forgets having been
  told it almost immediately, which undercuts any future feature that wants
  memory of *being informed* to matter (e.g., "didn't I already hear this?").
- Fix approach: extend `appraiseEvent` with a Tell/Move-aware impact estimate —
  likely derived from the claim's predicate severity (an `attacked`/`stole_from`
  claim should read as more important than an `is_trustworthy` vouch) rather
  than a flat constant.

**`ReplenishFood` goal created but never read.**
- Issue: `upsertGoal(target, 'ReplenishFood', null, 0.4, world.tick, 'future')`
  fires once, on Take, when an NPC's bread hits zero (`sim.js:264`). Nothing
  in `decideAndAct`, `reassessGoals`, or anywhere else ever reads a goal of
  type `ReplenishFood` — it exists purely to be displayed by the mind
  inspector (`presentation.js:102-104`, the generic `goalItem` renderer).
- Files: `sim.js:264` (creation), `presentation.js:102-104` (display only).
- Impact: dead functionality masquerading as live state — a goal that shows
  up in the UI implying an NPC is "working toward" replenishing food, when no
  code path ever acts on it. Misleading if read as a signal of upcoming
  behavior.
- Fix approach: either wire a real behavior (an NPC low on food actively
  seeking bread — Take from someone, or a Give-request equivalent) or remove
  the goal creation until there's a consumer for it.

**`Tradition` and `Pleasure` values declared per-NPC, deliberately never wired.**
- Issue: Tomas holds `Tradition` (`sim.js:136`), Ives holds `Pleasure`
  (`sim.js:130`) — both present in the shared `VALUES` bank (`sim.js:16-19`)
  but no function in `sim.js` reads either via `getValueWeight()`.
- Files: `sim.js:16-19`, `sim.js:130`, `sim.js:136`.
- Impact: none functionally (the field is just inert data), but worth flagging
  because it's easy to mistake for an oversight rather than the documented,
  deliberate deferral it is — there's no ritual/custom mechanic for Tradition
  or leisure/consumption mechanic for Pleasure to attach to in a five-verb sim.
  `PERSON-MODEL.md` names this explicitly as "not a bug." Listed here so
  `CONCERNS.md` and `PERSON-MODEL.md` don't silently drift apart on the same fact.
- Fix approach: not a fix — becomes relevant only if a future verb/mechanic
  (ritual, consumption) gives either value something honest to hook into.

**Personality/Values/Worldview are fully static; "sticky, not static" is unbuilt (Phase 2).**
- Issue: all three boxes are set once in `createWorld()` and never mutated
  anywhere in the codebase (verified: no assignment to
  `mind.personality.*`/`mind.values`/`mind.worldview` outside agent creation).
  The intended design has these shift slowly under sustained pressure or snap
  from one intense event (the Phelps-Roper framework, per `PERSON-MODEL.md`).
- Files: `sim.js:44-74` (`makeAgent`, sole write site).
- Impact: none currently (matches documented behavior), but this is the
  largest designed-but-unbuilt piece of the person model — four open design
  questions are logged in `PERSON-MODEL.md` ("Gaps for the next phase," Phase 2)
  and none are answered yet, so there's no scoped ticket to pick up here
  without that design pass first.
- Fix approach: not actionable until the Phase 2 design questions in
  `PERSON-MODEL.md` are answered (sustained-pressure definition, snap
  threshold, self-modulated drift rate, per-trait vs. bundled drift).

## Known Bugs

**Explicit zero quantity ("take 0 bread from mara") silently becomes 1, not 0.**
- Symptoms: typing `take 0 bread from mara` (a string the parser accepts —
  `resolveQuantity()` returns `parseInt('0', 10) = 0`, `parser.js:16`) does not
  take zero bread; it takes exactly one.
- Files: `sim.js:222` (`const qty = params.quantity || 1;` in
  `checkPreconditions`), `sim.js:259` (`Math.min(params.quantity || 1, ...)` in
  Take's `applyEffects`), `sim.js:271` (same pattern in Give's `applyEffects`).
- Trigger: any command that resolves to an explicit `quantity: 0` — either
  typed literally (`take 0 bread from mara`) or via `take all bread from ives`
  when Ives currently holds zero bread (`resolveQuantity()` correctly computes
  `0` for "all" in that case, `parser.js:15`).
- Root cause: `params.quantity || 1` treats `0` as "not provided" (JS falsy
  coercion), silently substituting `1` in three separate places rather than
  distinguishing "no quantity given" from "quantity given as zero." For the
  literal `take 0 bread` case, this makes it impossible to express "take
  nothing" through the parser at all — the sim always takes at least 1 as long
  as the target holds at least 1. For the "take all from someone with none"
  case, the same `|| 1` coercion is what makes the precondition check
  correctly reject the action (`holder.inventory[item] || 0 < 1` → true →
  "not enough bread") — so that specific path doesn't misfire, but the error
  message is slightly misleading (it reads as if you asked for 1, not "all,
  which turned out to be 0").
- Workaround: none needed for the "take all" case (it fails safely, if with an
  imprecise message); the literal zero-quantity case has no workaround — it's
  simply unreachable to take/give exactly 0 units through the parser.

## Security Considerations

**`innerHTML` string interpolation throughout `presentation.js` has no centralized escaping.**
- Risk: every render function (`renderWorld`, `renderAgentCard`, `renderLog`,
  `renderMind`, `describeEvent`) builds markup via template-literal string
  interpolation directly into `.innerHTML` — agent names, claim predicates,
  item names, and location names are all inserted unescaped
  (`presentation.js:16-33`, `presentation.js:37-55`, `presentation.js:63-123`).
- Files: `presentation.js` throughout; the one field carrying user-controlled
  text is `item` in Take/Give (`sim.js:258`, `sim.js:270`) and `stole_from`'s
  `item` field in Tell claims (`parser.js:74-78`, `parser.js:39`, `parser.js:47`).
- Current mitigation: incidental, not intentional — `parser.js`'s regexes
  constrain every free-text token to `\w+` (word characters only, no HTML
  metacharacters), so no injection is currently reachable through the parser.
  Agent names are hardcoded in `createWorld()`, not user input.
- Recommendation: not urgent for a local, single-player, no-backend prototype,
  but the safety here is entirely a side effect of parser regex strictness,
  not a deliberate escaping boundary. If any future change introduces
  freer-form text (a chat feature, custom item names, a looser parser grammar,
  or if this sim ever gains a server/multiplayer component), this becomes a
  real stored/reflected-XSS surface with no existing guard to catch it. Worth
  a small `escapeHtml()` helper in `presentation.js` before that happens,
  rather than after.

## Performance Bottlenecks

**Unbounded growth of `world.events` and `mind.beliefs` over long sessions.**
- Problem: `world.events` (`sim.js:207`) and `mind.beliefs`
  (`sim.js:429-438`, `sim.js:719-729`) never shrink — contrast with
  `mind.memories` (hard-capped at 40, `sim.js:338`) and `mind.emotions`
  (hard-capped at 20, `sim.js:309`), which both have explicit ceilings.
- Files: `sim.js:207` (event push), `sim.js:429`/`719` (belief push),
  `sim.js:557-586` (`checkContradiction`, does `world.events.some()`/`.find()`
  scans), `sim.js:763-772` (`applyClaimBelief`'s corroboration check, another
  full `world.events.find()` plus a `witness.mind.beliefs.some()` scan),
  `sim.js:653-661` (`findConflictingBeliefs`, a full `witness.mind.beliefs.filter()`
  on every claim).
- Cause: every witnessed or claimed belief formation re-scans the full event
  ledger and/or the witness's full belief array at least once, sometimes
  twice, with no index or cutoff. For 5 NPCs this is currently invisible in
  practice (a "long" prototype session is still a few hundred events at most),
  but the cost is O(events-so-far) per perception, compounding across every
  witness of every event, including reaction cascades.
- Improvement path: not worth optimizing prematurely at current NPC/session
  scale, but if belief decay/pruning (see Tech Debt above) is ever built, it
  would also cap this scan cost as a side effect — worth solving both at once
  rather than adding pruning without also bounding the scans it feeds.

**`Math.random()` used directly with no seed — behavior is non-reproducible.**
- Problem: `Math.random()` appears un-seeded in Attack damage
  (`sim.js:278`), whether a gossiping witness tells the truth or scapegoats
  (`sim.js:941`), and scapegoat selection (`sim.js:1019`). No RNG abstraction
  exists to swap in a seeded generator.
- Files: `sim.js:278`, `sim.js:941`, `sim.js:1019`.
- Cause: no seedable-RNG layer was built in.
- Improvement path: not a performance issue in the literal sense, but flagged
  here because it blocks reproducing a specific traced interaction exactly
  (the debug report in `presentation.js`'s `buildDebugReport()` captures full
  state but not the RNG stream that produced it) — a seeded RNG (even a simple
  mulberry32-style one swapped in behind a single `rng()` call site) would
  make bug reports and regression checks deterministic.

## Fragile Areas

**`decideAndAct()`'s scoring terms are inline magic numbers with no single tuning surface.**
- Files: `sim.js:839-998`, all of `checkPreconditions`/`applyAppraisal`/
  `applyClaimBelief` (`sim.js:215-813`).
- Why fragile: every behavioral weight (`0.3`, `0.4`, `0.15`, clamp bounds,
  etc.) is a literal inline in the formula that uses it, not a named constant
  in one place. `PERSON-MODEL.md`'s "Hooks" listings are the closest thing to
  a map of what reads what, but changing one number requires finding it in
  context and reasoning about every other term in that candidate's score to
  know if the balance is still sane (e.g., `doNothingScore` is deliberately
  centered on personality's `0.5` default so an average NPC reproduces "the
  old flat baseline almost exactly" — a comment-only guarantee, not something
  a change to a neighboring term would visibly break).
- Safe modification: change one named term at a time, and re-run the two
  documented verification cases (`PERSON-MODEL.md`'s "two clones, opposite
  `CompetitiveJungle` weight, same event, different reaction" check) before
  assuming a weight tweak is safe. There is no automated version of this
  check (see Test Coverage Gaps).
- Test coverage: none — see below.

**`reactionDepth` is a single module-level mutable counter shared by the whole engine.**
- Files: `sim.js:185-186` (declaration), `sim.js:461-469` (increment/decrement
  via `try/finally`).
- Why fragile: intentional and currently safe — the `try/finally` guarantees
  it's balanced even if `decideAndAct`/`performAction` throws partway through
  a reaction — but it is the one piece of module-level mutable state in a
  file that otherwise threads `world` through every function explicitly.
  `CONVENTIONS.md` already flags this as "do not add more module-level
  mutable state without equally tight scoping." It also means `sim.js` cannot
  currently run two independent simulations concurrently in the same JS
  context (e.g., two `world`s in the same page/tab) without their reaction
  depth counters interfering with each other — not a problem today (one
  `world` global in `presentation.js`), but a real constraint if that ever
  changes.
- Safe modification: any future multi-world support needs `reactionDepth`
  moved onto `world` itself (or passed explicitly) rather than staying
  module-global.

**`checkContradiction()`'s ground-truth logic is dense conditional branching with no test coverage.**
- Files: `sim.js:537-590`.
- Why fragile: the self-authorship exclusion (actors never get a witnessed
  belief about their own actions, so ground-truth checks fall back to scanning
  `world.events` directly) and the `selfPerpetratedMisattribution` distinction
  (being falsely accused vs. having someone else blamed for what you actually
  did) are both subtle, documented in comments, and encoded as boolean logic
  with several intersecting cases. A change to `applyEffects`'s event shape
  (e.g., adding a new verb, or changing what counts as "the same incident")
  risks silently breaking one of these branches without any test to catch it.
- Safe modification: read the comment block above the function
  (`sim.js:530-536`) in full before touching it; changes here should be
  verified against at least the two named cases in the comments (falsely
  accused vs. protected-by-misattribution) by hand, since there's no
  automated check.

## Test Coverage Gaps

**No test suite exists anywhere in the repository.**
- What's not tested: everything — `CLAUDE.md` states explicitly "There is no
  test suite, linter, or build command in this repo," confirmed by the file
  listing (no `*.test.js`, `*.spec.js`, test runner config, or `package.json`
  at all).
- Files: N/A (absence, not a file).
- Risk: the engine's core value is emergent, non-scripted behavior driven by
  dozens of interacting numeric weights (`decideAndAct`, `applyAppraisal`,
  `applyClaimBelief`) — exactly the kind of logic where a small change can
  silently shift which candidate wins a scoring comparison for some but not
  all personality combinations, without producing an error, only a different
  (and possibly wrong) NPC choice. The one verification case that exists
  ("two clones, opposite `CompetitiveJungle` weight, same event, different
  reaction") is described in `PERSON-MODEL.md` as manually verified, not
  encoded as a repeatable test. There is no regression protection for that
  case or any other today.
- Priority: High if further tuning/weight changes are planned (every change
  in the Tech Debt section above touches this same scoring surface); Low if
  the project stays purely exploratory/manual-testing scope. Given the
  project already treats `PERSON-MODEL.md`/`sim.js` drift as a bug
  (`CLAUDE.md`), the same discipline arguably extends to behavior drift —
  worth at least a handful of scripted scenario checks (seed a world, run a
  fixed action sequence, assert on `event.why`/final relationship values)
  once `Math.random()` is made seedable (see Performance Bottlenecks above),
  since current NPC decisions aren't fully reproducible without one.

---

*Concerns audit: 2026-08-12*
