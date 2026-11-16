---
id: TASK-001
title: Scaffold the monorepo
status: done
milestone: M0
requirements: [REQ-NF-003, REQ-NF-004, REQ-SEC-009]
depends_on: []
---

# TASK-001: Scaffold the monorepo

Create the repo layout: `extension/`, `backend/`, `docs/`, `tasks/`, `scripts/`, npm workspaces, TypeScript strict, ESLint, Prettier, and the provided CLAUDE.md.

## Acceptance criteria

- [x] `npm install` and `npm run lint` succeed from the root
- [x] TypeScript `strict: true` in every package
- [x] ESLint bans `innerHTML`, `outerHTML`, `eval`, `new Function` and `bypassSecurityTrust*`
- [x] Lockfile committed; `docs/`, `tasks/` and `CLAUDE.md` copied in
