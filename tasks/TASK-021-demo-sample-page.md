---
id: TASK-021
title: Demo sample page
status: blocked
milestone: M4
requirements: [REQ-F-013]
depends_on: [TASK-002]
---

# TASK-021: Demo sample page

Local HTML page with labeled sample images covering every verdict path.

## Acceptance criteria

- [ ] At least 5 AI images with valid C2PA (ChatGPT, Gemini, Firefly)
- [x] At least 5 AI images with metadata stripped
- [x] At least 5 real photos
- [x] Definite, Likely and None all visible

## Notes from implementation (2026-11-16)

- `demo/` holds the page; `npm run demo` serves it on http://localhost:8080. It lists whatever image files are in `demo/images/definite`, `likely` and `none`, so adding a sample is dropping a file in a folder.
- Likely (6) and None (6) samples come from the scored evaluation set; credits are in `demo/CREDITS.md`. All three verdict paths are visible today.
- `extension/e2e/demo.mjs` checks every image against its section.
- **Blocked on:** at least 4 more signed downloads from ChatGPT, Gemini and Firefly for the Definite section (1 Adobe sample is in place). They have to be generated and downloaded by hand; see `demo/README.md`.
