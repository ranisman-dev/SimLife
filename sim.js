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

// ── Action pipeline (player and NPCs both funnel through this) ──

let reactionDepth = 0;
const MAX_REACTION_DEPTH = 4;

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

  const witnesses = computeWitnesses(world, event);
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
      const damage = 15 + Math.floor(Math.random() * 15);
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

function decideAndAct(world, witness, event, appraisal, priorRelationship) {
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
    return;
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
    const truthful = Math.random() < clamp(0.5 + honestyWeight * 0.45, 0.05, 0.97);
    const subject = truthful ? actorId : pickScapegoat(world, witness, actorId, event.data.targetId);
    const predicate = event.verb === 'Attack' ? 'attacked' : 'stole_from';
    const claim = { predicate, subject, victim: event.data.targetId, item: event.data.item };
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
      action: (why) => performAction(world, witness.id, 'Tell', { targetId: confidant, claim }, { causedBy: event.id, why }),
      label: `tell ${confidant} about ${actorId}${truthful ? '' : ' (misattributed)'}`,
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

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const why = explainTerms(best.terms);

  witness.mind.log.push({
    tick: event.tick,
    trigger: `ev#${event.id} ${event.verb} by ${actorId}`,
    considered: candidates.map(c => `${c.label}=${c.score.toFixed(2)}`),
    chose: best.label,
    why,
  });

  if (best.action) best.action(why);
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
  let roll = Math.random() * total;
  for (let i = 0; i < others.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return others[i];
  }
  return others[others.length - 1];
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── Public API ──────────────────────────────────────────────

const Sim = {
  LOCATIONS,
  VERBS,
  VALUES,
  WORLDVIEW_BELIEFS,
  PREDICATE_LABELS,
  createWorld,
  performAction,
  getAgent,
  memoryStrength,
};

if (typeof window !== 'undefined') window.Sim = Sim;
if (typeof module !== 'undefined') module.exports = Sim;
