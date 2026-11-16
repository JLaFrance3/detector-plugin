# Tasks

One file per task. Frontmatter fields: `id`, `title`, `status` (todo, in-progress, done, blocked), `milestone`, `requirements`, `depends_on`.

Workflow: set `status: in-progress` when starting, tick acceptance criteria as they pass, set `status: done`, and reference the ID in every commit, e.g. `feat(c2pa): parse manifest [TASK-009]`.

## M0: Setup and spikes (week of Nov 9)

| Task | Title | Requirements | Depends on | Status |
| --- | --- | --- | --- | --- |
| [TASK-001](TASK-001-repo-scaffold.md) | Scaffold the monorepo | REQ-NF-003, REQ-NF-004, REQ-SEC-009 | - | done |
| [TASK-002](TASK-002-build-pipeline.md) | Build pipeline: Angular CLI + esbuild + manifest | REQ-NF-003, REQ-SEC-008 | TASK-001 | done |
| [TASK-003](TASK-003-spike-angular-shadow-root.md) | Spike: Angular rendering in a content script shadow root | REQ-UI-006, REQ-SEC-002 | TASK-002 | done |
| [TASK-004](TASK-004-spike-c2pa-offscreen.md) | Spike: read C2PA in the offscreen document | REQ-F-003, REQ-SEC-007 | TASK-002 | done |
| [TASK-005](TASK-005-spike-detector-offscreen.md) | Spike: run the detector model in the offscreen document | REQ-F-006, REQ-NF-001, REQ-SEC-008 | TASK-002 | done |
| [TASK-024](TASK-024-traceability-script.md) | Traceability script | REQ-NF-004 | TASK-001 | done |

## M1: Core pipeline (week of Nov 16)

| Task | Title | Requirements | Depends on | Status |
| --- | --- | --- | --- | --- |
| [TASK-006](TASK-006-message-contracts.md) | Message contracts and validation | REQ-SEC-003 | TASK-002 | done |
| [TASK-007](TASK-007-image-discovery.md) | Find visible images on the page | REQ-F-001 | TASK-003, TASK-006 | done |
| [TASK-008](TASK-008-sw-image-fetch.md) | Fetch image bytes in the service worker | REQ-F-002 | TASK-006 | done |
| [TASK-009](TASK-009-c2pa-reader.md) | C2PA reader with trust check | REQ-F-003, REQ-SEC-007 | TASK-004, TASK-008, TASK-011 | done |
| [TASK-010](TASK-010-iptc-xmp-reader.md) | Read unsigned IPTC/XMP source type | REQ-F-004 | TASK-008, TASK-011 | done |
| [TASK-011](TASK-011-metadata-sanitizer.md) | Sanitize C2PA and metadata fields | REQ-SEC-001 | TASK-001 | done |
| [TASK-012](TASK-012-detector-service.md) | Detector service with queue | REQ-F-006, REQ-NF-001, REQ-PRV-001 | TASK-005, TASK-008 | done |
| [TASK-013](TASK-013-verdict-logic.md) | Verdict decision function | REQ-F-005 | TASK-001 | done |
| [TASK-014](TASK-014-verdict-cache.md) | Verdict cache | REQ-F-011, REQ-PRV-004 | TASK-013 | done |

## M2: In-page UI (week of Nov 23)

| Task | Title | Requirements | Depends on | Status |
| --- | --- | --- | --- | --- |
| [TASK-015](TASK-015-badge-component.md) | Badge component | REQ-F-007, REQ-UI-001, REQ-UI-002, REQ-UI-003, REQ-UI-004, REQ-SEC-002 | TASK-003, TASK-007, TASK-013 | done |
| [TASK-016](TASK-016-details-popover.md) | Details popover | REQ-F-008, REQ-UI-005, REQ-SEC-002 | TASK-015, TASK-009, TASK-010, TASK-012 | done |
| [TASK-017](TASK-017-settings-popup.md) | Settings popup | REQ-F-010 | TASK-002, TASK-012, TASK-014 | done |

## M3: Backend (week of Nov 30)

| Task | Title | Requirements | Depends on | Status |
| --- | --- | --- | --- | --- |
| [TASK-018](TASK-018-backend-check-endpoint.md) | Backend POST /v1/check | REQ-F-012, REQ-SEC-004, REQ-SEC-005, REQ-SEC-006, REQ-NF-005, REQ-PRV-002 | TASK-001 | in-progress |
| [TASK-019](TASK-019-second-opinion-flow.md) | Second-opinion flow in the extension | REQ-F-009, REQ-PRV-002, REQ-NF-002 | TASK-016, TASK-018 | done |
| [TASK-020](TASK-020-deploy-backend.md) | Deploy backend to the droplet | REQ-SEC-005 | TASK-018 | blocked |

## M4: Evaluate, harden, present (week of Nov 30 to Dec 7)

| Task | Title | Requirements | Depends on | Status |
| --- | --- | --- | --- | --- |
| [TASK-021](TASK-021-demo-sample-page.md) | Demo sample page | REQ-F-013 | TASK-002 | blocked |
| [TASK-022](TASK-022-evaluation-and-threshold.md) | Evaluation set and threshold calibration | REQ-NF-006 | TASK-012, TASK-013 | done |
| [TASK-023](TASK-023-performance-and-sites.md) | Performance and cross-site check | REQ-NF-001, REQ-UI-006 | TASK-015, TASK-016 | done |
| [TASK-025](TASK-025-security-review.md) | Security review before submission | REQ-SEC-002, REQ-SEC-004, REQ-SEC-008, REQ-SEC-009, REQ-PRV-001, REQ-PRV-003 | TASK-017, TASK-019, TASK-020 | todo |
| [TASK-026](TASK-026-presentation.md) | Presentation and demo script | - | TASK-021, TASK-022, TASK-023, TASK-025 | todo |
