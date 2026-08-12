---
status: partial
phase: 01-verification-infrastructure
source: [01-VERIFICATION.md]
started: 2026-08-12T23:05:00Z
updated: 2026-08-12T23:05:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Typed player command still works in a live browser session
expected: Open `index.html` (or `python -m http.server 8000`), type a command such as `take bread from mara` — it parses and executes normally, NPC behavior is observably unchanged from before this phase, no console errors from `sim.js`/`presentation.js`.
result: [pending]

### 2. Reset-button RNG re-seeding
expected: Click the reset button in the app (the `presentation.js:266-268` call site) and confirm `world.seed` changes to a new, distinct value (not the prior session's seed, not `Sim.DEFAULT_SEED`), and subsequent Attack/gossip/scapegoat randomness draws from the new stream.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
