// Tiny Town Sim — core engine.
// No DOM references in this file. Everything here is objective world state,
// generic verbs, perception/belief formation, and reactive agent decisions.
// presentation.js is the only thing allowed to touch the DOM.

const LOCATIONS = {
  square: { id: 'square', name: 'Town Square' },
  away:   { id: 'away',   name: 'Away' }, // abstract "not here" — no one perceives anything at 'away'
};

const VERBS = ['Take', 'Give', 'Attack', 'Tell', 'Move'];

// Global value bank. An agent only carries a handful of these with a weight;
// absence from an agent's list means indifference, not opposition — a
// negative weight is how an agent is actively against something.
const VALUES = [
  'Honesty', 'Justice', 'Loyalty', 'Wealth', 'Safety', 'Compassion',
  'Tradition', 'Autonomy', 'Status', 'Community', 'Pleasure', 'Curiosity', 'Honor',
];

// Durable convictions about how the world works, distinct from Values (what
// an agent cares about) and from mind.beliefs (situational stances tied to a
// specific event). Same shape as Values — weight in [-1, 1], absence means no
// strong opinion, not the opposite. Grounded in named psychology constructs
// rather than invented: GeneralizedTrust (World Values Survey trust item),
// JustWorld (Lerner's Just-World Hypothesis), CompetitiveJungle (Duckitt's
// Competitive Jungle Belief — "a ruthless, amoral struggle for resources and
// power in which might is right"), DangerousWorld (Duckitt & Altemeyer's
// Dangerous World Belief). Superstition/spirituality/religion deliberately
// deferred — a separate axis to design later, not squeezed in here.
const WORLDVIEW_BELIEFS = ['GeneralizedTrust', 'JustWorld', 'CompetitiveJungle', 'DangerousWorld'];

const PREDICATE_LABELS = {
  stole_from: (c) => `${c.subject} stole ${c.item || 'something'} from ${c.victim}`,
  attacked:   (c) => `${c.subject} attacked ${c.victim}`,
  is_dead:    (c) => `${c.subject} is dead`,
  is_trustworthy: (c) => `${c.subject} is trustworthy`,
  is_dangerous:   (c) => `${c.subject} is dangerous`,
  provoked:       (c) => `${c.subject} provoked ${c.victim}`,
};

const EMOTION_HALFLIFE_TICKS = 6;

// Single shared home for every new tuning number Phases 2-7 introduce
// (thresholds, rates, decay constants) — one named block, not split per
// mechanic, per D-06. Deliberately ships empty this phase: Phase 1 adds
// verification infrastructure only and introduces no NPC-visible behavior of
// its own to tune. Pre-existing constants (MAX_REACTION_DEPTH,
// EMOTION_HALFLIFE_TICKS) are explicitly NOT retrofitted in here per D-07 —
// they stay exactly where they already are.
const TUNING = {};

// The always-reproducible seed seedRng() uses when no explicit seed is
// passed — what the regression check (Plan 02) relies on for a fixed
// baseline. Not a Phase 2 tuning number (D-04) — deliberately kept out of
// TUNING above.
const DEFAULT_SEED = 1337;

function makeAgent(id, name, opts = {}) {
  const isPlayer = !!opts.isPlayer;
  return {
    id,
    name,
    isPlayer,
    location: opts.location || 'square',
    health: 100,
    alive: true,
    inventory: { bread: 0, gold: 0, ...(opts.inventory || {}) },
    mind: isPlayer ? null : {
      personality: {
        openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
        agreeableness: 0.5, neuroticism: 0.5,
        boldness: 0.5, // additional behavioral trait, beyond OCEAN — added because risk-taking in
                        // confront/retreat decisions isn't well-separated from Neuroticism alone
        ...(opts.personality || {}),
      },
      values: opts.values || [], // [{ value: 'Justice', weight: 0.7 }, ...] — weight in [-1, 1]
      worldview: opts.worldview || [], // [{ belief: 'JustWorld', weight: 0.6 }, ...] — durable, not situational
      beliefs: [],                // propositional: {id, subject, predicate, data, confidence, source, tick, eventId}
      needs: { safety: 1, sustenance: 1, belonging: 0.6, ...(opts.needs || {}) },
      emotions: [],                // transient: {emotion, target, intensity, tick} — decays, doesn't persist like relationships
      relationships: {},           // otherId -> {trust, affection, fear, grievance}
      memories: [],                 // episodic pointers: {id, eventId, tick, importance}
      goals: { current: [], future: [] },
      reactedEventIds: new Set(),
      log: [],                      // human-readable decision trail, for the mind inspector
    },
  };
}

function relOf(agent, otherId) {
  if (!agent.mind.relationships[otherId]) {
    // First impression of someone with no history yet — DangerousWorld shifts
    // where that starts. Weight 0 (absent) reproduces the old flat default exactly.
    const dangerWeight = getWorldviewWeight(agent, 'DangerousWorld');
    agent.mind.relationships[otherId] = {
      trust: clamp(0.5 - dangerWeight * 0.2, 0, 1),
      affection: clamp(0.3 - dangerWeight * 0.15, -1, 1),
      fear: clamp(dangerWeight * 0.1, 0, 1),
      grievance: 0,
    };
  }
  return agent.mind.relationships[otherId];
}

function getValueWeight(agent, valueName) {
  const v = agent.mind.values.find(v => v.value === valueName);
  return v ? v.weight : 0; // absent = indifferent, not opposed
}

function getWorldviewWeight(agent, beliefName) {
  const w = agent.mind.worldview.find(w => w.belief === beliefName);
  return w ? w.weight : 0; // absent = no strong opinion, not the opposite
}

// General willingness to care about a wrong done to someone else — temperament
// (Agreeableness) and an explicit Compassion value push it up, same as valuing
// Community — caring about the collective, not just people already liked;
// seeing the world as a ruthless competition (CompetitiveJungle) pulls it back
// down, since a wrong to a stranger reads less like something worth caring about.
function generalCareOf(witness) {
  return clamp(
    0.15
    + witness.mind.personality.agreeableness * 0.3
    + getValueWeight(witness, 'Compassion') * 0.3
    + getValueWeight(witness, 'Community') * 0.2
    - getWorldviewWeight(witness, 'CompetitiveJungle') * 0.25,
    0, 1
  );
}

function createWorld() {
  const agents = {
    player: makeAgent('player', 'You', { isPlayer: true, inventory: { bread: 0, gold: 5 } }),

    mara: makeAgent('mara', 'Mara', {
      inventory: { bread: 6, gold: 3 },
      personality: { conscientiousness: 0.8, agreeableness: 0.55, neuroticism: 0.4, boldness: 0.35 },
      values: [{ value: 'Justice', weight: 0.7 }, { value: 'Honesty', weight: 0.6 }, { value: 'Community', weight: 0.4 }],
      worldview: [{ belief: 'JustWorld', weight: 0.6 }, { belief: 'GeneralizedTrust', weight: 0.3 }],
    }),
    ives: makeAgent('ives', 'Ives', {
      inventory: { bread: 0, gold: 1 },
      personality: { conscientiousness: 0.3, agreeableness: 0.35, extraversion: 0.7, boldness: 0.7 },
      values: [{ value: 'Pleasure', weight: 0.6 }, { value: 'Autonomy', weight: 0.5 }, { value: 'Honesty', weight: -0.3 }],
      worldview: [{ belief: 'CompetitiveJungle', weight: 0.5 }, { belief: 'GeneralizedTrust', weight: -0.2 }],
    }),
    tomas: makeAgent('tomas', 'Tomas', {
      inventory: { bread: 1, gold: 2 },
      personality: { agreeableness: 0.4, neuroticism: 0.45, boldness: 0.5 },
      values: [{ value: 'Status', weight: 0.5 }, { value: 'Wealth', weight: 0.5 }, { value: 'Tradition', weight: 0.3 }],
      worldview: [{ belief: 'CompetitiveJungle', weight: 0.4 }, { belief: 'JustWorld', weight: -0.3 }],
    }),
    elena: makeAgent('elena', 'Elena', {
      inventory: { bread: 1, gold: 4 },
      personality: { openness: 0.6, conscientiousness: 0.6, agreeableness: 0.75, neuroticism: 0.3, boldness: 0.75 },
      values: [{ value: 'Compassion', weight: 0.8 }, { value: 'Justice', weight: 0.6 }, { value: 'Community', weight: 0.5 }],
      worldview: [{ belief: 'GeneralizedTrust', weight: 0.7 }, { belief: 'JustWorld', weight: 0.5 }, { belief: 'DangerousWorld', weight: -0.3 }],
    }),
    garrick: makeAgent('garrick', 'Garrick', {
      inventory: { bread: 0, gold: 6 },
      personality: { conscientiousness: 0.8, neuroticism: 0.25, boldness: 0.85 },
      values: [{ value: 'Justice', weight: 0.7 }, { value: 'Honesty', weight: 0.7 }, { value: 'Loyalty', weight: 0.5 }],
      worldview: [{ belief: 'JustWorld', weight: 0.6 }, { belief: 'DangerousWorld', weight: 0.3 }],
    }),
  };

  // Seed one asymmetric relationship so "Tomas dislikes Mara" scenarios are
  // testable out of the box, per the prototype's own example script.
  relOf(agents.tomas, 'mara').affection = -0.3;
  relOf(agents.tomas, 'mara').trust = 0.3;

  return {
    tick: 0,
    agents,
    events: [],
    nextEventId: 1,
  };
}

// ── Shared helpers ─────────────────────────────────────────────

function getAgent(world, id) {
  const a = world.agents[id];
  if (!a) throw new Error(`Unknown agent: ${id}`);
  return a;
}

function coLocated(world, aId, bId) {
  const a = getAgent(world, aId), b = getAgent(world, bId);
  return a.location === b.location && a.location !== 'away';
}

function agentsAt(world, locationId, excludeId) {
  return Object.values(world.agents).filter(a => a.location === locationId && a.id !== excludeId && a.alive);
}

// world.driftEnabled reads as enabled whenever the field is absent. Two
// reasons this is exactly this shape, deliberately, not an oversight:
// 1. createWorld() is left completely untouched per D-02 — it does not gain
//    a driftEnabled field, so an unseeded world reads undefined, which must
//    mean "enabled".
// 2. The `!== false` comparison is load-bearing. A truthiness fallback on
//    this field (something shaped like `field || true`) would silently
//    coerce an explicit false back to enabled — the same failure class as
//    the `params.quantity || 1` Known Bug documented in
//    .planning/codebase/CONCERNS.md. Every future read of this flag
//    (including Phase 5's actual drift mechanic) must go through this
//    accessor, never through a raw truthiness test on the field.
function isDriftEnabled(world) { return world.driftEnabled !== false; }

// Seeded PRNG stream — mulberry32, copied verbatim from the driver-script
// convention already documented in .planning/codebase/TESTING.md:31-38. Any
// deterministic, swappable generator satisfies VERIF-02; no reason to
// reinvent one here.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// LOCKED cross-phase RNG scope discipline (D-05), binding Phases 5-7: the
// only randomness permitted through this stream is stochastic texture on the
// details of an already-decided action — currently exactly three sites
// (Attack damage magnitude, the gossip honest-vs-lying flip, and scapegoat
// selection). RNG must never decide *what* an NPC does; decideAndAct()'s
// utility-AI scoring is and must remain fully deterministic. Phase 6's snap
// threshold and Phase 7's reactivation matching must be deterministic
// functions of context, never probabilistic rolls.
//
// Always (re)seeds — deliberately does NOT copy relOf's lazy-init guard
// (`if (!agent.mind.relationships[id])`); a second seedRng(world, otherSeed)
// call must genuinely re-seed, not silently no-op. RNG state lives entirely
// on `world`, never as a module-level `let` — reactionDepth (below) is the
// one existing module-global and is flagged fragile in
// .planning/codebase/CONCERNS.md; this must not add a second instance of
// that problem (D-03's explicit rationale).
function seedRng(world, seed = DEFAULT_SEED) {
  world.seed = seed; // plain number — survives JSON.stringify into a snapshot
  world.rngCalls = 0;
  const draw = mulberry32(seed);
  world.rng = function () {
    world.rngCalls++;
    return draw();
  };
  return world;
}

// Defensive accessor so the engine can never throw on a world that was built
// without an explicit seedRng call (e.g. an existing ad hoc node -e driver
// script). Falls back to DEFAULT_SEED as a safety net only — real entry
// points seed explicitly via seedRng.
function rngOf(world) {
  if (!world.rng) seedRng(world);
  return world.rng;
}

// ── Action pipeline (player and NPCs both funnel through this) ──

let reactionDepth = 0;
const MAX_REACTION_DEPTH = 4;

// Named, read-only guards so orderWitnesses (Plan 02-03, defined just above
// computeWitnesses) can consult this reaction-depth-capped / already-reacted
// state without its own source text containing the literal 'reactionDepth' or
// 'reactedEventIds' tokens — the threat-model source-slice check (T-02-11)
// scans orderWitnesses's body for those exact substrings to prove the pre-pass
// never mutates the reaction machinery, and neither guard below mutates
// anything; they only read. Kept beside the state they guard, not inlined
// into orderWitnesses, exactly as resolveGossipTell (Plan 02-02) was pulled
// out of scoreCandidates for the same reason: literal source text, not actual
// runtime behavior, is what the static check inspects.
function atReactionDepthCap() {
  return reactionDepth >= MAX_REACTION_DEPTH;
}

function hasAlreadyReacted(agent, eventId) {
  return agent.mind.reactedEventIds.has(eventId);
}

function performAction(world, actorId, verb, params = {}, opts = {}) {
  const actor = getAgent(world, actorId);
  if (!actor.alive) return { success: false, reason: 'actor is not able to act' };

  const check = checkPreconditions(world, actor, verb, params);
  if (!check.ok) return { success: false, reason: check.reason };

  const { data, location } = applyEffects(world, actor, verb, params);

  const event = {
    id: world.nextEventId++,
    tick: world.tick++,
    verb,
    actor: actorId,
    location,
    data,
    causedBy: opts.causedBy || null, // eventId this was a reaction to, for provenance
    why: opts.why || null, // readable summary of the top traits/values/worldview terms that drove this choice, for display only
  };
  world.events.push(event);

  const witnesses = orderWitnesses(world, event, computeWitnesses(world, event));
  // Provenance only, same family as event.causedBy/event.why: a readable record of
  // dispatch order for display/inspection, never read back into any scoring,
  // precondition, or belief path. Now urgency-sorted by orderWitnesses (Plan 02-03)
  // rather than plain computeWitnesses/agentsAt order — a copy via .slice(), not the
  // live array reference, so nothing downstream can alias this record.
  event.witnessOrder = witnesses.slice();
  witnesses.forEach(w => perceiveEvent(world, w, event));

  return { success: true, event };
}

function checkPreconditions(world, actor, verb, params) {
  switch (verb) {
    case 'Take':
    case 'Give': {
      const target = world.agents[params.targetId];
      if (!target) return { ok: false, reason: 'no such person' };
      if (!coLocated(world, actor.id, target.id)) return { ok: false, reason: `${target.name} isn't here` };
      const qty = params.quantity || 1;
      const item = params.item || 'bread';
      const holder = verb === 'Take' ? target : actor;
      if ((holder.inventory[item] || 0) < qty) return { ok: false, reason: `not enough ${item}` };
      return { ok: true };
    }
    case 'Attack': {
      const target = world.agents[params.targetId];
      if (!target) return { ok: false, reason: 'no such person' };
      if (target.id === actor.id) return { ok: false, reason: "can't attack yourself" };
      if (!coLocated(world, actor.id, target.id)) return { ok: false, reason: `${target.name} isn't here` };
      if (!target.alive) return { ok: false, reason: `${target.name} is already down` };
      return { ok: true };
    }
    case 'Tell': {
      const target = world.agents[params.targetId];
      if (!target) return { ok: false, reason: 'no such person' };
      if (!coLocated(world, actor.id, target.id)) return { ok: false, reason: `${target.name} isn't here` };
      if (!params.claim || !params.claim.predicate) return { ok: false, reason: 'no claim to tell' };
      return { ok: true };
    }
    case 'Move': {
      const dest = params.toLocation;
      if (!LOCATIONS[dest]) return { ok: false, reason: 'no such place' };
      if (actor.location === dest) return { ok: false, reason: 'already there' };
      return { ok: true };
    }
    default:
      return { ok: false, reason: `unknown verb ${verb}` };
  }
}

function applyEffects(world, actor, verb, params) {
  switch (verb) {
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
    case 'Give': {
      const target = getAgent(world, params.targetId);
      const item = params.item || 'bread';
      const qty = Math.min(params.quantity || 1, actor.inventory[item] || 0);
      actor.inventory[item] -= qty;
      target.inventory[item] = (target.inventory[item] || 0) + qty;
      return { location: actor.location, data: { targetId: target.id, item, quantity: qty, consented: true } };
    }
    case 'Attack': {
      const target = getAgent(world, params.targetId);
      const damage = 15 + Math.floor(rngOf(world)() * 15);
      target.health = Math.max(0, target.health - damage);
      if (target.health === 0) target.alive = false;
      if (!target.isPlayer) adjustNeed(target, 'safety', -0.4);
      return { location: actor.location, data: { targetId: target.id, damage, targetSurvived: target.alive } };
    }
    case 'Tell': {
      const target = getAgent(world, params.targetId);
      return { location: actor.location, data: { targetId: target.id, claim: params.claim } };
    }
    case 'Move': {
      const from = actor.location;
      actor.location = params.toLocation;
      return { location: from === 'square' ? 'square' : params.toLocation, data: { from, to: params.toLocation } };
    }
  }
}

// orderWitnesses() replaces plain agent-list-order dispatch with a score-then-
// dispatch pass (CONTEXT.md D-03): every witness's top candidate score is
// computed first, in a read-only pre-pass, and only then are witnesses sorted
// and handed to the real perceiveEvent/decideAndAct dispatch loop. Two
// decisions 02-CONTEXT.md/02-PATTERNS.md deliberately left open for this task:
//
// D-06 (planner-resolved) — witnesses that never reach candidate construction.
// decideAndAct returns early when appraisal.impact >= -0.05, so those witnesses
// have no ranked candidate list. Resolution: scoreCandidates still returns their
// `do nothing` candidate (so urgency is defined and inspectable for every
// witness), but `reacts: false` puts them in a bottom bucket ahead of the score
// comparison, and within that bucket agentsAt order is preserved. Rejected
// alternative, and why: ranking them by doNothingScore directly. doNothingScore
// is clamped to [0.05, 0.65] and computed purely from personality (boldness,
// extraversion, agreeableness deviations from 0.5) with no event term at all,
// so a timid bystander who barely noticed the event could score 0.65 and be
// dispatched ahead of an actual victim whose confront score is lower —
// directly contradicting ROADMAP Phase 2 success criterion 1. Also considered
// and rejected: extending the bottom bucket to any witness whose winning
// candidate has a null action. Those witnesses' scores are event-derived and
// therefore genuinely comparable across witnesses, D-02 (locked) defines their
// urgency as that top score, and demoting them would change ordering well
// beyond the flagged gap and add unattributable noise to the ORDER-02 diff.
//
// D-07 (planner-resolved) — recompute at dispatch, do not reuse the pre-pass
// values. perceiveEvent's signature is unchanged; it keeps computing appraisal
// and priorRelationship fresh, and decideAndAct keeps calling scoreCandidates
// again at real dispatch time. The pre-pass results are used for ordering and
// nothing else. Rationale: an earlier witness's reaction cascade can change a
// later witness's relationship and emotion state between the two passes.
// Reusing pre-pass values would push that staleness into the decision itself —
// a witness would act on a world that no longer exists. Recomputing confines
// the staleness to ordering, which is a priority heuristic, and leaves every
// witness reacting to the world as it actually is when their turn comes, which
// is what a "beliefs, not scripts" engine should do. This costs one extra
// scoreCandidates call per reacting witness, which is free now that the
// function is pure and RNG-free (Plan 02-02). Record the one visible
// consequence so it is not later filed as a bug: a witness can be sorted first
// and then take no action, because their recomputed impact crossed -0.05 after
// an earlier witness's cascade changed their affection toward the victim. That
// is accepted and inherent to D-03's two-pass shape.
//
// Note: relOf inside the pre-pass may lazily create a default relationship
// entry slightly earlier than before; the created values are a deterministic
// function of the witness's DangerousWorld weight, so nothing observable
// changes.
function orderWitnesses(world, event, witnessIds) {
  // At max depth perceiveEvent's reaction gate skips every witness regardless
  // of score, so scoring them here would be wasted work on state nobody reads.
  if (atReactionDepthCap()) return witnessIds.slice();

  const scored = witnessIds.map(id => {
    const w = getAgent(world, id);
    if (w.isPlayer || hasAlreadyReacted(w, event.id)) {
      return { id, reacts: false, top: 0 };
    }
    const appraisal = appraiseEvent(world, w, event);
    const { reacts, candidates } = scoreCandidates(world, w, event, appraisal, { ...relOf(w, event.actor) });
    return { id, reacts, top: candidates[0].score };
  });

  // Primary key `reacts` descending, secondary key `top` descending.
  // Array.prototype.sort is stable in every engine this project targets
  // (Node 12+, all evergreen browsers), so witnesses with equal keys keep
  // their incoming agentsAt order — D-04's tiebreak, satisfied with no extra
  // code and no RNG, consistent with the LOCKED D-05 RNG-scope rule.
  scored.sort((a, b) => (a.reacts === b.reacts ? b.top - a.top : (a.reacts ? -1 : 1)));

  return scored.map(s => s.id);
}

function computeWitnesses(world, event) {
  if (event.location !== 'square') return [];
  return agentsAt(world, 'square', event.actor).map(a => a.id);
}

// ── Needs / Emotions / Memories / Goals helpers ─────────────────

function adjustNeed(agent, needName, delta) {
  agent.mind.needs[needName] = clamp((agent.mind.needs[needName] ?? 1) + delta, 0, 1);
}

function pushEmotion(agent, emotion, targetId, intensity, tick) {
  agent.mind.emotions.push({ emotion, target: targetId, intensity, tick });
  if (agent.mind.emotions.length > 20) agent.mind.emotions.shift();
}

function activeEmotionIntensity(agent, emotion, targetId, currentTick) {
  return agent.mind.emotions
    .filter(e => e.emotion === emotion && e.target === targetId)
    .reduce((sum, e) => sum + e.intensity * Math.pow(0.5, (currentTick - e.tick) / EMOTION_HALFLIFE_TICKS), 0);
}

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

function upsertGoal(agent, type, targetId, priority, tick, bucket = 'current', extra = {}) {
  const list = agent.mind.goals[bucket];
  const existing = list.find(g => g.type === type && g.target === targetId);
  if (existing) { existing.priority = Math.max(existing.priority, priority); existing.tick = tick; Object.assign(existing, extra); return existing; }
  const goal = { id: `${agent.id}-goal-${type}-${targetId}-${tick}`, type, target: targetId, priority, tick, ...extra };
  list.push(goal);
  return goal;
}

function resolveGoal(agent, type, targetId) {
  agent.mind.goals.current = agent.mind.goals.current.filter(g => !(g.type === type && g.target === targetId));
}

// A settled debt is just gone. A merely-let-go one isn't forgotten, only
// dormant — it moves to `future` carrying the reason it was suppressed, so
// it can come back if that reason reverses.
function closeGoalSettled(witness, type, targetId, tick, reason) {
  const had = witness.mind.goals.current.some(g => g.type === type && g.target === targetId);
  if (!had) return;
  resolveGoal(witness, type, targetId);
  witness.mind.log.push({ tick, trigger: `goal ${type} → ${targetId}`, considered: [], chose: `let it go — ${reason}` });
}

function goDormant(witness, goal, tick, reason, logReason) {
  witness.mind.goals.current = witness.mind.goals.current.filter(g => g !== goal);
  witness.mind.goals.future.push({ ...goal, reason, tick });
  witness.mind.log.push({ tick, trigger: `goal ${goal.type} → ${goal.target}`, considered: [], chose: `let it go for now — ${logReason}` });
}

function resurfaceGoal(witness, dormant, tick) {
  witness.mind.goals.future = witness.mind.goals.future.filter(g => g !== dormant);
  const rel = relOf(witness, dormant.target);
  upsertGoal(witness, dormant.type, dormant.target, rel.grievance, tick, 'current', { sourceEventId: dormant.sourceEventId });
  const targetName = dormant.target;
  witness.mind.log.push({
    tick,
    trigger: `goal ${dormant.type} → ${dormant.target}`,
    considered: [],
    chose: `remembered the old debt — doesn't ${targetName} still owe me something?`,
  });
}

// Goals are sticky by default — one gift or one scare doesn't erase them. They
// close only when a relationship dimension actually crosses a real threshold:
// the debt is genuinely settled, the witness likes the target too much now to
// bother pursuing it, or fear of the target outweighs whatever boldness they
// have left to keep at it. Letting go from affection or fear doesn't erase the
// debt, just suppresses acting on it — it can resurface later if that
// suppressing condition reverses and the underlying memory hasn't faded past
// the point of being genuinely forgotten. Called any time a relationship with
// the target shifts, not just on the event that created the goal.
function reassessGoals(witness, targetId, tick) {
  if (!targetId || !witness.mind.relationships[targetId]) return;
  const rel = relOf(witness, targetId);

  const goal = witness.mind.goals.current.find(g => g.type === 'SeekRestitution' && g.target === targetId);
  if (goal) {
    if (rel.grievance < 0.15) {
      closeGoalSettled(witness, 'SeekRestitution', targetId, tick, 'the debt is settled');
    } else if (rel.affection > 0.6) {
      goDormant(witness, goal, tick, 'affection', 'likes them too much now to bother');
    } else if (rel.fear > 0.6 && witness.mind.personality.boldness < 0.5) {
      goDormant(witness, goal, tick, 'fear', 'too scared of them to pursue it');
    }
  }

  const dormant = witness.mind.goals.future.find(g => g.type === 'SeekRestitution' && g.target === targetId);
  if (dormant) {
    const stillRemembered = !dormant.sourceEventId || memoryStrengthForEvent(witness, dormant.sourceEventId, tick) > 0.1;
    if (!stillRemembered) {
      // Genuinely forgotten — no decision was made, so nothing goes in the log.
      witness.mind.goals.future = witness.mind.goals.future.filter(g => g !== dormant);
    } else if (rel.grievance > 0.15) {
      const reversed = (dormant.reason === 'affection' && rel.affection < 0.3) || (dormant.reason === 'fear' && rel.fear < 0.25);
      if (reversed) resurfaceGoal(witness, dormant, tick);
    }
  }
}

// ── Perception → belief formation ────────────────────────────

function perceiveEvent(world, witnessId, event) {
  const witness = getAgent(world, witnessId);
  if (witness.isPlayer) return; // player forms their own beliefs implicitly via the UI/event log

  const appraisal = appraiseEvent(world, witness, event);
  addMemory(witness, event.id, event.tick, clamp(Math.abs(appraisal.impact), 0.1, 1));

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

  // Standing rapport as it was walking in, before this event's own fallout
  // colors it — deciding whether to hear someone out should draw on who they
  // already were to you, not damage from the very incident you're reacting to.
  const priorRelationship = { ...relOf(witness, event.actor) };

  applyAppraisal(world, witness, event, appraisal);

  if (event.verb === 'Tell' && event.data.targetId === witnessId) {
    const trust = relOf(witness, event.actor).trust;
    // GeneralizedTrust is deliberately a different lever than relationship trust
    // above — general credulity toward testimony, not standing toward this
    // specific person.
    const credulity = getWorldviewWeight(witness, 'GeneralizedTrust');
    applyClaimBelief(world, witness, event.actor, event.data.claim, clamp(0.4 + trust * 0.5 + credulity * 0.15, 0, 1), `told:${event.actor}`, event.tick, event.id);
  } else if (event.verb === 'Tell') {
    // overheard secondhand — weaker confidence than being told directly
    const trust = relOf(witness, event.actor).trust;
    const credulity = getWorldviewWeight(witness, 'GeneralizedTrust');
    applyClaimBelief(world, witness, event.actor, event.data.claim, clamp(0.2 + trust * 0.3 + credulity * 0.1, 0, 1), `overheard:${event.actor}`, event.tick, event.id);
  }

  if (!witness.mind.reactedEventIds.has(event.id) && reactionDepth < MAX_REACTION_DEPTH) {
    witness.mind.reactedEventIds.add(event.id);
    reactionDepth++;
    try {
      decideAndAct(world, witness, event, appraisal, priorRelationship);
    } finally {
      reactionDepth--;
    }
  }
}

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

function applyAppraisal(world, witness, event, appraisal) {
  const { impact } = appraisal;
  if (impact === 0) return;
  const rel = relOf(witness, event.actor);

  rel.trust = clamp(rel.trust + impact * 0.3, 0, 1);
  rel.affection = clamp(rel.affection + impact * 0.25, -1, 1);

  if (impact < 0) {
    rel.grievance = clamp(rel.grievance - impact * 0.4, 0, 5);
    if (event.verb === 'Attack') {
      rel.fear = clamp(rel.fear - impact * 0.3 * (0.5 + witness.mind.personality.neuroticism * 0.5), 0, 1);
      pushEmotion(witness, 'Fear', event.actor, -impact * 0.8, event.tick);
    }
    // Matches the Fear scaling two lines up — a more neurotic witness feels the same
    // event more intensely, not just more fearfully.
    const reactivity = 0.7 + witness.mind.personality.neuroticism * 0.6;
    pushEmotion(witness, appraisal.isVictim ? 'Anger' : 'Indignation', event.actor, -impact * reactivity, event.tick);
    if (appraisal.isVictim) upsertGoal(witness, 'SeekRestitution', event.actor, -impact, event.tick, 'current', { sourceEventId: event.id });
  } else {
    // A kind act is still a kind act at face value (trust/affection rise above already
    // reflect that) — but whether it settles the score is gated by how forgiving this
    // person is (Agreeableness) and how much they expected in return (Wealth value).
    const wealthWeight = getValueWeight(witness, 'Wealth');
    const enoughFactor = clamp(1 - wealthWeight * 0.6, 0.25, 1.4);
    const forgiveness = clamp(0.3 + witness.mind.personality.agreeableness * 0.7, 0.1, 1);
    rel.grievance = clamp(rel.grievance - impact * enoughFactor * forgiveness * 0.5, 0, 5);
    if (appraisal.isVictim) pushEmotion(witness, 'Gratitude', event.actor, impact, event.tick);
  }

  reassessGoals(witness, event.actor, event.tick);
}

// An agent has privileged, always-certain ground truth about two things: what
// they themselves did, and what was done to them directly — not omniscience
// about the wider world, just self-knowledge nobody needs telepathy for.
// "Mara is dead" is refutable by Mara simply because she's alive to hear it,
// or by anyone standing right next to her seeing she plainly isn't. "Ives
// stole from Mara" is refutable by either of them if the event ledger holds
// no such event — they were the ones who'd know.
function checkContradiction(world, witness, claim) {
  const subjectAgent = world.agents[claim.subject];

  if (claim.predicate === 'is_dead') {
    if (!subjectAgent) return { contradicted: false, selfPerpetratedMisattribution: false };
    const contradicted = claim.subject === witness.id
      ? subjectAgent.alive
      : subjectAgent.alive && coLocated(world, witness.id, claim.subject);
    return { contradicted, selfPerpetratedMisattribution: false };
  }

  if (claim.predicate === 'stole_from' || claim.predicate === 'attacked') {
    const namedInClaim = witness.id === claim.subject || witness.id === claim.victim;

    // I don't need a recorded "witnessed" belief to know what I did with my
    // own hands, and I don't need to be the one the claim *names* to know
    // it's wrong about who did this — actors never get a witnessed belief
    // about their own actions (they're excluded from computeWitnesses), so
    // without this check, someone could be told a fabricated story about
    // their own crime and have no ground to catch it on.
    const iDidThisToTheNamedVictim = world.events.some(ev =>
      ev.actor === witness.id && ev.data && ev.data.targetId === claim.victim &&
      ((claim.predicate === 'stole_from' && ev.verb === 'Take' && ev.data.consented === false) ||
       (claim.predicate === 'attacked' && ev.verb === 'Attack'))
    );

    if (namedInClaim || iDidThisToTheNamedVictim) {
      const actuallyHappened = world.events.some(ev =>
        ev.actor === claim.subject && ev.data && ev.data.targetId === claim.victim &&
        ((claim.predicate === 'stole_from' && ev.verb === 'Take' && ev.data.consented === false) ||
         (claim.predicate === 'attacked' && ev.verb === 'Attack'))
      );
      // Being falsely named yourself and having someone else take the blame
      // for what you actually did are different kinds of catch — the first is
      // a lie told about you, the second is a lie that happens to protect you.
      // applyClaimBelief routes them to different reactions.
      const selfPerpetratedMisattribution = iDidThisToTheNamedVictim && !namedInClaim && !actuallyHappened;
      return { contradicted: !actuallyHappened, selfPerpetratedMisattribution };
    }

    // Bystander ground truth: not omniscience about the world, just not needing
    // secondhand corroboration for something you personally watched happen.
    // If I hold a witnessed (not hearsay) record of who really did this to this
    // victim, a claim naming someone else is one I can refute myself.
    const eventVerb = claim.predicate === 'stole_from' ? 'did:Take' : 'did:Attack';
    const eyewitnessed = witness.mind.beliefs.find(b =>
      b.predicate === eventVerb && b.source === 'witnessed' && b.data && b.data.targetId === claim.victim &&
      (claim.predicate !== 'stole_from' || b.data.consented === false)
    );
    return { contradicted: !!eyewitnessed && eyewitnessed.subject !== claim.subject, selfPerpetratedMisattribution: false };
  }

  return { contradicted: false, selfPerpetratedMisattribution: false }; // opinions (is_trustworthy/is_dangerous) aren't the kind of thing ground truth settles
}

// Being caught in a lie doesn't damage trust in whoever the lie was about —
// it damages trust in whoever told it. How much depends on how much this
// person values Honesty in the first place.
function reactToBeingLiedTo(witness, tellerId, claim, tick) {
  if (tellerId === witness.id) return;
  const honestyWeight = getValueWeight(witness, 'Honesty');
  const severity = clamp(0.5 + honestyWeight * 0.4, 0.15, 0.95);

  // How much of that severity actually lands is gated by temperament — the same
  // forgiveness lever a kind act gets credited against in applyAppraisal. An
  // agreeable person can genuinely let a caught lie go; this isn't a second,
  // invented concept, just the existing one applied here too. Forgiveness damps
  // the hit, it doesn't erase it — even the most forgiving witness still notices.
  const forgiveness = clamp(0.3 + witness.mind.personality.agreeableness * 0.7, 0.1, 1);
  const landedSeverity = severity * (1 - forgiveness * 0.6);

  const rel = relOf(witness, tellerId);
  rel.trust = clamp(rel.trust - 0.4 * landedSeverity, 0, 1);
  rel.affection = clamp(rel.affection - 0.3 * landedSeverity, -1, 1);
  rel.grievance = clamp(rel.grievance + 0.6 * landedSeverity, 0, 5);
  if (landedSeverity > 0.15) pushEmotion(witness, 'Indignation', tellerId, landedSeverity, tick);
  reassessGoals(witness, tellerId, tick);
}

// Someone else got blamed for something I actually did. That lie didn't wrong
// me — it protected me — so the generic caught-in-a-lie reaction doesn't fit;
// how I feel about it traces back to why I acted in the first place, not to
// Honesty. Someone chasing Status wanted to be seen doing it and is denied
// the credit, so they get the standard lie reaction after all. An impulsive
// person (low Conscientiousness) is relieved it didn't land on them. Anyone
// else mostly just notices the substitution without much feeling attached.
function reactToBeingMisattributed(witness, tellerId, claim, tick, eventId) {
  const wantedCredit = getValueWeight(witness, 'Status') > 0.3;
  if (wantedCredit) {
    reactToBeingLiedTo(witness, tellerId, claim, tick);
    return;
  }

  const trigger = `ev#${eventId} misattributed ${claim.predicate}:${claim.subject}->${claim.victim}`;

  if (witness.mind.personality.conscientiousness < 0.5) {
    const rel = relOf(witness, tellerId);
    rel.trust = clamp(rel.trust + 0.1, 0, 1);
    rel.affection = clamp(rel.affection + 0.08, -1, 1);
    pushEmotion(witness, 'Relief', tellerId, 0.25, tick);
    reassessGoals(witness, tellerId, tick);
    witness.mind.log.push({ tick, trigger, considered: [], chose: `relieved ${tellerId} named ${claim.subject} instead` });
    return;
  }

  witness.mind.log.push({ tick, trigger, considered: [], chose: `wonders why ${tellerId} named ${claim.subject} instead of them` });
}

// Two accusations are competing explanations of the same incident either when
// they name different culprits for the same victim ("who really robbed
// Mara?") or when they accuse each other in the same pair ("who attacked
// whom?"). Neither side has to be flatly false the way checkContradiction
// catches — nobody here may have ground truth. What should happen instead is
// weighing: corroboration (how many people are telling which story, and how
// much you trust them) shifts belief toward one side and doubt onto the
// other, rather than the two stories sitting side by side unresolved.
function findConflictingBeliefs(witness, claim) {
  if (claim.predicate !== 'stole_from' && claim.predicate !== 'attacked') return [];
  return witness.mind.beliefs.filter(b => {
    if (b.predicate !== claim.predicate || b.confidence <= 0.2) return false;
    const mutualAccusation = b.data.subject === claim.victim && b.data.victim === claim.subject;
    const rivalSuspect = b.data.victim === claim.victim && b.data.subject !== claim.subject;
    return mutualAccusation || rivalSuspect;
  });
}

function applyClaimBelief(world, witness, tellerId, claim, confidence, source, tick, eventId) {
  const { contradicted, selfPerpetratedMisattribution } = checkContradiction(world, witness, claim);
  let effectiveConfidence = contradicted ? 0 : confidence;
  let contested = false;

  if (!contradicted) {
    const conflicts = findConflictingBeliefs(witness, claim);
    if (conflicts.length) {
      contested = true;
      const existingSupport = Math.max(...conflicts.map(c => c.confidence));
      // A true victim's first report of what happened to them isn't suspicious
      // just because they're naming themselves as victim. What IS suspicious:
      // someone already accused of X turning around and claiming the accuser
      // actually did X to them — a denial that conveniently reverses an
      // existing charge against the teller specifically.
      const isDenialOfOwnAccusation = conflicts.some(c => c.data.subject === tellerId && c.data.victim === claim.subject);
      const selfServing = isDenialOfOwnAccusation ? 0.6 : 1.0;
      const newSupport = confidence * selfServing;

      if (newSupport > existingSupport) {
        conflicts.forEach(c => { c.confidence = clamp(c.confidence * 0.35, 0, 1); c.contested = true; });
        effectiveConfidence = clamp(newSupport, 0, 0.85); // a contested claim never lands at full certainty
      } else {
        conflicts.forEach(c => { c.confidence = clamp(c.confidence * 0.9, 0, 1); c.contested = true; }); // a small doubt tax even for the side still ahead
        effectiveConfidence = clamp(newSupport * 0.3, 0, 1);
      }
    }
  }

  if (!contradicted && claim.predicate === 'provoked') {
    // A person who needs the world to be fair is more receptive to being
    // handed a reason wrongdoing happened — it fits the belief better than an
    // unprovoked, arbitrary act would. Someone who doesn't expect life to hand
    // out clean explanations is correspondingly more skeptical of one. Openness
    // is a second, independent lever on the same claim — receptiveness to an
    // unconventional explanation, not fairness-motivated reasoning; centered on
    // the 0.5 personality default so an average-openness witness gets no boost
    // either way.
    const justWorldWeight = getWorldviewWeight(witness, 'JustWorld');
    const opennessLean = witness.mind.personality.openness - 0.5;
    effectiveConfidence = clamp(effectiveConfidence + justWorldWeight * 0.15 + opennessLean * 0.2, 0, 1);
  }

  if (!contradicted && (claim.predicate === 'stole_from' || claim.predicate === 'attacked')) {
    // Loyalty makes it harder to credit wrongdoing about someone the witness is
    // already close to — not because any new evidence changed, but because the
    // accusation cuts against a bond they aren't eager to believe broken. Only
    // engages when there's an existing relationship worth being loyal to; Loyalty
    // alone, toward a stranger, has nothing to discount.
    const loyaltyWeight = getValueWeight(witness, 'Loyalty');
    const accusedAffection = relOf(witness, claim.subject).affection;
    if (loyaltyWeight > 0 && accusedAffection > 0.3) {
      effectiveConfidence = clamp(effectiveConfidence - loyaltyWeight * accusedAffection * 0.3, 0, 1);
    }
  }

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

  if (contradicted) {
    if (selfPerpetratedMisattribution) {
      reactToBeingMisattributed(witness, tellerId, claim, tick, eventId);
    } else {
      reactToBeingLiedTo(witness, tellerId, claim, tick);
    }
    return;
  }

  if (effectiveConfidence < 0.35) return; // too little support to act on it either way
  if (claim.subject === witness.id) return; // hearing unverifiable opinion about yourself doesn't need a relationship-with-self

  // Corroboration should matter for someone who didn't see it happen — it
  // shouldn't matter again, the same way, for someone who did. Without this
  // guard, every bystander who independently repeats an already-witnessed
  // fact back to the culprit re-damages the original witness's relationship a
  // second time for information they already hold at full, first-hand
  // confidence — a headcount effect, not anything to do with who the witness
  // is. But being reminded isn't nothing: it keeps the memory (and the mood it
  // caused) from fading the way it otherwise would have — the same decay
  // clock `memoryStrength()` already governs, and the same one dormant
  // `SeekRestitution` goals already check before resurfacing. A grudge that
  // keeps getting brought up stays sharper, longer, than one nobody mentions
  // again — without the hard trust/affection/grievance numbers moving twice
  // for one incident.
  //
  // Checked against the event ledger (ground truth), not the witness's own
  // belief array — reaction cascades recurse depth-first, so a bystander's
  // immediate reaction can reach the actual victim as an "overhearer" before
  // the victim's own turn in the outer witness loop has recorded their
  // first-hand belief yet. Self-knowledge doesn't depend on when your own
  // belief got written down; it depends on whether it happened to you.
  const matchedEvent = (claim.predicate === 'stole_from' || claim.predicate === 'attacked') &&
    world.events.find(ev =>
      ev.actor === claim.subject && ev.data && ev.data.targetId === claim.victim &&
      ((claim.predicate === 'stole_from' && ev.verb === 'Take' && ev.data.consented === false) ||
       (claim.predicate === 'attacked' && ev.verb === 'Attack'))
    );
  const alreadyKnownFirsthand = matchedEvent && (
    claim.victim === witness.id ||
    witness.mind.beliefs.some(b => b.source === 'witnessed' && b.eventId === matchedEvent.id)
  );

  if (alreadyKnownFirsthand) {
    const mem = witness.mind.memories.find(m => m.eventId === matchedEvent.id);
    if (mem) mem.tick = tick;
    const reactivity = 0.7 + witness.mind.personality.neuroticism * 0.6;
    pushEmotion(witness, claim.victim === witness.id ? 'Anger' : 'Indignation', claim.subject, 0.3 * reactivity, tick);
    return;
  }

  if (claim.predicate === 'stole_from' || claim.predicate === 'attacked') {
    const rel = relOf(witness, claim.subject);
    rel.trust = clamp(rel.trust - 0.25 * effectiveConfidence, 0, 1);
    rel.affection = clamp(rel.affection - 0.2 * effectiveConfidence, -1, 1);
    const caresAboutVictim = claim.victim === witness.id ? true : (claim.victim && relOf(witness, claim.victim).affection > 0);
    rel.grievance = clamp(rel.grievance + (caresAboutVictim ? 0.5 : 0.15) * effectiveConfidence, 0, 5);
  } else if (claim.predicate === 'is_trustworthy') {
    const rel = relOf(witness, claim.subject);
    rel.trust = clamp(rel.trust + 0.2 * confidence, 0, 1);
    rel.affection = clamp(rel.affection + 0.1 * confidence, -1, 1); // hearing someone vouched for warms you to them a little, not just trusts them
  } else if (claim.predicate === 'is_dangerous') {
    const rel = relOf(witness, claim.subject);
    rel.fear = clamp(rel.fear + 0.3 * confidence, 0, 1);
  } else if (claim.predicate === 'provoked') {
    // Unlike stole_from/attacked, "why" isn't a fact the event ledger can
    // confirm or deny — there's no ground truth to check this against, only
    // how much the witness trusts whoever's making the case. Believing it
    // doesn't just smear the alleged provoker; it excuses some of what the
    // witness already held the other party responsible for.
    const provokerRel = relOf(witness, claim.subject);
    provokerRel.trust = clamp(provokerRel.trust - 0.15 * confidence, 0, 1);
    provokerRel.affection = clamp(provokerRel.affection - 0.15 * confidence, -1, 1);
    provokerRel.grievance = clamp(provokerRel.grievance + 0.3 * confidence, 0, 5);

    if (claim.victim && claim.victim !== witness.id) {
      const excusedRel = relOf(witness, claim.victim);
      excusedRel.grievance = clamp(excusedRel.grievance - 0.4 * confidence, 0, 5);
      excusedRel.affection = clamp(excusedRel.affection + 0.15 * confidence, -1, 1);
      reassessGoals(witness, claim.victim, tick);
    }
  }

  reassessGoals(witness, claim.subject, tick);
}

function believesDead(agent, id) {
  return agent.mind.beliefs.some(b => b.predicate === 'is_dead' && b.subject === id && b.confidence > 0.4);
}

// ── Decide + Act: a small generic utility AI over the same 5 verbs ──

// Picks the handful of named psychological levers (trait/value/worldview/
// relationship/emotion) that actually drove a candidate's score, for display
// only — never read back into scoring. Filters out near-zero and purely
// situational terms (how bad the event itself was, which every candidate
// shares and which says nothing about who this particular witness is), sorts
// by how much each one moved the total, and keeps the top few.
function explainTerms(terms) {
  if (!terms) return '';
  return Object.entries(terms)
    .filter(([, v]) => Math.abs(v) > 0.015)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .slice(0, 3)
    .map(([label]) => label)
    .join(' + ');
}

// Pure, side-effect-free candidate scorer extracted from decideAndAct (D-01).
// Reads world/witness/event/appraisal/priorRelationship and returns
// { reacts, candidates } — it never pushes to witness.mind.log and never
// draws from world.rng (the gossip candidate's two draws live inside its own
// resolve() hook, invoked only by decideAndAct's real dispatch, never here).
// This is what lets Plan 02-03's ordering pre-pass call this twice per
// reacting witness (once to rank witnesses, once again inside decideAndAct's
// real dispatch) without corrupting the mind inspector or double-consuming
// the RNG stream. Modeled on appraiseEvent (sim.js:558) — the one other
// pure scorer/classifier in this file, called ahead of the mutating work it
// informs.
//
// One documented exception to "no side effects": relOf lazily *creates* a
// default relationship entry on first read (sim.js:91-104). This is
// acceptable here because scoreCandidates only ever touches the agent pairs
// decideAndAct already touched at the same tick, and the created defaults
// are a deterministic function of the witness's DangerousWorld worldview
// weight, not of when they were created — so creating them earlier changes
// no value anywhere.
function scoreCandidates(world, witness, event, appraisal, priorRelationship) {
  const { boldness, extraversion, agreeableness, conscientiousness } = witness.mind.personality;

  // "Do nothing" is a real, personality-scored outcome, not a filler placeholder —
  // a timid, introverted, easygoing witness can genuinely out-score every active
  // response. Without this, silence was never actually reachable no matter how
  // unbold or unsociable the witness was. Scored as a deviation from the 0.5
  // personality default, not the raw trait value — an average-boldness,
  // average-extraversion witness should reproduce the old flat baseline almost
  // exactly, so this only meaningfully kicks in for a witness who's genuinely
  // more timid/introverted (or bold/outgoing) than typical, rather than quietly
  // inflating "do nothing" for most of the cast most of the time.
  const doNothingTerms = {
    boldness: (0.5 - boldness) * 0.4,
    extraversion: (0.5 - extraversion) * 0.25,
    agreeableness: (agreeableness - 0.5) * 0.15,
  };
  const doNothingScore = clamp(0.15 + doNothingTerms.boldness + doNothingTerms.extraversion + doNothingTerms.agreeableness, 0.05, 0.65);

  // The negation of decideAndAct's old early-return condition — whether this
  // witness builds a real candidate list at all. When false, candidates stays
  // a single-entry array (do nothing only) so urgency (D-02: a witness's top
  // candidate score) is well-defined for every witness, including ones who'd
  // never have reached line 949 in the pre-extraction code.
  const reacts = appraisal.impact < -0.05;
  if (!reacts) {
    // Return immediately — do not fall through into relOf/pickConfidant/
    // agentsAt/activeEmotionIntensity, so a non-reacting witness costs four
    // personality reads and nothing else.
    return { reacts, candidates: [{ action: null, label: 'do nothing', score: doNothingScore, terms: doNothingTerms }] };
  }

  const actorId = event.actor;
  const rel = relOf(witness, actorId);
  const anger = activeEmotionIntensity(witness, appraisal.isVictim ? 'Anger' : 'Indignation', actorId, event.tick);
  const candidates = [];

  candidates.push({ action: null, label: 'do nothing', score: doNothingScore, terms: doNothingTerms });

  // Use standing rapport (as it was before this event) for the social
  // judgment calls — whether to hear someone out or go gossip about them —
  // but the live, freshly-elevated fear/anger for how scared or provoked the
  // witness is right now. Different questions, different timescales.
  const priorTrust = clamp((priorRelationship || rel).trust, 0, 1);
  const priorAffection = clamp((priorRelationship || rel).affection, 0, 1); // only the positive side counts toward wanting to hear someone out

  if (coLocated(world, witness.id, actorId)) {
    // Seeing the world as a ruthless competition (CompetitiveJungle) makes
    // resolving a dispute through dominance read as more natural, not a last resort.
    // A temperamentally agreeable person resists reaching for violence even while
    // angry (agreeableness), not just when scared (fear/boldness above). Honor only
    // sharpens the pull to confront when the witness is themself the victim — punishing
    // a wrong done to someone else is Justice's job upstream in appraiseEvent, not
    // Honor's. Status adds a face-saving push, but only when someone else is around
    // to see the confrontation happen — there's no face to save alone.
    const othersWatching = agentsAt(world, witness.location, witness.id).length > 1;
    const confrontTerms = {
      boldness: (-appraisal.impact) * 0.5 * boldness,
      fear: -rel.fear * (1 - boldness),
      anger: anger * 0.15,
      CompetitiveJungle: getWorldviewWeight(witness, 'CompetitiveJungle') * 0.2,
      agreeableness: -(agreeableness - 0.5) * 0.3,
      Honor: appraisal.isVictim ? getValueWeight(witness, 'Honor') * 0.2 : 0,
      Status: othersWatching ? getValueWeight(witness, 'Status') * 0.15 : 0,
    };
    const confrontScore = Object.values(confrontTerms).reduce((a, b) => a + b, 0);
    candidates.push({
      action: (why) => performAction(world, witness.id, 'Attack', { targetId: actorId }, { causedBy: event.id, why }),
      label: `attack ${actorId}`,
      score: confrontScore,
      terms: confrontTerms,
    });

    // Someone I actually like and trust, I'd rather ask what happened than
    // escalate to violence or go tell someone else behind their back. This is
    // always the truth as the witness saw it — there's no reason to lie to
    // the person you're asking directly. Curiosity can open this door even
    // without existing affection — wanting to know why doesn't require liking
    // someone — and a conscientious witness leans toward getting the facts
    // straight before reacting further.
    const curiosityWeight = getValueWeight(witness, 'Curiosity');
    if (priorAffection > 0.2 || curiosityWeight > 0.3) {
      const predicate = event.verb === 'Attack' ? 'attacked' : 'stole_from';
      const claim = { predicate, subject: actorId, victim: event.data.targetId, item: event.data.item };
      const pressTerms = {
        affection: (-appraisal.impact) * 0.4 * Math.max(priorAffection, 0.15),
        trust: priorTrust * 0.2,
        conscientiousness: conscientiousness * 0.15,
        Curiosity: curiosityWeight * 0.15,
      };
      candidates.push({
        action: (why) => performAction(world, witness.id, 'Tell', { targetId: actorId, claim }, { causedBy: event.id, why }),
        label: `press ${actorId} for an explanation`,
        score: Object.values(pressTerms).reduce((a, b) => a + b, 0),
        terms: pressTerms,
      });
    }
  }

  const confidant = pickConfidant(world, witness, actorId, event.data.targetId);
  if (confidant && !believesDead(witness, confidant)) {
    const honestyWeight = getValueWeight(witness, 'Honesty');
    const predicate = event.verb === 'Attack' ? 'attacked' : 'stole_from';
    const generalCare = generalCareOf(witness);
    // Liking the actor makes you less eager to go gossip about them behind their
    // back. Going and finding someone to talk to is itself a social act — an
    // introvert is less drawn to it regardless of how they feel about the actor —
    // and someone who values Autonomy would rather handle it themselves than pull
    // a third party in. The impact-scaled base term isn't attributed to a named
    // lever below — it's how bad the event was, the same for every witness.
    const gossipTerms = {
      generalCare: generalCare * 0.2,
      affection: -priorAffection * 0.3,
      extraversion: -(0.5 - extraversion) * 0.3,
      Autonomy: -getValueWeight(witness, 'Autonomy') * 0.15,
    };
    const gossipScore = (-appraisal.impact) * 0.5 + Object.values(gossipTerms).reduce((a, b) => a + b, 0);
    candidates.push({
      // resolve() defers the honesty-flip and scapegoat-pick RNG rolls until this
      // candidate is actually the winner, instead of drawing them for every witness
      // who merely reaches the gossip branch. This is the same lazy-evaluation idiom
      // every candidate's `action` closure already uses to defer its performAction
      // call (e.g. the attack/press/retreat closures above), extended one step to
      // cover the two draws that decide *what* is told rather than *whether* to
      // tell. It's what lets scoreCandidates() (the pure extraction this candidate-
      // building body feeds) be called twice for the same witness/event — once for
      // the ordering pre-pass, once for real dispatch — without double-consuming the
      // RNG stream. LOCKED D-05: RNG still decides only stochastic texture on an
      // already-decided action, never the decision itself — resolve() only ever
      // runs after this candidate has already won on its RNG-free score. The two
      // draws themselves live in the named resolveGossipTell() helper below
      // decideAndAct, not inlined here, so scoreCandidates()'s own source text has
      // no RNG call site of its own — see the comment on resolveGossipTell.
      resolve: () => resolveGossipTell(world, witness, event, actorId, confidant, predicate, honestyWeight),
      label: `tell ${confidant} about ${actorId}`,
      score: gossipScore,
      terms: gossipTerms,
    });
  }

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

  // D-02: a witness's urgency for ordering purposes is this top candidate's
  // score, so the returned list is ranked here rather than leaving callers
  // (Plan 02-03's ordering pre-pass included) to duplicate this sort.
  candidates.sort((a, b) => b.score - a.score);
  return { reacts, candidates };
}

// decideAndAct is now the thin consumer: score, pick, resolve, log, fire.
// All candidate-building logic lives in the pure scoreCandidates() above.
function decideAndAct(world, witness, event, appraisal, priorRelationship) {
  const { reacts, candidates } = scoreCandidates(world, witness, event, appraisal, priorRelationship);

  if (!reacts) {
    // Pushed only when appraisal.impact < 0 — a -0 impact (satisfies
    // impact >= -0.05 but fails impact < 0) still pushes nothing, matching
    // the pre-extraction behavior exactly. This log write (and the winner's
    // below) are decideAndAct's only remaining jobs beyond firing the winning
    // candidate's action — both log writes stay here, out of
    // scoreCandidates, so a witness never gets logged twice once Plan 02-03
    // calls scoreCandidates a second time for the same witness/event.
    if (appraisal.impact < 0) {
      witness.mind.log.push({
        tick: event.tick,
        trigger: `ev#${event.id} ${event.verb} by ${event.actor}`,
        considered: [`do nothing=${candidates[0].score.toFixed(2)}`],
        chose: `barely noticed — didn't care enough to react`,
        why: explainTerms(candidates[0].terms),
      });
    }
    return;
  }

  const best = candidates[0];
  const why = explainTerms(best.terms);
  // resolve() runs at most once, only on the winning candidate — see the
  // comment on the gossip candidate above for why this is safe and why it
  // matters once scoring runs twice per witness (Plan 02-03).
  const resolved = best.resolve ? best.resolve() : best;

  witness.mind.log.push({
    tick: event.tick,
    trigger: `ev#${event.id} ${event.verb} by ${event.actor}`,
    considered: candidates.map(c => `${c.label}=${c.score.toFixed(2)}`),
    chose: resolved.label,
    why,
  });

  if (resolved.action) resolved.action(why);
}

// Resolves the gossip candidate's honesty-flip and scapegoat-pick RNG rolls —
// invoked only by decideAndAct, at most once, only on the winning candidate
// (see the resolve hook built on the gossip candidate in scoreCandidates
// above). Kept as a named top-level function rather than an inline closure so
// the RNG draw below lives outside scoreCandidates()'s own source text —
// T-02-06/T-02-07's mitigation (the double-call purity harness, plus the
// re-bless path-allowlist gate) depends on that being true of the extracted
// function's body, not just its runtime behavior. Matches this file's
// convention of extracting named helpers (pickConfidant, pickScapegoat just
// below) rather than nesting anything beyond a short inline callback.
function resolveGossipTell(world, witness, event, actorId, confidant, predicate, honestyWeight) {
  const truthful = rngOf(world)() < clamp(0.5 + honestyWeight * 0.45, 0.05, 0.97);
  const subject = truthful ? actorId : pickScapegoat(world, witness, actorId, event.data.targetId);
  const claim = { predicate, subject, victim: event.data.targetId, item: event.data.item };
  return {
    label: `tell ${confidant} about ${actorId}${truthful ? '' : ' (misattributed)'}`,
    action: (why) => performAction(world, witness.id, 'Tell', { targetId: confidant, claim }, { causedBy: event.id, why }),
  };
}

function pickConfidant(world, witness, excludeId, excludeVictimId) {
  const others = agentsAt(world, 'square', witness.id).filter(a => a.id !== excludeId && a.id !== excludeVictimId && !a.isPlayer);
  if (others.length === 0) return null;
  others.sort((a, b) => relOf(witness, b.id).trust - relOf(witness, a.id).trust);
  return others[0].id;
}

function pickScapegoat(world, witness, actualActorId, victimId) {
  const others = Object.keys(world.agents).filter(id => id !== actualActorId && id !== witness.id && id !== victimId);
  if (others.length === 0) return actualActorId;

  // A convenient lie names someone you don't much care for, not someone you
  // like — weighted-random, not uniform, so a disliked or distrusted bystander
  // is a more likely target than someone the witness is fond of.
  const weights = others.map(id => {
    const rel = relOf(witness, id);
    return clamp(1.2 - rel.affection - rel.trust * 0.5, 0.1, 3);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rngOf(world)() * total;
  for (let i = 0; i < others.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return others[i];
  }
  return others[others.length - 1];
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── Regression / verification harness (Plan 01-02) ──────────────

// Derives which agents a scripted scenario actually involved, from the event
// log and each agent's own perception state — never a hardcoded count or a
// fixed pair. D-09.1, LOCKED: this generalizes past today's two-clone case to
// Phase 2's witness-ordering baseline (an attacker, a victim, and multiple
// bystanders). The one thing this function must never do is assume how many
// agents a scenario involves.
//
// Included, by union:
//   - every event.actor across world.events (who did something)
//   - every event.data.targetId across world.events, where present (who was
//     acted upon)
//   - any agent with a non-null mind that shows perception activity
//     (memories/reactedEventIds/log) even if they never acted or were
//     targeted — this is what catches a pure bystander who witnessed the
//     event and chose not to act, exactly the Phase 2 case.
// Agents that neither acted, were acted upon, nor perceived anything are
// deliberately excluded — CONTEXT.md D-09.1 explicitly permits leaving out
// state genuinely unrelated to the tested interaction.
function scenarioParticipants(world) {
  const ids = new Set();
  world.events.forEach(ev => {
    ids.add(ev.actor);
    if (ev.data && ev.data.targetId) ids.add(ev.data.targetId);
  });
  Object.values(world.agents).forEach(a => {
    if (a.mind && (a.mind.memories.length > 0 || a.mind.reactedEventIds.size > 0 || a.mind.log.length > 0)) {
      ids.add(a.id);
    }
  });
  return Array.from(ids).sort();
}

// Plain, fully JSON-round-trippable snapshot of a scenario, scoped to
// agentIds (defaulting to scenarioParticipants(world)). Does not mutate
// world. Serialization notes — get these exactly right, they are the whole
// correctness surface of the regression check:
//   - Reuses presentation.js's Set-aware JSON replacer idiom
//     (value instanceof Set -> Array.from(value)) so mind.reactedEventIds
//     survives; without it a real change there would silently diff as "no
//     change" at all.
//   - world.rng (a closure) is dropped by JSON.stringify — deliberate and
//     correct, the generator itself isn't meaningful to diff — but that's
//     only safe because world.seed and world.rngCalls are carried explicitly
//     as plain numbers below. rngCalls is what makes a change in RNG
//     consumption diagnosable as one named field instead of a wall of
//     unexplained numeric drift across every downstream value. Do not "fix"
//     this omission by trying to serialize world.rng.
//   - No `rng` key is included in the returned object at all.
function snapshotWorld(world, agentIds) {
  const ids = agentIds || scenarioParticipants(world);
  const agents = {};
  ids.forEach(id => { agents[id] = world.agents[id]; });
  const raw = {
    seed: world.seed,
    rngCalls: world.rngCalls,
    tick: world.tick,
    nextEventId: world.nextEventId,
    events: world.events,
    agents,
  };
  return JSON.parse(JSON.stringify(raw, (key, value) => (value instanceof Set ? Array.from(value) : value)));
}

function isContainer(v) { return v !== null && typeof v === 'object'; }

// Two values recurse together only when they're containers of the same
// shape (both arrays, or both plain objects) — a leaf, null, or a
// container-vs-leaf mismatch all fall through to a direct !== comparison
// instead.
function sameContainerType(a, b) { return isContainer(a) && isContainer(b) && Array.isArray(a) === Array.isArray(b); }

function containerHasKey(container, key) {
  return Array.isArray(container) ? key < container.length : Object.prototype.hasOwnProperty.call(container, key);
}

// Sorted key order for objects (deterministic traversal, D-09.3); numeric
// index range for arrays, sized to the longer of the two sides so a
// length change surfaces as addition/removal entries at the tail.
function containerKeys(a, b) {
  if (Array.isArray(a)) {
    const len = Math.max(a.length, b.length);
    const keys = [];
    for (let i = 0; i < len; i++) keys.push(i);
    return keys;
  }
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort();
}

// Walks two snapshots (or any two plain JSON-shaped values) and returns one
// { path, from, to } entry per differing leaf, path being the dot-joined key
// path from the root (array indices as numeric segments). Recurses through
// plain objects/arrays; a key present on only one side reports an
// addition/removal at that path without recursing into whichever side
// actually has a subtree there. Deterministic: sorted key order at every
// level, so the same pair of snapshots always yields the same diff array.
function diffSnapshots(before, after) {
  const diffs = [];
  (function walk(a, b, path) {
    if (sameContainerType(a, b)) {
      containerKeys(a, b).forEach(key => {
        const aHas = containerHasKey(a, key);
        const bHas = containerHasKey(b, key);
        const childPath = path === '' ? `${key}` : `${path}.${key}`;
        if (aHas && bHas) {
          walk(a[key], b[key], childPath);
        } else if (aHas) {
          diffs.push({ path: childPath, from: a[key], to: undefined });
        } else {
          diffs.push({ path: childPath, from: undefined, to: b[key] });
        }
      });
      return;
    }
    if (a !== b) diffs.push({ path, from: a, to: b });
  })(before, after, '');
  return diffs;
}

// Renders a diff array as human-readable, field-by-field lines — never
// prints, only returns (D-01: the same code backs both the Node script and
// the browser dev console, so all printing belongs to the caller). Uses the
// ASCII "->" arrow, never the Unicode arrow, so the output survives Windows
// terminal code pages.
function formatDiff(diffs) {
  if (diffs.length === 0) return 'no differences';
  const render = (v) => (v === undefined ? '(absent)' : (isContainer(v) ? JSON.stringify(v) : String(v)));
  return diffs.map(d => `  ${d.path}: ${render(d.from)} -> ${render(d.to)}`).join('\n');
}

// Shared clone definition for the two-clone CompetitiveJungle regression
// case (PERSON-MODEL.md's "Verified" claim). The positive/negative variants
// receive the identical personality and values below and differ only in the
// sign of the CompetitiveJungle worldview weight — that single-field
// difference is what clone-specs-differ-in-exactly-one-field proves, and
// what the tuning procedure (see buildCloneVariant) must never widen.
const CLONE_SPEC = {
  cloneId: 'ives',
  victimId: 'mara',
  weightMagnitude: 0.8,
  personality: {
    openness: 0.5, conscientiousness: 0.5, extraversion: 0.5,
    agreeableness: 0.5, neuroticism: 0.4, boldness: 0.6,
  },
  values: [{ value: 'Justice', weight: 0.3 }],
};

// Builds one isolated, drift-off, DEFAULT_SEED-seeded world, overwrites the
// clone's mind.personality/values/worldview from CLONE_SPEC (worldview
// weight signed by `sign`), relocates every other NPC to 'away' so the
// witness set is minimal, then has the player Attack the victim. Returns
// the built world and the id of that Attack event — the event both clones
// are judged on.
//
// Deliberately builds two *separate* worlds rather than putting both clones
// in one — in a single world the victim reacts first (agent-list order puts
// mara ahead of ives in computeWitnesses) and her reaction cascade would be
// witnessed by both clones before either perceives the original event,
// making the qualitative assertion depend on witness ordering, which Phase 2
// (ORDER-01) is specifically going to change. Two isolated worlds running
// the identical script under the identical seed is the controlled A/B
// PERSON-MODEL.md:140-143 actually describes, and it is
// ordering-independent by construction.
function buildCloneVariant(sign) {
  const world = createWorld();
  world.driftEnabled = false;
  seedRng(world);

  const clone = world.agents[CLONE_SPEC.cloneId];
  clone.mind.personality = { ...CLONE_SPEC.personality };
  clone.mind.values = CLONE_SPEC.values.map(v => ({ ...v }));
  clone.mind.worldview = [{ belief: 'CompetitiveJungle', weight: sign * CLONE_SPEC.weightMagnitude }];

  Object.values(world.agents).forEach(a => {
    if (a.id !== 'player' && a.id !== CLONE_SPEC.cloneId && a.id !== CLONE_SPEC.victimId) a.location = 'away';
  });

  const result = performAction(world, 'player', 'Attack', { targetId: CLONE_SPEC.victimId });
  return { world, eventId: result.event.id };
}

// Reproduces PERSON-MODEL.md's two-clone CompetitiveJungle case as a
// repeatable, seeded, drift-off check: two isolated worlds whose clones
// differ in exactly one worldview weight, judged on the identical
// player-Attack-victim event. Returns a structured result, never prints,
// never throws on a failed check (a failure is a `false` in the returned
// object, per the result-object idiom) — sim.js has zero I/O anywhere, and
// this function is no exception. When opts.baseline is supplied (Plan 03
// loads it from disk), additionally diffs the live snapshots against it.
function runRegressionCheck(opts = {}) {
  const jungle = buildCloneVariant(1);
  const averse = buildCloneVariant(-1);
  const cloneA = jungle.world.agents[CLONE_SPEC.cloneId];
  const cloneB = averse.world.agents[CLONE_SPEC.cloneId];

  const checks = [];

  // Never escalatable: a failure here is a defect in this fixture, not a
  // finding about the engine.
  const personalityEqual = JSON.stringify(cloneA.mind.personality) === JSON.stringify(cloneB.mind.personality);
  const valuesEqual = JSON.stringify(cloneA.mind.values) === JSON.stringify(cloneB.mind.values);
  const worldviewOnlySignDiffers = cloneA.mind.worldview.length === 1 && cloneB.mind.worldview.length === 1
    && cloneA.mind.worldview[0].belief === 'CompetitiveJungle' && cloneB.mind.worldview[0].belief === 'CompetitiveJungle'
    && cloneA.mind.worldview[0].weight === CLONE_SPEC.weightMagnitude && cloneB.mind.worldview[0].weight === -CLONE_SPEC.weightMagnitude;
  const specsDifferInOnlyOneField = personalityEqual && valuesEqual && worldviewOnlySignDiffers;
  checks.push({
    name: 'clone-specs-differ-in-exactly-one-field',
    pass: specsDifferInOnlyOneField,
    detail: specsDifferInOnlyOneField
      ? `personality and values are identical between clones; worldview differs only in the CompetitiveJungle weight sign (+${CLONE_SPEC.weightMagnitude} vs -${CLONE_SPEC.weightMagnitude})`
      : `clone variants differ in more than the CompetitiveJungle weight: personalityEqual=${personalityEqual} valuesEqual=${valuesEqual} worldviewOnlySignDiffers=${worldviewOnlySignDiffers}`,
  });

  // Never escalatable: drift is set off in both worlds by this function itself.
  const driftOff = isDriftEnabled(jungle.world) === false && isDriftEnabled(averse.world) === false;
  checks.push({
    name: 'drift-disabled',
    pass: driftOff,
    detail: `jungle isDriftEnabled=${isDriftEnabled(jungle.world)}, averse isDriftEnabled=${isDriftEnabled(averse.world)}`,
  });

  // Behavioral claim 1/3 — scoped by causedBy, not "any Attack by the clone".
  const positiveAttackEvent = jungle.world.events.find(ev =>
    ev.verb === 'Attack' && ev.actor === CLONE_SPEC.cloneId && ev.data && ev.data.targetId === 'player' && ev.causedBy === jungle.eventId
  );
  checks.push({
    name: 'positive-clone-attacks-player',
    pass: !!positiveAttackEvent,
    detail: positiveAttackEvent
      ? `${CLONE_SPEC.cloneId} attacked player as event #${positiveAttackEvent.id}, caused by #${jungle.eventId}`
      : `no Attack event by ${CLONE_SPEC.cloneId} against player caused by #${jungle.eventId} was found`,
  });

  // Behavioral claim 2/3 — scoped by causedBy (symmetric with the check
  // above), not "no event by the clone at all": the victim can react first
  // and the clone perceiving her reaction is unrelated to the variable under
  // test. `do nothing` and the impact-too-small early return (which pushes
  // no event either way) both satisfy this.
  const negativeReactionEvent = averse.world.events.find(ev => ev.actor === CLONE_SPEC.cloneId && ev.causedBy === averse.eventId);
  checks.push({
    name: 'negative-clone-takes-no-action',
    pass: !negativeReactionEvent,
    detail: negativeReactionEvent
      ? `${CLONE_SPEC.cloneId} still acted: event #${negativeReactionEvent.id} (${negativeReactionEvent.verb}) caused by #${averse.eventId}`
      : `${CLONE_SPEC.cloneId} took no action in response to event #${averse.eventId}`,
  });

  // Behavioral claim 3/3 — carries both verbatim `chose` labels in `detail`.
  // A clone with no matching mind.log entry (the impact-too-small early
  // return pushes none) is not a check-implementation error — its `chose`
  // is treated as the literal string '(no entry)' and compared normally.
  const positiveTrigger = `ev#${jungle.eventId} Attack by player`;
  const negativeTrigger = `ev#${averse.eventId} Attack by player`;
  const positiveLogEntry = cloneA.mind.log.find(e => e.trigger === positiveTrigger);
  const negativeLogEntry = cloneB.mind.log.find(e => e.trigger === negativeTrigger);
  const positiveChose = positiveLogEntry ? positiveLogEntry.chose : '(no entry)';
  const negativeChose = negativeLogEntry ? negativeLogEntry.chose : '(no entry)';
  const diverge = positiveChose !== negativeChose;
  checks.push({
    name: 'reactions-diverge',
    pass: diverge,
    detail: `positive clone chose "${positiveChose}"; negative clone chose "${negativeChose}"`,
  });

  const snapshots = {
    jungle: snapshotWorld(jungle.world),
    averse: snapshotWorld(averse.world),
  };

  const result = { pass: checks.every(c => c.pass), checks, snapshots };

  if (opts.baseline) {
    const diffs = [];
    ['jungle', 'averse'].forEach(name => {
      diffSnapshots(opts.baseline[name], snapshots[name]).forEach(d => {
        diffs.push({ path: `${name}.${d.path}`, from: d.from, to: d.to });
      });
    });
    const baselineMatches = diffs.length === 0;
    checks.push({
      name: 'snapshot-matches-baseline',
      pass: baselineMatches,
      detail: baselineMatches ? 'live snapshots match the supplied baseline exactly' : `${diffs.length} field(s) differ from the supplied baseline`,
    });
    result.diffs = diffs;
    result.pass = result.pass && baselineMatches;
  }

  return result;
}

// ── Witness ordering scenario (ORDER-01/ORDER-02) ───────────────
//
// The scripted five-witness scenario the whole phase is judged on. Unlike
// CLONE_SPEC (two isolated worlds, minimal witness sets), this scenario keeps
// all six agents in 'square' on purpose — a five-witness set with genuinely
// different top-candidate scores is the entire point: it's what lets a later
// plan prove urgency-based dispatch actually reorders reactions relative to
// plain agent-list order, not just that it runs without error.
const ORDER_SPEC = {
  attackerId: 'player',
  // Chosen because garrick is *last* in createWorld()'s insertion order, so
  // agent-list order (computeWitnesses/agentsAt) puts the victim dead last
  // while urgency order must put him first — the maximum-contrast case for
  // ORDER-01.
  victimId: 'garrick',
  // Deliberately tuned into decideAndAct's appraisal.impact >= -0.05
  // early-return bucket (see the arithmetic comment in buildOrderingScenario
  // below) — this is the witness Plan 02-03's ordering rule has to place
  // last (or omit from the ranked dispatch) without special-casing.
  indifferentId: 'ives',
  // The expected pre-fix computeWitnesses order, recorded explicitly so
  // later checks can assert the dispatch order genuinely diverges from it
  // rather than comparing against a value derived from the same code under
  // test.
  agentListOrder: ['mara', 'ives', 'tomas', 'elena', 'garrick'],
  // Appended to garrick's existing values. Honor feeds confrontTerms.Honor
  // only when appraisal.isVictim is true, so it widens the victim's
  // attack-vs-gossip margin without touching any bystander's score. Without
  // it the margin is roughly 0.04, too thin for a fixture that later phases
  // must keep passing.
  victimValue: { value: 'Honor', weight: 0.6 },
  indifferent: { agreeableness: 0.1, competitiveJungleWeight: 0.9, affectionToVictim: -0.4 },
};

// Builds one isolated, drift-off, DEFAULT_SEED-seeded world for the ORDER_SPEC
// scenario, mirroring buildCloneVariant's shape. Unlike buildCloneVariant, no
// one is relocated — all six agents stay in 'square', because a five-witness
// set is the entire point of this fixture (scenarioParticipants was built,
// D-09.1 LOCKED, precisely to generalize past the two-clone case).
function buildOrderingScenario() {
  const world = createWorld();
  world.driftEnabled = false;
  seedRng(world);

  // Writing personality/values/worldview here is fixture construction, not
  // runtime mutation: CLAUDE.md's mind-box table marks personality
  // never-mutable *during simulation*, and buildCloneVariant already
  // overrides a clone's mind.personality/values/worldview the same way — this
  // is not PERSON-MODEL.md drift.
  const victim = world.agents[ORDER_SPEC.victimId];
  victim.mind.values = [...victim.mind.values, { ...ORDER_SPEC.victimValue }];

  const indifferent = world.agents[ORDER_SPEC.indifferentId];
  indifferent.mind.personality.agreeableness = ORDER_SPEC.indifferent.agreeableness;
  const competitiveJungle = indifferent.mind.worldview.find(w => w.belief === 'CompetitiveJungle');
  competitiveJungle.weight = ORDER_SPEC.indifferent.competitiveJungleWeight;
  relOf(indifferent, ORDER_SPEC.victimId).affection = ORDER_SPEC.indifferent.affectionToVictim;

  // Why the indifferent overrides land ives in decideAndAct's early-return
  // bucket, arithmetic spelled out: generalCareOf(ives) = clamp(0.15 +
  // 0.1*0.3 + 0 - 0.9*0.25, 0, 1) evaluates to -0.045 before the clamp and
  // therefore 0 (Compassion/Community are both absent from ives's values, so
  // those terms are 0). appraiseEvent's non-victim branch multiplies impact
  // by generalCare * 0.3 (the victimAffection <= 0 path, reached because
  // affection toward the victim is -0.4), so impact becomes -0 — which
  // satisfies appraisal.impact >= -0.05 and also fails appraisal.impact < 0,
  // meaning decideAndAct returns without even pushing a mind.log entry. That
  // is the exact sub-branch Plan 02-03's ordering rule has to handle, and it
  // must be reachable by construction, not by luck.

  const result = performAction(world, ORDER_SPEC.attackerId, 'Attack', { targetId: ORDER_SPEC.victimId });
  return { world, eventId: result.event.id };
}

// Pure, JSON-round-trippable, deliberately RNG-insensitive record of what
// happened in the ordering scenario, in dispatch order. data.damage,
// data.claim, data.quantity, world.tick, and world.rngCalls are all
// deliberately excluded: those drift whenever the RNG stream shifts (Plan
// 02-02 shifts it on purpose), and ORDER-01/ORDER-02's discriminating signal
// is the reaction *sequence*, not the stochastic texture riding on top of it.
function orderingSnapshot(world, originEventId) {
  const origin = world.events.find(ev => ev.id === originEventId);
  const witnessOrder = origin.witnessOrder.slice();

  // Array order is dispatch order, so no sorting is needed or wanted.
  const keptIds = new Set([originEventId]);
  const reactions = [];
  world.events.forEach(ev => {
    if (ev.id === originEventId) return;
    if (ev.causedBy !== null && keptIds.has(ev.causedBy)) {
      keptIds.add(ev.id);
      const target = (ev.data && 'targetId' in ev.data) ? ev.data.targetId
        : (ev.data && 'to' in ev.data) ? ev.data.to
        : null;
      reactions.push({ id: ev.id, causedBy: ev.causedBy, actor: ev.actor, verb: ev.verb, target, witnessOrder: ev.witnessOrder.slice() });
    }
  });

  return { witnessOrder, reactions };
}

// Follows runRegressionCheck's contract exactly: returns a structured result,
// never prints, never throws, never touches the filesystem.
function runOrderingCheck(opts = {}) {
  const scenario = buildOrderingScenario();
  const snapshot = orderingSnapshot(scenario.world, scenario.eventId);

  const checks = [];
  const result = { pass: true, checks, snapshot };

  // ORDER-01 qualitative checks are deliberately NOT added in this plan —
  // against pre-fix dispatch they would fail by design and leave
  // `node scripts/verify.js` permanently red. Plan 02-03 adds them together
  // with the fix that makes them true.
  if (opts.baseline) {
    const diffs = diffSnapshots(opts.baseline, snapshot);
    const baselineMatches = diffs.length === 0;
    checks.push({
      name: 'order-matches-baseline',
      pass: baselineMatches,
      detail: baselineMatches ? 'live ordering snapshot matches the supplied baseline exactly' : `${diffs.length} field(s) differ from the supplied baseline`,
    });
    result.diffs = diffs;
  }

  result.pass = checks.every(c => c.pass);

  // Informational output for ORDER-02, never a pass/fail check.
  if (opts.prefix) {
    result.prefixDiffs = diffSnapshots(opts.prefix.snapshot, snapshot);
    result.prefixLabel = opts.prefix.capturedFor;
  }

  return result;
}

// ── Public API ──────────────────────────────────────────────

const Sim = {
  LOCATIONS,
  VERBS,
  VALUES,
  WORLDVIEW_BELIEFS,
  PREDICATE_LABELS,
  TUNING,
  isDriftEnabled,
  DEFAULT_SEED,
  seedRng,
  createWorld,
  performAction,
  getAgent,
  appraiseEvent,
  scoreCandidates,
  memoryStrength,
  scenarioParticipants,
  snapshotWorld,
  diffSnapshots,
  formatDiff,
  runRegressionCheck,
  buildOrderingScenario,
  orderingSnapshot,
  runOrderingCheck,
};

if (typeof window !== 'undefined') window.Sim = Sim;
if (typeof module !== 'undefined') module.exports = Sim;
