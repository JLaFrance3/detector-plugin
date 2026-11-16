// Contract between the content script (content.js) and the in-page UI bundle (ui/main.js).
// Both run as content scripts in the same isolated world, so they share `globalThis`.
// Only display-ready, sanitized fields cross this boundary (REQ-SEC-003).
import type { ImageResult } from './types';

export type BadgeKind = 'definite' | 'likely';

export interface BadgeView {
  kind: BadgeKind;
  /** Tooltip and accessible name, e.g. "AI-generated (Content Credentials)". */
  tooltip: string;
  /** Verdict and evidence for the details popover. */
  result: ImageResult;
}

/** Outcome of a cloud second opinion, ready to display (REQ-F-009). */
export type SecondOpinionView =
  { status: 'ok'; percent: number; provider: string } | { status: 'unavailable' };

export interface UiOptions {
  /** Whether the user has switched the cloud second opinion on (off by default). */
  cloudEnabled: boolean;
  /** Asks for a second opinion on one image. Called only from a click on its button. */
  requestSecondOpinion(image: HTMLImageElement): Promise<SecondOpinionView>;
}

export interface InPageUi {
  /** Sets page-wide options. May be called before the first badge. */
  configure(options: UiOptions): void;
  /** Shows or updates the badge for an image. Starts the UI on first use. */
  showBadge(image: HTMLImageElement, view: BadgeView): void;
  /** Removes the badge for an image, if any. */
  removeBadge(image: HTMLImageElement): void;
}

/** Tag of the element that hosts the UI's closed shadow root. Not a custom element. */
export const UI_HOST_TAG = 'aid-ui-host';

/** Name of the global that ui/main.js defines for content.js. */
export const UI_GLOBAL = '__aidUi';

export function getInPageUi(): InPageUi | undefined {
  return (globalThis as { [UI_GLOBAL]?: InPageUi })[UI_GLOBAL];
}

export function registerInPageUi(ui: InPageUi): void {
  Object.defineProperty(globalThis, UI_GLOBAL, { value: ui, configurable: false, writable: false });
}
