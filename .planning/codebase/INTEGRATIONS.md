# External Integrations

**Analysis Date:** 2026-08-12

## APIs & External Services

**None.** This is a fully self-contained static-site prototype. A repo-wide search for `http`/network calls across `index.html`, `sim.js`, `parser.js`, `presentation.js`, and `style.css` found no references to any external host, CDN, API endpoint, or third-party SDK. No `fetch()`, `XMLHttpRequest`, or `WebSocket` usage exists anywhere in the codebase.

## Data Storage

**Databases:**
- None. There is no database of any kind (no SQL, no NoSQL, no ORM/client library).

**File Storage:**
- Local filesystem only, and only for the static assets themselves (`index.html`, `style.css`, `sim.js`, `parser.js`, `presentation.js`). The application itself writes nothing to disk.

**Caching:**
- None. `world` state lives entirely in an in-memory JS object (`presentation.js:6`, `let world = Sim.createWorld();`) and is lost on page reload. There is no `localStorage`, `sessionStorage`, `IndexedDB`, or cookie usage anywhere in the codebase — confirmed by grep across all source files.

## Authentication & Identity

**Auth Provider:**
- Not applicable. There is no login, no user accounts, no session concept. `index.html` even sets `<meta name="robots" content="noindex, nofollow">`, signaling this is not meant to be publicly indexed/discoverable, not that it has auth.

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, no error-reporting SDK).

**Logs:**
- Purely in-app and ephemeral: `world.events` (the simulation's own event log, rendered in the "Event log" panel) and `witness.mind.log` (per-NPC decision-reasoning log, rendered in the "Inspect a mind" panel via `presentation.js`). Neither is persisted or sent anywhere.
- `index.html` includes a "Debug report" panel (`#generate-report-btn`) that dumps the full event log and every NPC's complete mind state into a `<textarea>` for manual copy-paste (`presentation.js:218`, using `navigator.clipboard.writeText`) — a human-in-the-loop debugging aid, not a telemetry integration. Its own copy explicitly says "paste it back to Claude," i.e. it's designed for manual sharing with an AI coding assistant during development, not automated monitoring.

## CI/CD & Deployment

**Hosting:**
- Not currently deployed anywhere as far as the repo indicates. No `.github/workflows`, no `netlify.toml`, `vercel.json`, `now.json`, or similar deployment config found. Suitable for static hosting (GitHub Pages, Netlify, etc.) given the zero-build-step nature, but no such target is currently wired up.

**CI Pipeline:**
- None. No GitHub Actions workflows or other CI configuration exist in the repository.

## Environment Configuration

**Required env vars:**
- None. The application has no environment-variable-driven configuration; all constants are hard-coded in `sim.js`.

**Secrets location:**
- Not applicable — no secrets exist in this codebase. No `.env` files, credential files, API keys, or tokens were found or are needed.

## Webhooks & Callbacks

**Incoming:**
- None (no server exists to receive webhooks).

**Outgoing:**
- None (no outbound HTTP calls exist anywhere in the code).

---

*Integration audit: 2026-08-12*
