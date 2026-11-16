---
id: TASK-014
title: Verdict cache
status: todo
milestone: M1
requirements: [REQ-F-011, REQ-PRV-004]
depends_on: [TASK-013]
---

# TASK-014: Verdict cache

Cache verdicts in `chrome.storage.local` keyed by SHA-256 of the image URL, with a 7-day TTL and a clear function.

## Acceptance criteria

- [ ] Cached images are not refetched within 7 days
- [ ] Expired entries ignored and pruned
- [ ] `clearCache()` removes all verdicts
