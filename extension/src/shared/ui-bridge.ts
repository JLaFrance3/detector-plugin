// Contract between the content script (content.js) and the in-page UI bundle (ui/main.js).
// Both run as content scripts in the same isolated world, so they share `globalThis`.
// Only display-ready, sanitized fields cross this boundary (REQ-SEC-003).

export type BadgeKind = 'definite' | 'likely';

export interface BadgeView {
  kind: BadgeKind;
  /** Tooltip and accessible name, e.g. "AI-generated (Content Credentials)". */
  tooltip: string;
}

export interface InPageUi {
  /** Shows or updates the badge for an image. Starts the UI on first use. */
  showBadge(image: HTMLImageElement, view: BadgeView): void;
  /** Removes the badge for an image, if any. */
  removeBadge(image: HTMLImageElement): void;
}

/** Name of the global that ui/main.js defines for content.js. */
export const UI_GLOBAL = '__aidUi';

export function getInPageUi(): InPageUi | undefined {
  return (globalThis as { [UI_GLOBAL]?: InPageUi })[UI_GLOBAL];
}

export function registerInPageUi(ui: InPageUi): void {
  Object.defineProperty(globalThis, UI_GLOBAL, { value: ui, configurable: false, writable: false });
}
