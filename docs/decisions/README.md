# Architecture Decision Records

Short records of decisions and why they were made. Format: Status, Context, Decision, Consequences. Add a new ADR rather than editing an accepted one; mark the old one "Superseded by ADR-NNN".

| ADR | Decision | Status |
| --- | --- | --- |
| [001](ADR-001-layered-image-check.md) | Images only, layered check: provenance first, detector second | Accepted |
| [002](ADR-002-angular-cli-over-wxt.md) | Angular CLI + esbuild instead of WXT | Accepted |
| [003](ADR-003-on-device-detector.md) | On-device detector by default; cloud only on click | Accepted |
| [004](ADR-004-offscreen-document.md) | Run C2PA and the model in an offscreen document | Accepted |
| [005](ADR-005-shadow-root-angular-ui.md) | Mount Angular components in a closed shadow root, not Angular Elements | Accepted |
| [006](ADR-006-backend-holds-api-key.md) | Optional Node/Fastify backend holds the Sightengine key | Accepted |
| [007](ADR-007-local-tickets-traceability.md) | Local markdown tickets with REQ/TASK traceability | Accepted |
| [008](ADR-008-corrected-detector-weights.md) | Use the corrected upstream detector weights, pinned to a revision (amends 003) | Proposed |
| [009](ADR-009-deepfake-in-second-opinion.md) | Add Sightengine's deepfake model to the cloud second opinion (amends 006) | Accepted |
| [010](ADR-010-multi-view-detector.md) | Score several views of each image and keep the highest (amends 003) | Accepted |
| [011](ADR-011-neutral-marker.md) | Neutral marker on unflagged images, shown on hover (amends REQ-F-007) | Accepted |
