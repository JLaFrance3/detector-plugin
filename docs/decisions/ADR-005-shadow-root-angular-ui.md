# ADR-005: Mount Angular components in a closed shadow root

- **Status:** Accepted, 2026-11-04
- **Requirements:** REQ-UI-001 to REQ-UI-006, REQ-SEC-002

## Context
The badge and popover appear on arbitrary, possibly hostile web pages. Page CSS must not restyle them, and page scripts should not reach into them. Angular Elements (custom elements) was considered, but `customElements` is unavailable in a content script's isolated world.

## Decision
Bootstrap zoneless Angular with `createApplication`, then render components with `createComponent` into a host element inside a closed shadow root that the content script attaches to the page.

## Consequences
- Styles are isolated; the UI looks the same on every site.
- Zoneless keeps the injected bundle smaller and avoids patching page APIs.
- One Angular application instance per page, rendering many badges.
