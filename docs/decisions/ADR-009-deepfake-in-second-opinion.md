# ADR-009: Add Sightengine's deepfake model to the cloud second opinion

- **Status:** Accepted, 2026-11-17 (owner approved)
- **Requirements:** REQ-F-009, REQ-F-012, REQ-NF-005
- **Amends:** ADR-006 (same backend and key; one more model per request)

## Context
The second opinion asked Sightengine for its `genai` model only. That model scores whether a whole image was AI-generated. It can miss a real photo in which only a face was swapped or edited. Sightengine's `deepfake` model scores face manipulation and can be requested in the same call (`models=genai,deepfake`). Each model is billed separately, so a check uses more of the free tier (2,000 operations a month, 500 a day).

The owner wants the in-page indicators to stay unintrusive.

## Decision
- The backend requests `genai,deepfake` in one call and returns `{ score, deepfake, provider, checkedAt }`. `score` stays the genai value. `deepfake` is the face-manipulation score, or null when the provider gives none. A missing deepfake score never fails the check.
- The extension adds the face-edit score to the existing popover line only when it is at least 50% (the same value as the verdict threshold T): "Cloud second opinion: 87% likely AI-generated, 88% likely face-edited (Sightengine)". Below that, the line is unchanged.
- Badges, verdicts and the cache are untouched. The second opinion still runs only on a click.

## Consequences
- More operations per check. The backend already logs `request.operations`; after the first real call, lower `DAILY_CAP` if 100 checks a day would exceed 500 operations.
- On images with no face, the deepfake score adds little; it is hidden in that case because it stays low.
- No new permissions, data or endpoints: the same image bytes go to the same fixed URL.
