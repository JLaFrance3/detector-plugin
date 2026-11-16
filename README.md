# AI Image Detection Extension

Chrome extension that checks images as they appear on a page and shows a small warning when an image is definitely (signed C2PA Content Credentials) or likely (on-device AI detector) AI-generated. CYB 505 Practitioner Assignment, Fall 2026.

| Path | Contents |
| --- | --- |
| `docs/requirements.md` | Requirements with IDs and acceptance criteria |
| `docs/decisions/` | Architecture decision records |
| `docs/traceability.md` | Generated REQ to task to test matrix |
| `tasks/` | One markdown file per task; `tasks/README.md` is the board |
| `scripts/trace.mjs` | Regenerates the traceability matrix |
| `scripts/task.mjs` | Sets a task's status in its file and on the board |
| `extension/` | Angular + esbuild Chrome extension |
| `backend/` | Node + Fastify second-opinion service (TASK-018) |
| `CLAUDE.md` | Rules for AI-assisted code generation |

Research background: [research brief](https://claude.ai/artifact/EJUyaN6fcZo5qUfvjfCkLS).

## Getting started

Requires Node 22 or newer.

```bash
npm install
npm run build
```

Then open `chrome://extensions`, turn on Developer mode, choose "Load unpacked" and select `extension/dist/`.

| Command | What it does |
| --- | --- |
| `npm run build` | Production build of the extension into `extension/dist/`, then checks the manifest and bundle |
| `npm run watch` | Rebuilds on change (development mode). Reload the extension from `chrome://extensions` afterwards |
| `npm run lint` | ESLint (including the banned DOM/eval API rules) and Prettier check |
| `npm run typecheck` | TypeScript strict check of the esbuild scripts and backend |
| `npm test` | Unit tests (Vitest, plus Angular component tests) |
| `npm run trace` | Regenerates `docs/traceability.md` |

## Extension layout

| Path | Built by | Output |
| --- | --- | --- |
| `extension/projects/popup/` | Angular CLI | `dist/popup/` (toolbar popup) |
| `extension/projects/in-page/` | Angular CLI | `dist/ui/main.js` (badge and popover, loaded as a content script) |
| `extension/src/background/` | esbuild | `dist/service-worker.js` |
| `extension/src/content/` | esbuild | `dist/content.js` |
| `extension/src/offscreen/` | esbuild | `dist/offscreen/` |
| `extension/src/shared/` | both | Types and pure logic shared by all parts |
