---
id: TASK-014
title: Verdict cache
status: done
milestone: M1
requirements: [REQ-F-011, REQ-PRV-004]
depends_on: [TASK-013]
---

# TASK-014: Verdict cache

Cache verdicts in `chrome.storage.local` keyed by SHA-256 of the image URL, with a 7-day TTL and a clear function.

## Acceptance criteria

- [x] Cached images are not refetched within 7 days
- [x] Expired entries ignored and pruned
- [x] `clearCache()` removes all verdicts

## Notes from implementation (2026-11-16)

- The cache stores the signals, not the verdict, so a recalibrated threshold applies to cached images as well.
- Entries are pruned when the browser starts and when the extension is installed or updated; the cache is capped at 5000 entries.
- Keys are `v1:` plus the SHA-256 hex of the URL, so image URLs are not stored in readable form.
