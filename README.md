# SimLife

A small experiment in emergent simulation: can a tiny simulated town produce
coherent, unscripted consequences when the player does something nobody
explicitly wrote a scenario for?

The architecture's one rule: the simulation should never ask "what quest is
the player doing?" — only "what is true, who knows it, what do they want,
and what can they do about it?" Player and NPC actions both run through the
same pipeline: **perceive → believe → decide → act**. Nothing is
special-cased per scenario.

## Try it

Static site, no build step. Serve the folder locally and open it:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000/index.html`. (Opening `index.html`
directly as a `file://` URL also works — there's no server-side code.)

## What's here

- **`sim.js`** — the engine. World state, five generic verbs (Take, Give,
  Attack, Tell, Move), perception, belief formation, and a small utility-AI
  decide/act loop NPCs use to react on their own.
- **`parser.js`** — turns typed player sentences ("take bread from mara")
  into the same action requests NPCs generate internally.
- **`presentation.js`** — DOM rendering only. Reads engine state through
  `sim.js`'s public API; never mutates it directly.
- **`index.html` / `style.css`** — the page shell and styling.
- **`PERSON-MODEL.md`** — precise reference for what each part of an NPC's
  mind (Personality, Values, Worldview, Beliefs, Memories, Needs, Emotions,
  Relationships, Goals) actually is in the code, plus the specific gaps
  queued up for the next phase of work.

## History

This started as a prototype inside `ranisman-dev/portfolio`
(`prototypes/tiny-town-sim/`). It's moved here as its own project — that
repo no longer contains it, and this one is where the work continues.
