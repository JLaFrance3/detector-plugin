---
id: TASK-027
title: Add the deepfake model to the second opinion
status: done
milestone: M3
requirements: [REQ-F-009, REQ-F-012, REQ-NF-005]
depends_on: [TASK-018, TASK-019]
---

# TASK-027: Add the deepfake model to the second opinion

Request Sightengine's `deepfake` model alongside `genai` and show a face-edit score in the popover when it is meaningful (ADR-009).

## Acceptance criteria

- [x] Backend sends `models=genai,deepfake` and returns `deepfake` (0 to 1 or null)
- [x] A missing or malformed deepfake score never fails the check
- [x] Popover adds "N% likely face-edited" to the same line only at 50% or more
- [x] Badge, verdict and cache unchanged
- [x] Record the real `request.operations` per check and adjust `DAILY_CAP` if needed (with TASK-020): 10 per check; cap kept at 100 by the owner
