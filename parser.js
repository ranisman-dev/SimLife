// Tiny Town Sim — intent parser.
// Translates the player's typed sentence into an action request (verb + params)
// that flows into the exact same Sim.performAction() pipeline NPCs use.
// This is the "Player/NPC intent -> Action request" step, made literal.

function findAgentId(world, actorId, token) {
  if (!token) return null;
  const t = token.toLowerCase();
  if (t === 'me' || t === 'myself' || t === 'yourself') return actorId;
  const match = Object.values(world.agents).find(a => a.name.toLowerCase() === t || a.id === t);
  return match ? match.id : null;
}

function resolveQuantity(qtyRaw, holderId, item, world) {
  if (qtyRaw === 'all' || qtyRaw === 'every') return world.agents[holderId].inventory[item] || 0;
  return parseInt(qtyRaw || '1', 10);
}

const EXAMPLES = [
  'take bread from mara',
  'take all bread from mara',
  'give 2 gold to tomas',
  'attack ives',
  'tell elena that ives stole bread from mara',
  'tell garrick that ives is dangerous',
  'tell elena that mara is dead',
  'tell mara that garrick provoked player',
  'move to away',
  'return',
];

function parseCommand(world, actorId, raw) {
  const text = raw.trim().toLowerCase().replace(/\bthe\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return { error: 'say something to do' };

  let m;

  if ((m = text.match(/^(?:take|steal)\s+(?:(\d+|all|every)\s+)?(\w+)\s+from\s+(\w+)$/))) {
    const [, qtyRaw, item, targetTok] = m;
    const targetId = findAgentId(world, actorId, targetTok);
    if (!targetId) return { error: `who is "${targetTok}"?` };
    const quantity = resolveQuantity(qtyRaw, targetId, item, world);
    return { verb: 'Take', params: { targetId, item, quantity } };
  }

  if ((m = text.match(/^give\s+(?:(\d+|all|every)\s+)?(\w+)\s+to\s+(\w+)$/))) {
    const [, qtyRaw, item, targetTok] = m;
    const targetId = findAgentId(world, actorId, targetTok);
    if (!targetId) return { error: `who is "${targetTok}"?` };
    const quantity = resolveQuantity(qtyRaw, actorId, item, world);
    return { verb: 'Give', params: { targetId, item, quantity } };
  }

  if ((m = text.match(/^attack\s+(\w+)$/))) {
    const targetId = findAgentId(world, actorId, m[1]);
    if (!targetId) return { error: `who is "${m[1]}"?` };
    return { verb: 'Attack', params: { targetId } };
  }

  if ((m = text.match(/^(?:move to|go to)\s+(square|away)$/))) {
    return { verb: 'Move', params: { toLocation: m[1] } };
  }
  if (text === 'leave' || text === 'go away') return { verb: 'Move', params: { toLocation: 'away' } };
  if (text === 'return' || text === 'come back' || text === 'go back') return { verb: 'Move', params: { toLocation: 'square' } };

  if ((m = text.match(/^tell\s+(\w+)\s+that\s+(\w+)\s+(.+)$/))) {
    const [, targetTok, subjectTok, rest] = m;
    const targetId = findAgentId(world, actorId, targetTok);
    const subjectId = findAgentId(world, actorId, subjectTok);
    if (!targetId) return { error: `who is "${targetTok}"?` };
    if (!subjectId) return { error: `who is "${subjectTok}"?` };

    let cm;
    if ((cm = rest.match(/^stole\s+(?:(\d+|all|every)\s+)?(\w+)\s+from\s+(\w+)$/))) {
      const victimId = findAgentId(world, actorId, cm[3]);
      if (!victimId) return { error: `who is "${cm[3]}"?` };
      return { verb: 'Tell', params: { targetId, claim: { predicate: 'stole_from', subject: subjectId, victim: victimId, item: cm[2] } } };
    }
    if ((cm = rest.match(/^attacked\s+(\w+)$/))) {
      const victimId = findAgentId(world, actorId, cm[1]);
      if (!victimId) return { error: `who is "${cm[1]}"?` };
      return { verb: 'Tell', params: { targetId, claim: { predicate: 'attacked', subject: subjectId, victim: victimId } } };
    }
    if (rest.match(/^is dead$/)) return { verb: 'Tell', params: { targetId, claim: { predicate: 'is_dead', subject: subjectId } } };
    if (rest.match(/^is trustworthy$/)) return { verb: 'Tell', params: { targetId, claim: { predicate: 'is_trustworthy', subject: subjectId } } };
    if (rest.match(/^is dangerous$/)) return { verb: 'Tell', params: { targetId, claim: { predicate: 'is_dangerous', subject: subjectId } } };
    if ((cm = rest.match(/^provoked\s+(\w+)$/))) {
      const provokedId = findAgentId(world, actorId, cm[1]);
      if (!provokedId) return { error: `who is "${cm[1]}"?` };
      return { verb: 'Tell', params: { targetId, claim: { predicate: 'provoked', subject: subjectId, victim: provokedId } } };
    }

    return { error: `not sure what to tell ${targetTok} about ${subjectTok} — try "stole X from Y", "attacked Y", "provoked Y", "is dead", "is trustworthy", or "is dangerous"` };
  }

  return { error: `didn't understand "${raw}" — try: ${EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]}` };
}

const Parser = { parseCommand, EXAMPLES };
if (typeof window !== 'undefined') window.Parser = Parser;
if (typeof module !== 'undefined') module.exports = Parser;
