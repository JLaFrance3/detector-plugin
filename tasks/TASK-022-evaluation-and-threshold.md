---
id: TASK-022
title: Evaluation set and threshold calibration
status: todo
milestone: M4
requirements: [REQ-NF-006]
depends_on: [TASK-012, TASK-013]
---

# TASK-022: Evaluation set and threshold calibration

Build a labeled set of at least 100 images and choose threshold T.

## Acceptance criteria

- [ ] At least 50 AI images from 3+ generators and 50 real photos, plus recompressed copies
- [ ] Script reports false positive rate and detection rate across thresholds
- [ ] T chosen so real-photo FPR <= 5%; T updated in code and requirements
- [ ] Results chart saved for the presentation
