---
id: TASK-003
title: Spike: Angular rendering in a content script shadow root
status: done
milestone: M0
requirements: [REQ-UI-006, REQ-SEC-002]
depends_on: [TASK-002]
---

# TASK-003: Spike: Angular rendering in a content script shadow root

Prove ADR-005: bootstrap zoneless Angular with `createApplication` in the content script and render a test component into a closed shadow root on any page.

## Acceptance criteria

- [x] A test badge renders on 3 different sites with identical styling
- [x] No `customElements` usage
- [x] Bundle size of the content script recorded in this ticket

## Notes

If this fails, record findings and propose an alternative ADR before continuing.

## Findings (2026-11-15)

ADR-005 holds. No alternative ADR is needed.

- **Works:** zoneless Angular 22 started with `createApplication`, root component attached with `createComponent` to a host element inside a closed shadow root. Verified by `extension/e2e/spike-shadow-root.mjs` on a local page with hostile CSS, en.wikipedia.org, github.com (strict CSP) and bbc.com. The chip's pixels match across all four (mean difference 2 to 3 of 255, from sub-pixel image positions).
- **Bundle size:** `ui/main.js` 113.6 kB raw (about 34.5 kB compressed); `content.js` 0.3 kB (spike stub).
- **No `customElements`:** the host is a plain unknown element (`<aid-ui-host>`); nothing is registered.
- **Styles:** Angular puts component styles in the page's `<head>` unless the component uses `ViewEncapsulation.ShadowDom`. So the root component uses ShadowDom encapsulation (an open shadow root nested inside our closed one) and is the only component allowed to declare styles; children add their rules to `app.css`. The spike checks that no style leaks into the page.
- **Host hardening:** page CSS can target the host element, so the closed root adopts a stylesheet with `:host { all: initial !important; ... }`. Shadow-tree `!important` rules win over page `!important` rules.
- **Module format:** the Angular CLI emits an ES module but manifest content scripts are classic scripts. `scripts/build.mjs` wraps `ui/main.js` in a strict IIFE and `check-dist` verifies every content script parses as a classic script.
- **Loading:** `ui/main.js` and `content.js` are both manifest content scripts sharing the isolated world; Angular starts lazily on the first badge.
- **Page CSP:** not a problem; styles reach the shadow root on github.com.

- **Update (TASK-006 to TASK-012):** the spike script was replaced by `extension/e2e/pipeline.mjs` (`npm run e2e`), which exercises the production code path. The spike script is in the git history at the commit for this task.
