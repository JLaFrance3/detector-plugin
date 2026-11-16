# ADR-007: Local markdown tickets with traceability

- **Status:** Accepted, 2026-11-04
- **Requirements:** REQ-NF-004

## Context
Solo project with heavy AI code generation. Requirements, tasks and code should live together so both the developer and Claude Code can read and update them, and so the presentation can show requirement-to-code traceability.

## Decision
- Requirements in `docs/requirements.md` with stable IDs (REQ-F, REQ-UI, REQ-NF, REQ-SEC, REQ-PRV).
- One markdown file per task in `tasks/`, with frontmatter (`id`, `title`, `status`, `requirements`, `depends_on`).
- Commits reference task IDs, e.g. `feat(c2pa): parse manifest [TASK-012]`.
- Test names include the REQ ID they verify.
- `scripts/trace.mjs` generates `docs/traceability.md`.

## Consequences
- No GitHub Issues dependency; everything is versioned with the code.
- Discipline needed: status changes are commits.
