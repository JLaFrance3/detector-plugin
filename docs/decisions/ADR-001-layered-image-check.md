# ADR-001: Images only, layered check with provenance first

- **Status:** Accepted, 2026-11-04
- **Requirements:** REQ-F-003, REQ-F-004, REQ-F-005, REQ-F-006

## Context
Several AI providers now label output. Google (SynthID, plus C2PA), OpenAI (C2PA plus SynthID since May 2026), Adobe and Meta (C2PA/IPTC) and Anthropic (C2PA on generated files since Aug 2026) all mark some images. Only C2PA metadata can be verified by third parties; invisible watermarks need the owner's detector. Metadata is stripped by screenshots and most social media re-uploads. AI-text detection is a separate, harder problem with known false-positive issues.

## Decision
Check images only. For each image, use the strongest available evidence first:
1. A valid, trusted C2PA manifest declaring AI generation gives a **Definite** verdict.
2. Otherwise, unsigned IPTC/XMP AI tags or an on-device detector score above the threshold give a **Likely** verdict.
3. Otherwise, show nothing. Never claim an image is real.

## Consequences
- Definite results will be rare on social sites, so the demo needs a sample page (REQ-F-013).
- The extension cannot detect SynthID or other invisible watermarks; it links to the official checkers instead.
- Text detection is out of scope.
