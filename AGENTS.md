# Repository Guidelines

## Project Structure & Module Organization
- Root-only app: `index.html` (static entry), `main.ts` (authoring source), `main.js` (browser script).
- Three.js is loaded via CDN in `index.html`. Keep browser-facing code minimal; prefer small helpers over new folders unless the code grows (e.g., `src/` for TS, `assets/` for textures).

## Build, Test, and Development Commands
- Run locally: `python3 -m http.server 8080` then open `http://localhost:8080/`.
- TypeScript build (browser-friendly): `npx tsc -p .`
  - Uses `tsconfig.json` (`module: none`) so it runs via a plain `<script>` tag.
- Optional dev server (recommended): `npx vite` (after adding a minimal `package.json` and `vite` dependency).

## Coding Style & Naming Conventions
- Indentation: 2 spaces; max line length ~100; use semicolons.
- Naming: `camelCase` for variables/functions, `PascalCase` for classes, constants in `UPPER_SNAKE_CASE`.
- Three.js objects: suffix with type (e.g., `groundGeometry`, `groundMaterial`, `groundMesh`).
- File names: lowercase with hyphens or simple names (`main.ts`, `index.html`).
- Prefer pure helpers over in-line logic; colocate small utilities in `main.ts` until growth warrants `src/`.

## Testing Guidelines
- Framework: none yet. If added, prefer Vitest + Playwright.
- Structure: place unit tests under `tests/` with `*.spec.ts`.
- Minimum smoke test (e2e): assert a `<canvas>` renders and the render loop runs one frame without errors.
- Run tests: `npx vitest` (unit) and `npx playwright test` (e2e) after tool setup.

## Commit & Pull Request Guidelines
- Commit style: Conventional Commits (e.g., `feat: add block placement helper`, `fix: correct camera aspect`).
- Scope small, atomic commits; include rationale in body if non-trivial.
- PRs: include overview, before/after screenshots (if visual), repro steps, and any perf or bundle-size notes.

## Security & Configuration Tips
- Pin CDN versions (currently Three.js `0.154.0`) and update intentionally.
- Serve via HTTP(S); avoid `file://` to prevent CORS/texture issues.
- Keep import style consistent: either CDN global (`THREE`) without imports, or ESM with a bundler. Don’t mix.
