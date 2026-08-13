// Tiny Town Sim — presentation layer.
// Only this file touches the DOM. It reads Sim's world state, sends typed
// player sentences through Parser, and calls Sim.performAction(); it never
// mutates world state directly.

let world = Sim.createWorld();
Sim.seedRng(world, Date.now());
let inspectedId = 'mara';

const el = (id) => document.getElementById(id);

function renderWorld() {
  el('tick').textContent = world.tick;
  const byLocation = { square: [], away: [] };
  Object.values(world.agents).forEach(a => byLocation[a.location].push(a));

  el('world-panel').innerHTML = Object.values(Sim.LOCATIONS).map(loc => `
    <div class="location">
      <h3>${loc.name}</h3>
      ${byLocation[loc.id].length === 0 ? '<p class="empty">nobody here</p>' : byLocation[loc.id].map(renderAgentCard).join('')}
    </div>
  `).join('');
}

function renderAgentCard(a) {
  const hp = a.alive ? `${a.health} hp` : `<strong>down</strong>`;
  return `
    <div class="agent-card ${a.isPlayer ? 'is-player' : ''}" data-id="${a.id}">
      <div class="agent-name">${a.name}${a.isPlayer ? ' (you)' : ''}</div>
      <div class="agent-stats">${hp} · bread ${a.inventory.bread} · gold ${a.inventory.gold}</div>
      ${!a.isPlayer ? `<button class="link-btn inspect-btn" data-inspect="${a.id}">inspect mind</button>` : ''}
    </div>
  `;
}

function renderLog() {
  const logPanel = el('log-panel');
  logPanel.innerHTML = world.events.slice().reverse().map(ev => {
    const actor = Sim.getAgent(world, ev.actor).name;
    const causedTag = ev.causedBy ? `<span class="caused-by">↳ reaction to #${ev.causedBy}</span>` : '';
    const whyTag = ev.why ? `<span class="why-tag">— due to ${ev.why}</span>` : '';
    return `<div class="log-entry"><span class="log-id">#${ev.id}</span> <strong>${actor}</strong> ${describeEvent(ev)} ${whyTag} ${causedTag}</div>`;
  }).join('') || '<p class="empty">Nothing has happened yet.</p>';
}

function describeEvent(ev) {
  const targetName = ev.data.targetId ? Sim.getAgent(world, ev.data.targetId).name : '';
  switch (ev.verb) {
    case 'Take': return `took ${ev.data.quantity} ${ev.data.item} from ${targetName}`;
    case 'Give': return `gave ${ev.data.quantity} ${ev.data.item} to ${targetName}`;
    case 'Attack': return `attacked ${targetName} for ${ev.data.damage} damage${ev.data.targetSurvived ? '' : ' — they went down'}`;
    case 'Tell': return `told ${targetName}: "${Sim.PREDICATE_LABELS[ev.data.claim.predicate](ev.data.claim)}"`;
    case 'Move': return `moved from ${ev.data.from} to ${ev.data.to}`;
    default: return '';
  }
}

function renderMind() {
  const agent = world.agents[inspectedId];
  const panel = el('mind-panel');
  if (!agent || agent.isPlayer) { panel.innerHTML = '<p class="empty">Select an NPC to inspect.</p>'; return; }
  const m = agent.mind;

  const personality = Object.entries(m.personality).map(([trait, score]) =>
    `<li><strong>${trait}</strong> <span class="bar"><span class="bar-fill" style="width:${Math.round(score * 100)}%"></span></span> ${score.toFixed(2)}</li>`
  ).join('');

  const values = m.values.length
    ? m.values.map(v => `<li><strong>${v.value}</strong> ${v.weight >= 0 ? '+' : ''}${v.weight.toFixed(2)}</li>`).join('')
    : '<li class="empty">Holds none of the named values strongly — indifferent by default, not opposed.</li>';

  const worldview = m.worldview.length
    ? m.worldview.map(w => `<li><strong>${w.belief}</strong> ${w.weight >= 0 ? '+' : ''}${w.weight.toFixed(2)}</li>`).join('')
    : '<li class="empty">No strong convictions either way — not the same as holding the opposite view.</li>';

  const needs = Object.entries(m.needs).map(([need]) => { const live = Sim.needValue(agent, need, world.tick); return `<li><strong>${need}</strong> <span class="bar"><span class="bar-fill" style="width:${Math.round(live * 100)}%"></span></span> ${live.toFixed(2)}</li>`; }).join('');

  const emotions = m.emotions.slice().reverse().slice(0, 8).map(e => {
    const targetName = world.agents[e.target] ? world.agents[e.target].name : e.target;
    const effective = e.intensity * Math.pow(0.5, (world.tick - e.tick) / 6);
    return `<li><strong>${e.emotion}</strong> toward ${targetName} — ${effective.toFixed(2)} (decaying)</li>`;
  }).join('') || '<li class="empty">No active feelings.</li>';

  const beliefs = m.beliefs.slice().reverse().slice(0, 10).map(b => `
    <li><span class="belief-conf">${Math.round(Sim.beliefConfidence(b, world.tick) * 100)}%</span>
      ${b.predicate.startsWith('did:') ? `believes ${b.subject} performed ${b.predicate.slice(4)} (#${b.eventId})` : Sim.PREDICATE_LABELS[b.predicate] ? Sim.PREDICATE_LABELS[b.predicate](b.data) : `${b.subject} ${b.predicate}`}
      <span class="belief-source">via ${b.source}${b.contested ? ' — disputed by a competing account' : ''}</span>
    </li>`).join('') || '<li class="empty">No beliefs yet.</li>';

  const memories = m.memories.slice().reverse().slice(0, 8).map(mem => {
    const ev = world.events.find(e => e.id === mem.eventId);
    const strength = Sim.memoryStrength(mem, world.tick);
    return `<li>#${mem.eventId} ${ev ? describeEvent(ev) : '(forgotten)'} <span class="belief-source">still felt at ${strength.toFixed(2)}</span></li>`;
  }).join('') || '<li class="empty">Nothing witnessed yet.</li>';

  const relEntries = Object.entries(m.relationships).map(([otherId, r]) => {
    const otherName = world.agents[otherId] ? world.agents[otherId].name : otherId;
    return `<li><strong>${otherName}</strong> — trust ${r.trust.toFixed(2)}, affection ${r.affection.toFixed(2)}, fear ${r.fear.toFixed(2)}, grievance ${r.grievance.toFixed(2)}</li>`;
  }).join('') || '<li class="empty">No opinions formed yet.</li>';

  const goalItem = (g) => `<li><strong>${g.type}</strong>${g.target ? ` → ${world.agents[g.target] ? world.agents[g.target].name : g.target}` : ''} (priority ${g.priority.toFixed(2)})${g.reason ? ` <span class="belief-source">dormant — set aside for ${g.reason}</span>` : ''}</li>`;
  const goalsCurrent = m.goals.current.map(goalItem).join('') || '<li class="empty">None right now.</li>';
  const goalsFuture = m.goals.future.map(goalItem).join('') || '<li class="empty">None yet.</li>';

  const decisionLog = m.log.slice().reverse().slice(0, 6).map(d => `
    <li><em>${d.trigger}</em><br>considered: ${d.considered.join(', ')}<br>chose: <strong>${d.chose}</strong>${d.why ? ` <span class="why-tag">— due to ${d.why}</span>` : ''}</li>
  `).join('') || '<li class="empty">No decisions made yet.</li>';

  panel.innerHTML = `
    <h3>${agent.name}'s mind</h3>
    <div class="mind-section"><h4>Personality (OCEAN + boldness)</h4><ul class="bar-list">${personality}</ul></div>
    <div class="mind-section"><h4>Values</h4><ul>${values}</ul></div>
    <div class="mind-section"><h4>Worldview</h4><ul>${worldview}</ul></div>
    <div class="mind-section"><h4>Needs</h4><ul class="bar-list">${needs}</ul></div>
    <div class="mind-section"><h4>Emotions</h4><ul>${emotions}</ul></div>
    <div class="mind-section"><h4>Beliefs</h4><ul>${beliefs}</ul></div>
    <div class="mind-section"><h4>Memories</h4><ul>${memories}</ul></div>
    <div class="mind-section"><h4>Relationships</h4><ul>${relEntries}</ul></div>
    <div class="mind-section"><h4>Goals — current</h4><ul>${goalsCurrent}</ul></div>
    <div class="mind-section"><h4>Goals — future</h4><ul>${goalsFuture}</ul></div>
    <div class="mind-section"><h4>Recent decisions</h4><ul class="decision-log">${decisionLog}</ul></div>
  `;
}

function renderAll() {
  renderWorld();
  renderLog();
  renderMind();
}

// ── Debug report — full, untruncated state to paste back to Claude ──

function serializeWorld() {
  // mind.reactedEventIds is a Set, which JSON.stringify silently drops.
  return JSON.parse(JSON.stringify(world, (key, value) => (value instanceof Set ? Array.from(value) : value)));
}

function buildDebugReport() {
  const lines = [];
  lines.push(`Tiny Town debug report — tick ${world.tick}, ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`=== EVENT LOG (${world.events.length}) ===`);
  world.events.forEach(ev => {
    const actor = Sim.getAgent(world, ev.actor).name;
    const whySuffix = ev.why ? ` — due to ${ev.why}` : '';
    lines.push(`#${ev.id} [tick ${ev.tick}] ${actor} ${describeEvent(ev)}${whySuffix}${ev.causedBy ? ` (reaction to #${ev.causedBy})` : ''}`);
  });

  Object.values(world.agents).forEach(a => {
    lines.push('');
    if (a.isPlayer) {
      lines.push(`=== ${a.name} (player) ===`);
      lines.push(`location: ${a.location} | hp: ${a.health} | bread ${a.inventory.bread}, gold ${a.inventory.gold}`);
      return;
    }
    const m = a.mind;
    lines.push(`=== ${a.name} — full mind ===`);
    lines.push(`location: ${a.location} | hp: ${a.health} (${a.alive ? 'alive' : 'down'}) | bread ${a.inventory.bread}, gold ${a.inventory.gold}`);
    lines.push(`personality: ${Object.entries(m.personality).map(([k, score]) => `${k}=${score.toFixed(2)}`).join(', ')}`);
    lines.push(`values: ${m.values.length ? m.values.map(v => `${v.value}=${v.weight >= 0 ? '+' : ''}${v.weight.toFixed(2)}`).join(', ') : '(none)'}`);
    lines.push(`worldview: ${m.worldview.length ? m.worldview.map(w => `${w.belief}=${w.weight >= 0 ? '+' : ''}${w.weight.toFixed(2)}`).join(', ') : '(none)'}`);
    lines.push(`needs: ${Object.entries(m.needs).map(([k]) => `${k}=${Sim.needValue(a, k, world.tick).toFixed(2)}`).join(', ')}`);

    const liveEmotions = m.emotions.map(e => {
      const eff = e.intensity * Math.pow(0.5, (world.tick - e.tick) / 6);
      const targetName = world.agents[e.target] ? world.agents[e.target].name : e.target;
      return `${e.emotion}->${targetName}=${eff.toFixed(2)}`;
    });
    lines.push(`emotions (live): ${liveEmotions.join(', ') || '(none)'}`);

    lines.push(`beliefs (${m.beliefs.length}):`);
    m.beliefs.forEach(b => {
      const label = b.predicate.startsWith('did:')
        ? `believes ${b.subject} performed ${b.predicate.slice(4)} (#${b.eventId})`
        : (Sim.PREDICATE_LABELS[b.predicate] ? Sim.PREDICATE_LABELS[b.predicate](b.data) : `${b.subject} ${b.predicate}`);
      lines.push(`  - [${Math.round(Sim.beliefConfidence(b, world.tick) * 100)}%] ${label} — via ${b.source}, tick ${b.tick}${b.contested ? ' [disputed by a competing account]' : ''} (stored confidence=${b.confidence.toFixed(2)}, formed tick ${b.tick})`);
    });

    lines.push(`memories (${m.memories.length}):`);
    m.memories.forEach(mem => {
      lines.push(`  - #${mem.eventId} still felt at ${Sim.memoryStrength(mem, world.tick).toFixed(3)} (formed tick ${mem.tick}, importance ${mem.importance.toFixed(2)})`);
    });

    lines.push(`relationships:`);
    Object.entries(m.relationships).forEach(([id, r]) => {
      const name = world.agents[id] ? world.agents[id].name : id;
      lines.push(`  - ${name}: trust=${r.trust.toFixed(2)} affection=${r.affection.toFixed(2)} fear=${r.fear.toFixed(2)} grievance=${r.grievance.toFixed(2)}`);
    });

    const goalStr = (g) => `${g.type}->${world.agents[g.target] ? world.agents[g.target].name : g.target}(p${g.priority.toFixed(2)})${g.reason ? `[dormant:${g.reason}]` : ''}`;
    lines.push(`goals current: ${m.goals.current.map(goalStr).join(', ') || '(none)'}`);
    lines.push(`goals future: ${m.goals.future.map(goalStr).join(', ') || '(none)'}`);

    lines.push(`decision log (${m.log.length}):`);
    m.log.forEach(d => {
      const whySuffix = d.why ? ` | why: ${d.why}` : '';
      lines.push(`  - tick ${d.tick} | ${d.trigger} | considered: ${d.considered.join(', ') || '(n/a)'} | chose: ${d.chose}${whySuffix}`);
    });
  });

  lines.push('');
  lines.push('=== RAW WORLD STATE (JSON) ===');
  lines.push(JSON.stringify(serializeWorld(), null, 2));

  return lines.join('\n');
}

function generateReport() {
  const output = el('debug-output');
  output.value = buildDebugReport();
  output.style.display = 'block';
  output.focus();
  output.select();
  output.scrollTop = 0; // select() jumps to the end; the readable summary is at the top

  const status = el('copy-status');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(output.value).then(
      () => { status.textContent = 'Copied to clipboard — paste it back to Claude.'; },
      () => { status.textContent = 'Report generated below — select all and copy.'; }
    );
  } else {
    status.textContent = 'Report generated below — select all and copy.';
  }
}

// ── Player command input ────────────────────────────────────

function submitCommand(e) {
  e.preventDefault();
  const input = el('command-input');
  const raw = input.value;
  if (!raw.trim()) return;

  const parsed = Parser.parseCommand(world, 'player', raw);
  const resultEl = el('action-result');

  if (parsed.error) {
    resultEl.textContent = parsed.error;
    resultEl.classList.add('is-error');
    return;
  }

  const result = Sim.performAction(world, 'player', parsed.verb, parsed.params);
  if (!result.success) {
    resultEl.textContent = `Can't: ${result.reason}`;
    resultEl.classList.add('is-error');
    return;
  }

  resultEl.textContent = '';
  resultEl.classList.remove('is-error');
  input.value = '';
  renderAll();
}

function renderExamples() {
  el('example-list').innerHTML = Parser.EXAMPLES.map(cmd => `<li><button type="button" class="link-btn" data-example="${cmd}">${cmd}</button></li>`).join('');
}

function init() {
  renderExamples();
  el('command-form').addEventListener('submit', submitCommand);
  el('reset-btn').addEventListener('click', () => {
    world = Sim.createWorld();
    Sim.seedRng(world, Date.now());
    el('action-result').textContent = '';
    el('debug-output').style.display = 'none';
    el('debug-output').value = '';
    el('copy-status').textContent = '';
    renderAll();
  });
  el('generate-report-btn').addEventListener('click', generateReport);
  el('world-panel').addEventListener('click', (e) => {
    const id = e.target.getAttribute('data-inspect');
    if (id) { inspectedId = id; renderMind(); }
  });
  el('example-list').addEventListener('click', (e) => {
    const cmd = e.target.getAttribute('data-example');
    if (cmd) { el('command-input').value = cmd; el('command-input').focus(); }
  });
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
