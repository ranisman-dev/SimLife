# Requirements: Tiny Town

**Defined:** 2026-08-12
**Core Value:** An entire world — not just NPCs — reacts unscripted to what anyone in it
does, player and NPC alike, with real, lasting consequences rather than flavor text.
*(This milestone's slice of that Core Value: making the person model itself capable of
changing under pressure, plus closing the gaps that currently undercut it.)*

## v1 Requirements

### Verification Infrastructure

- [ ] **VERIF-01**: The regression suite can toggle drift off entirely and reproduce the
      original two-clone `CompetitiveJungle` divergent-reaction case byte-for-bit
- [ ] **VERIF-02**: All randomness in the engine (Attack damage, gossip truth-telling,
      scapegoat selection) flows through a single seeded RNG call site, so a session is
      reproducible from its seed
- [ ] **VERIF-03**: Every new Phase 2 tuning number (thresholds, rates, decay constants)
      lives in one named constants block, not scattered inline

### Witness Reaction Ordering

- [ ] **ORDER-01**: When multiple NPCs witness the same event, they react in order of
      computed urgency/score, not by their position in the world's agent list
- [ ] **ORDER-02**: A scripted-scenario baseline of the current (pre-fix) reaction order
      is captured and diffed against the new order, so the fix's effect is confirmed, not
      assumed

### Belief Decay & Needs Regeneration

- [x] **DECAY-01**: A belief's effective confidence decays over time the same way memory
      strength does, using the existing halflife-style formula
- [x] **DECAY-02**: A belief tagged "known false" (contradicted by ground truth) is never
      pruned regardless of staleness — pruning only removes genuinely stale, unreinforced
      beliefs
- [x] **DECAY-03**: `safety`, `sustenance`, and `belonging` needs regenerate toward
      baseline over time and/or via specific triggers, instead of only ever dropping
- [x] **DECAY-04**: `belonging` has at least one concrete trigger (its first ever mutator)
- [x] **DECAY-05**: The `safety < 0.7` retreat gate uses a hysteresis band so passive
      regeneration crossing the threshold repeatedly doesn't cause flickery, causeless
      retreat behavior

### Tell/Move-Aware Memory Importance

- [ ] **MEMORY-01**: `Tell` and `Move` events produce a real `impact` value in
      `appraiseEvent`, scaled by the severity of what's claimed, instead of the flat floor
- [ ] **MEMORY-02**: A high-importance memory (from any event type) persists meaningfully
      longer than the current ~38-tick/190-delta-tick cap allows, so being told something
      explosive can still be recalled far later

### Slow Trait Drift

- [ ] **DRIFT-01**: Each drift-eligible personality trait / value / worldview entry
      tracks a permanent `anchor`, a live `weight` that can diverge and relax back toward
      it, and a `pressure` accumulator that decays over time
- [ ] **DRIFT-02**: Repeated events pushing the same direction raise `pressure`; crossing
      a threshold rewrites `anchor` to `weight` — an actual, permanent change — via a
      decayed running counter, not a rolling window
- [ ] **DRIFT-03**: Trait/value/worldview writes are deferred until the current event's
      full reaction cascade resolves, never mutated live mid-cascade, preventing
      self-reinforcing drift within one event
- [ ] **DRIFT-04**: One event can plausibly nudge multiple related trait/value/worldview
      entries at once, reusing the existing `event.why` per-term decomposition to select
      which entries are implicated

### Snap Events

- [ ] **SNAP-01**: A single sufficiently intense event can immediately rewrite both
      `weight` and `anchor` for an implicated entry, bypassing the slow-drift path
      entirely
- [ ] **SNAP-02**: The intensity threshold for a snap is computed from surrounding
      context (current emotion intensity, relevant worldview weight, personality traits
      like boldness/neuroticism) rather than being a flat number
- [ ] **SNAP-03**: Repeated events that echo a prior near-miss (didn't cross the snap
      threshold) make that entry's pressure decay more slowly / stickier, without that
      alone constituting a full anchor change

### Trigger Reactivation

- [ ] **TRIGGER-01**: An NPC can experience a transient emotion re-spike from an old,
      still-salient high-importance memory when a later event reminds them of it
- [ ] **TRIGGER-02**: Reactivation can read as positive (courage/resolve) or negative
      (anxiety/caution) depending on the original event's appraised valence and the trait
      it's tied to — one code path, not a negative-only special case
- [ ] **TRIGGER-03**: Reactivation is decided and logged so it's inspectable (via
      `mind.log`/`event.why`-style provenance), not a silent internal effect

## v2 Requirements

### Reinforcement

- **ECHO-01**: An independent probabilistic "lock-in" mechanism (Darkest Dungeon
  quirk-lock-style) layered on top of the core pressure accumulator, for stickiness
  beyond what slower pressure decay alone (SNAP-03) provides

## Out of Scope

| Feature | Reason |
|---------|--------|
| Authored trait/quirk taxonomy | Disproportionate authoring cost for a 5-NPC prototype; shifts focus away from the stated Core Value (belief divergence) |
| Player-facing pressure/drift gauge | No *player*-facing UI surface requested. Debug-only visibility is fine and expected — `pressure`/`anchor`/`weight` should show up in the existing mind inspector (`presentation.js`'s debug/dev view) the same way beliefs, goals, and `event.why`/`mind.log` provenance already do; this line only excludes a deliberately designed meter shown to the actual player during normal play |
| Ecology/economy world-systems (hunting, farming, businesses) | Long-term Core Value, not this milestone — see `PROJECT.md` Out of Scope |
| `Tradition`/`Pleasure` values, superstition/spirituality worldview entries | No honest mechanic to attach them to in the current five-verb sim — see `PROJECT.md` |
| Automated test suite | Verification infrastructure (VERIF-*) covers the immediate need without a full suite — see `PROJECT.md` |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| VERIF-01 | Phase 1 | Pending |
| VERIF-02 | Phase 1 | Pending |
| VERIF-03 | Phase 1 | Pending |
| ORDER-01 | Phase 2 | Pending |
| ORDER-02 | Phase 2 | Pending |
| DECAY-01 | Phase 3 | Complete |
| DECAY-02 | Phase 3 | Complete |
| DECAY-03 | Phase 3 | Complete |
| DECAY-04 | Phase 3 | Complete |
| DECAY-05 | Phase 3 | Complete |
| MEMORY-01 | Phase 4 | Pending |
| MEMORY-02 | Phase 4 | Pending |
| DRIFT-01 | Phase 5 | Pending |
| DRIFT-02 | Phase 5 | Pending |
| DRIFT-03 | Phase 5 | Pending |
| DRIFT-04 | Phase 5 | Pending |
| SNAP-01 | Phase 6 | Pending |
| SNAP-02 | Phase 6 | Pending |
| SNAP-03 | Phase 6 | Pending |
| TRIGGER-01 | Phase 7 | Pending |
| TRIGGER-02 | Phase 7 | Pending |
| TRIGGER-03 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 22 total
- Mapped to phases: 22
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-12*
*Last updated: 2026-08-12 after roadmap creation (7 phases, full v1 coverage)*
