---
id: TASK-024
title: Traceability script
status: done
milestone: M0
requirements: [REQ-NF-004]
depends_on: [TASK-001]
---

# TASK-024: Traceability script

`scripts/trace.mjs` reads requirements, tasks and tests and writes `docs/traceability.md`.

## Acceptance criteria

- [x] Lists every REQ with its tasks and the tests that mention it
- [x] Flags REQs with no task and tasks pointing at unknown REQs
- [x] Runs with plain Node, no dependencies

## Notes

Drafted with the planning docs; copy into the repo and wire up `npm run trace`.
