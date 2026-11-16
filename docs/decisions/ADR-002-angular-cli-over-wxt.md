# ADR-002: Angular CLI and esbuild instead of WXT

- **Status:** Accepted, 2026-11-04
- **Requirements:** REQ-NF-003

## Context
The UI is Angular (developer wants the practice). WXT is a Vite-based extension framework with official modules for React, Vue, Svelte and Solid, but not Angular. Using it with Angular would depend on a third-party Vite plugin (AnalogJS) that was not verified for this setup.

## Decision
Build extension pages and UI with the Angular CLI. Build the service worker, content script and offscreen document with a small esbuild script. Write `manifest.json` (Manifest V3) by hand.

## Consequences
- No automatic extension reload; use watch builds and reload from `chrome://extensions`. This only affects development.
- No one-command Firefox build; the project targets Chrome only.
- Two build tools to keep in sync; wrap them in one `npm run build` and `npm run watch`.
