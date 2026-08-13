---
status: partial
phase: 03-belief-decay-needs-regeneration
source: [03-05-PLAN.md Task 3 checkpoint]
started: 2026-08-13T03:05:18Z
updated: 2026-08-13T03:05:18Z
---

## Current Test

[awaiting human testing]

## Tests

### 1. Human browser verification of the mind inspector and debug report
expected: Full steps below.
result: [pending]

Steps (server needs restarting — it does not survive a session boundary):
1. Start the static server from the repo root: `python -m http.server 8000` (NOT `python3` — that's a Microsoft Store alias stub on this machine and does not work).
2. Open `http://localhost:8000/index.html` and open the browser devtools Console.
3. Click an NPC to open the mind inspector. Confirm the **Needs** section renders three
   bars (safety, sustenance, belonging) with numeric values between 0.00 and 1.00 and
   visible bar fills — no blank list, no `NaN`, no `[object Object]`.
4. Confirm the Console shows NO `TypeError: v.toFixed is not a function` and no other red
   errors.
5. Type `attack <npc name>` in the command input and run it. Reopen that NPC's inspector
   and confirm their **safety** bar has visibly dropped.
6. Perform several more unrelated actions (any verbs), then reopen the same NPC and
   confirm **safety** has visibly risen back toward 1 without ever reaching a value above
   1.00 — this is DECAY-03 observed by eye.
7. Type `give bread to <npc name>` as the player. Confirm nothing throws in the Console
   (this is the inverted `!actor.isPlayer` guard on the live path — the most likely way
   this phase breaks the running game).
8. Have an NPC's belief list open and perform several more actions. Confirm the belief
   percentages **decrease** as ticks pass rather than staying frozen — this is DECAY-01
   observed by eye. Old, low-confidence beliefs should eventually drop off the list.
9. Click the debug-report button and confirm the report builds and contains a `needs:`
   line with three numeric values and belief lines showing live-vs-stored confidence.

Report anything unexpected verbatim, including the full Console error text if any appears.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
