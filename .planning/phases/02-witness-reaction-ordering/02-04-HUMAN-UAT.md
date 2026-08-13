---
status: partial
phase: 02-witness-reaction-ordering
source: [02-04-PLAN.md Task 2 checkpoint]
started: 2026-08-13T00:15:00Z
updated: 2026-08-13T00:15:00Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Human browser verification of reordered witness dispatch
expected: Full steps below.
result: [pending]

Steps (server needs restarting — it does not survive a session boundary):
1. From the repo root: `python -m http.server 8000` (NOT `python3` — that's a Microsoft Store alias stub on this machine and does not work).
2. Open `http://localhost:8000/index.html`.
3. In the dev console, run `Sim.runOrderingCheck({})` — expect `pass: true` with all four checks `pass: true`.
4. In the dev console, run:
   `const w = Sim.buildOrderingScenario(); console.log(w.world.events.find(e => e.id === w.eventId).witnessOrder.join(', '))`
   Expected: `garrick, elena, mara, tomas, ives` (victim first, indifferent bystander last).
5. In the actual game UI, type `attack garrick` and press enter. Confirm Garrick's own reaction appears *before* any other NPC's reaction to that same event in the event log, and each reaction shows its `— due to <terms>` explanation.
6. Open the mind inspector for two or three NPCs. Confirm exactly one decision entry per event (no duplicated `considered`/`chose` rows), and any `tell ... about ...` entry in a `considered` list has no `(misattributed)` suffix while a `chose:` line may still have one.
7. Click the reset button; confirm no console error traces to `sim.js` or `presentation.js`. (A generic `"A listener indicated an asynchronous response..."` at `index.html:1` is a known browser-extension artifact — Phase 1 hit the same one, not a real issue.)

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
