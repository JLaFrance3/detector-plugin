// Content script: finds visible images, asks the service worker for a verdict by URL and has
// the in-page UI bundle (ui/main.js, loaded first in the same isolated world) show a badge.
// It never sees image bytes, only display fields (REQ-SEC-003).
import type { CheckImageRequest, PageStateRequest, SecondOpinionRequest } from '../shared/messages';
import {
  parseCheckImageResponse,
  parsePageStateResponse,
  parseSecondOpinionResponse,
} from '../shared/messages';
import { installPerfLog } from '../shared/perf';
import type { ImageResult } from '../shared/types';
import type { SecondOpinionView } from '../shared/ui-bridge';
import { getInPageUi } from '../shared/ui-bridge';
import { badgeTooltip } from '../shared/verdict';
import { ImageWatcher } from './image-watcher';

/** One request per URL per page, however many <img> elements show it. */
const results = new Map<string, Promise<ImageResult | null>>();
/** The URL each image is currently waiting on or badged for. */
const current = new WeakMap<HTMLImageElement, string>();

async function send(
  message: CheckImageRequest | PageStateRequest | SecondOpinionRequest,
): Promise<unknown> {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    // The extension was reloaded or the service worker is unavailable.
    return undefined;
  }
}

function check(url: string): Promise<ImageResult | null> {
  let pending = results.get(url);
  if (!pending) {
    pending = send({ type: 'image:check', url }).then((reply) => {
      const response = parseCheckImageResponse(reply);
      return response.ok ? response.result : null;
    });
    results.set(url, pending);
  }
  return pending;
}

async function onCandidate(image: HTMLImageElement, url: string): Promise<void> {
  current.set(image, url);
  const result = await check(url);
  // The image may have changed source or left the page while the check ran.
  if (current.get(image) !== url || !image.isConnected) return;
  // No result (the image could not be fetched or checked): nothing to show or re-check.
  if (!result) return;
  // REQ-F-007, ADR-011: a badge for Definite and Likely; a neutral marker, shown only on
  // hover or focus, for None so that a second opinion can be asked for any checked image.
  getInPageUi()?.showBadge(image, { kind: result.verdict, tooltip: badgeTooltip(result), result });
}

/** ADR-009: face-edit scores below this are not shown. Same value as the verdict threshold T. */
const FACE_EDIT_THRESHOLD = 0.5;

const toPercent = (score: number): number => Math.min(99, Math.max(0, Math.floor(score * 100)));

/** REQ-F-009: runs only from a click on the popover button, for that one image. */
async function secondOpinion(image: HTMLImageElement): Promise<SecondOpinionView> {
  const url = current.get(image);
  if (!url) return { status: 'unavailable' };
  const reply = parseSecondOpinionResponse(await send({ type: 'image:second-opinion', url }));
  if (!reply.ok) return { status: 'unavailable' };
  // ADR-009: the face-edit score is shown only when it is meaningful, so most results keep
  // the single short line.
  const faceEdit = reply.deepfake !== null && reply.deepfake >= FACE_EDIT_THRESHOLD;
  return {
    status: 'ok',
    percent: toPercent(reply.score),
    faceEditPercent: faceEdit && reply.deepfake !== null ? toPercent(reply.deepfake) : null,
    provider: reply.provider === 'sightengine' ? 'Sightengine' : 'cloud detector',
  };
}

async function main(): Promise<void> {
  if (__DEV__) installPerfLog(); // timings for the performance check (TASK-023)
  const state = parsePageStateResponse(await send({ type: 'page:state' }));
  if (!state.active) return; // switched off globally or for this site (REQ-F-010)
  if (!getInPageUi()) {
    if (__DEV__) console.warn('[aid] in-page UI bundle is missing');
    return;
  }
  getInPageUi()?.configure({
    cloudEnabled: state.cloudEnabled,
    requestSecondOpinion: secondOpinion,
  });
  const watcher = new ImageWatcher(document, {
    onCandidate: (image, url) => void onCandidate(image, url),
    onSourceChanged: (image) => {
      current.delete(image);
      getInPageUi()?.removeBadge(image);
    },
  });
  watcher.start();
  if (__DEV__) console.debug('[aid] watching images');
}

void main();
