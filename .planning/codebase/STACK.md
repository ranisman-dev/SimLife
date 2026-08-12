# Technology Stack

**Analysis Date:** 2026-08-12

## Languages

**Primary:**
- JavaScript (ES6+, browser-native, no transpilation) - `sim.js`, `parser.js`, `presentation.js`
  - Uses `const`/`let`, arrow functions, template literals, destructuring, `Array.prototype` methods (`.map`, `.filter`, `.reduce`, `.find`). No JSX, no TypeScript, no async/await (the sim is fully synchronous).

**Secondary:**
- HTML5 - `index.html` (single-page shell, no templating engine)
- CSS3 - `style.css` (hand-written, no preprocessor, no CSS framework)
- Markdown - `CLAUDE.md`, `PERSON-MODEL.md`, `README.md` (project documentation, not code)

## Runtime

**Environment:**
- Browser (any modern evergreen browser) - the actual runtime target. Scripts load via plain `<script src="...">` tags in `index.html`, no `type="module"`, so all three files share one global scope in load order: `sim.js` → `parser.js` → `presentation.js`.
- Node.js (incidental, dev-only) - `sim.js` and `parser.js` each end with a dual-export guard:
  ```js
  if (typeof window !== 'undefined') window.Sim = Sim;
  if (typeof module !== 'undefined') module.exports = Sim;
  ```
  This lets them be `require()`'d from Node for ad-hoc scripting/debugging (see `.claude/settings.local.json`, which allowlists commands like `node -e "require('./sim.js')"`). There's no Node application, entry script, or npm scripts in the repo — this is a side effect of the export guard, not a designed dual-runtime architecture. `presentation.js` has no such guard since it's DOM-only.
- Local Node version observed in this environment: v24.11.1 (not pinned anywhere in the repo — no `.nvmrc`, no `engines` field, because there's no `package.json`).

**Package Manager:**
- None. There is no `package.json`, `package-lock.json`, `yarn.lock`, or `node_modules/`. Zero third-party dependencies of any kind.
- Lockfile: not applicable (no packages to lock).

## Frameworks

**Core:**
- None. `presentation.js` does direct DOM manipulation (`document.getElementById`, `.innerHTML` template strings, manual event listeners) with no view framework (no React/Vue/Svelte).

**Testing:**
- None. No test runner, no test files, no assertion library. `CLAUDE.md` states explicitly: "There is no test suite, linter, or build command in this repo." The only verification observed is ad-hoc Node `require()` smoke checks (see `.claude/settings.local.json`), not a formal test suite.

**Build/Dev:**
- None. No bundler (no Webpack/Vite/esbuild/Rollup), no transpiler (no Babel/TypeScript compiler), no CSS preprocessor, no linter/formatter config (no `.eslintrc*`, no `.prettierrc*`).
- Dev server is any static file server; `CLAUDE.md` and `README.md` both document `python3 -m http.server 8000` as the convention. Opening `index.html` directly via `file://` also works since there is zero server-side code.

## Key Dependencies

**Critical:**
- None (zero runtime dependencies — no npm packages, no vendored libraries, no CDN-loaded scripts). `index.html` loads only the project's own three `<script>` tags and its own `style.css`; there are no `<link>`/`<script>` tags pointing at any external host.

**Infrastructure:**
- Not applicable — no server, no database client, no ORM, no HTTP client library. `sim.js` is pure in-memory state (a `world` object) with no persistence layer.

## Configuration

**Environment:**
- No environment variables, no `.env` files, no runtime config files. All tunable constants (e.g. `MAX_REACTION_DEPTH`, decay rates, value/worldview banks) are hard-coded directly in `sim.js` as module-level `const`s.
- `.claude/settings.local.json` configures Claude Code's own tool permissions for this repo (allowlists specific `node -e` invocations); it is not application configuration.

**Build:**
- None. No `tsconfig.json`, `webpack.config.js`, `vite.config.js`, or similar. `index.html` is the only "build artifact," and it's hand-written, not generated.

## Platform Requirements

**Development:**
- Any machine with a modern browser and (optionally) Python 3 or Node.js installed to serve static files locally. Confirmed present in this environment: Python 3.14.0, Node v24.11.1 — neither is a hard requirement of the project itself.
- No OS-specific tooling; the codebase is platform-agnostic static assets.

**Production:**
- Static file hosting only (e.g. GitHub Pages, Netlify, S3, or any plain web server capable of serving HTML/CSS/JS). No server runtime, no database, no deployment pipeline currently exists in the repo (no `.github/workflows`, no other CI config found).
- Git remote: `https://github.com/ranisman-dev/SimLife.git` (GitHub, no CI/CD configured against it at this time).

---

*Stack analysis: 2026-08-12*
