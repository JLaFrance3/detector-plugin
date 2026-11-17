// REQ-SEC-003: every runtime message is defined here, validated against its schema on
// receipt, and accepted only from the part of this extension that is allowed to send it.
// Validators rebuild the value field by field, so unknown properties never pass through.
//
// Flow:  content script --image:check--> service worker --analyze--> offscreen document
// Image bytes travel only from the service worker to the offscreen document. Content scripts
// send a URL and receive display fields, never bytes (REQ-SEC-003).
import { sanitizeText } from './sanitize-text';
import type {
  AiSource,
  C2paSignal,
  Confidence,
  ImageResult,
  ImageSignals,
  ModelStatus,
  Verdict,
} from './types';

// --- Limits ----------------------------------------------------------------------------------

/** Longest http(s) image URL accepted from a page. */
export const MAX_URL_LENGTH = 8192;
/** REQ-F-001: data: URL images up to 20 MB are checked. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** Base64 expands bytes by 4/3; allow for the "data:image/...;base64," prefix as well. */
export const MAX_DATA_URL_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 128;
const MAX_BASE64_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 4;

// --- Message types ---------------------------------------------------------------------------

/** Content script -> service worker: check one image by URL. */
export interface CheckImageRequest {
  type: 'image:check';
  url: string;
}

/** Content script -> service worker: is the extension active on this page? */
export interface PageStateRequest {
  type: 'page:state';
}

/** Popup -> service worker: remove all cached verdicts (REQ-F-010). */
export interface ClearCacheRequest {
  type: 'cache:clear';
}

/** Offscreen document -> service worker: the detector model's status changed. */
export interface ModelStatusChanged {
  type: 'model:status';
  status: ModelStatus;
}

/**
 * Content script -> service worker: the user clicked "Get a second opinion" for one image
 * (REQ-F-009). Still only a URL; the service worker fetches and uploads the bytes.
 */
export interface SecondOpinionRequest {
  type: 'image:second-opinion';
  url: string;
}

export type ServiceWorkerRequest =
  | CheckImageRequest
  | PageStateRequest
  | ClearCacheRequest
  | ModelStatusChanged
  | SecondOpinionRequest;

/** Result of a cloud second opinion. `unavailable` covers offline, over quota and disabled. */
export type SecondOpinionResponse =
  | {
      ok: true;
      score: number;
      /** Face-manipulation score from 0 to 1, or null when the backend gave none (ADR-009). */
      deepfake: number | null;
      provider: string;
      checkedAt: string;
    }
  | { ok: false; reason: 'unavailable' };

/** Service worker -> offscreen document: analyze one image's bytes. */
export interface AnalyzeRequest {
  target: 'offscreen';
  type: 'analyze';
  mimeType: string;
  bytesBase64: string;
}

export type OffscreenRequest = AnalyzeRequest;

export type CheckImageResponse =
  { ok: true; result: ImageResult } | { ok: false; reason: 'inactive' | 'unavailable' };

export interface PageStateResponse {
  active: boolean;
  cloudEnabled: boolean;
}

export type AnalyzeResponse = { ok: true; signals: ImageSignals } | { ok: false };

export interface ClearCacheResponse {
  ok: boolean;
  removed: number;
}

// --- Senders ---------------------------------------------------------------------------------

/** The parts of chrome.runtime.MessageSender that matter, so this module stays testable. */
export interface SenderLike {
  id?: string;
  url?: string;
  origin?: string;
  tab?: unknown;
}

export type SenderKind = 'content-script' | 'popup' | 'offscreen' | 'service-worker' | 'foreign';

const OFFSCREEN_PATH = '/offscreen/offscreen.html';

/**
 * Works out which part of this extension sent a message. Anything that does not carry this
 * extension's ID is foreign and must be dropped.
 */
export function classifySender(sender: SenderLike | undefined, extensionId: string): SenderKind {
  if (!sender || typeof sender.id !== 'string' || sender.id !== extensionId) return 'foreign';
  const base = `chrome-extension://${extensionId}`;
  const { url } = sender;
  if (typeof url === 'string' && url !== '') {
    if (url === `${base}${OFFSCREEN_PATH}`) return 'offscreen';
    if (url.startsWith(`${base}/popup/`)) return 'popup';
    // The service worker reports its own script URL.
    if (url === `${base}/service-worker.js`) return 'service-worker';
    if (url.startsWith(`${base}/`)) return 'foreign'; // no other extension page sends messages
    // A content script reports the URL of the page it runs in and always has a tab.
    return sender.tab !== undefined && /^https?:\/\//i.test(url) ? 'content-script' : 'foreign';
  }
  // No URL and no tab: the service worker.
  return sender.tab === undefined ? 'service-worker' : 'foreign';
}

// --- Primitive checks ------------------------------------------------------------------------

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const textOrNull = (v: unknown, max?: number): string | null =>
  v === null || v === undefined ? null : sanitizeText(v, max);

/** REQ-F-001: only http(s) images and data: URL images (not SVG) can be checked. */
export function isCheckableImageUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url === '') return false;
  if (/^data:/i.test(url)) {
    if (url.length > MAX_DATA_URL_LENGTH) return false;
    const mime = /^data:(image\/[a-z0-9.+-]+)[;,]/i.exec(url)?.[1]?.toLowerCase();
    return mime !== undefined && mime !== 'image/svg+xml';
  }
  if (url.length > MAX_URL_LENGTH) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const MIME_TYPE = /^[a-z]+\/[a-z0-9.+-]{1,60}$/;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// --- Requests --------------------------------------------------------------------------------

/**
 * Validates a message arriving at the service worker and checks that its sender may send it.
 * Returns null for anything else; the caller drops it without replying.
 */
export function parseServiceWorkerRequest(
  message: unknown,
  sender: SenderLike | undefined,
  extensionId: string,
): ServiceWorkerRequest | null {
  if (!isObject(message)) return null;
  const from = classifySender(sender, extensionId);
  switch (message['type']) {
    case 'image:check':
      // Popup allowed so that extension pages (and tests) can request a check too.
      if (from !== 'content-script' && from !== 'popup') return null;
      return isCheckableImageUrl(message['url'])
        ? { type: 'image:check', url: message['url'] }
        : null;
    case 'page:state':
      return from === 'content-script' ? { type: 'page:state' } : null;
    case 'image:second-opinion':
      // Only from a page the user is looking at, where the click happened.
      if (from !== 'content-script') return null;
      return isCheckableImageUrl(message['url'])
        ? { type: 'image:second-opinion', url: message['url'] }
        : null;
    case 'cache:clear':
      // Never from a content script: a page must not be able to wipe the cache.
      return from === 'popup' ? { type: 'cache:clear' } : null;
    case 'model:status': {
      if (from !== 'offscreen') return null;
      const status = parseModelStatus(message['status']);
      return status ? { type: 'model:status', status } : null;
    }
    default:
      return null;
  }
}

/** Validates a message arriving at the offscreen document. Only the service worker may send. */
export function parseOffscreenRequest(
  message: unknown,
  sender: SenderLike | undefined,
  extensionId: string,
): OffscreenRequest | null {
  if (!isObject(message) || message['target'] !== 'offscreen') return null;
  if (classifySender(sender, extensionId) !== 'service-worker') return null;
  if (message['type'] !== 'analyze') return null;
  const mimeType = message['mimeType'];
  const bytesBase64 = message['bytesBase64'];
  if (typeof mimeType !== 'string' || (mimeType !== '' && !MIME_TYPE.test(mimeType))) return null;
  if (
    typeof bytesBase64 !== 'string' ||
    bytesBase64 === '' ||
    bytesBase64.length > MAX_BASE64_LENGTH ||
    !BASE64.test(bytesBase64)
  ) {
    return null;
  }
  return { target: 'offscreen', type: 'analyze', mimeType, bytesBase64 };
}

// --- Responses and payloads ------------------------------------------------------------------

export function parseModelStatus(value: unknown): ModelStatus | null {
  if (!isObject(value)) return null;
  switch (value['state']) {
    case 'not-downloaded':
      return { state: 'not-downloaded' };
    case 'error':
      return { state: 'error' };
    case 'downloading': {
      const percent = value['percent'];
      return typeof percent === 'number' && percent >= 0 && percent <= 100
        ? { state: 'downloading', percent: Math.round(percent) }
        : null;
    }
    case 'ready': {
      const device = value['device'];
      return device === 'webgpu' || device === 'wasm' ? { state: 'ready', device } : null;
    }
    default:
      return null;
  }
}

const aiSourceOrNull = (v: unknown): AiSource | null =>
  v === 'generated' || v === 'edited' ? v : null;

function parseC2pa(value: unknown): C2paSignal | null {
  if (!isObject(value) || !isBool(value['present'])) return null;
  const valid = value['valid'] === true;
  return {
    present: value['present'],
    valid,
    // "trusted" is meaningless without "valid" (REQ-SEC-007).
    trusted: valid && value['trusted'] === true,
    signer: textOrNull(value['signer']),
    tool: textOrNull(value['tool']),
    signedAt: textOrNull(value['signedAt'], 40),
    aiSource: aiSourceOrNull(value['aiSource']),
    cameraCapture: value['cameraCapture'] === true,
    failureReason: textOrNull(value['failureReason'], 80),
  };
}

/** Validates the signals the offscreen document returns. Null when malformed. */
export function parseSignals(value: unknown): ImageSignals | null {
  if (!isObject(value)) return null;
  const rawIptc = value['iptc'];
  const rawDetector = value['detector'];
  let detector: ImageSignals['detector'] = null;
  if (isObject(rawDetector)) {
    const score = rawDetector['score'];
    if (typeof score !== 'number' || !(score >= 0 && score <= 1)) return null;
    detector = { score };
  }
  return {
    c2pa: value['c2pa'] === null || value['c2pa'] === undefined ? null : parseC2pa(value['c2pa']),
    iptc: isObject(rawIptc) ? { aiSource: aiSourceOrNull(rawIptc['aiSource']) } : null,
    detector,
  };
}

export function parseAnalyzeResponse(value: unknown): AnalyzeResponse {
  if (!isObject(value) || value['ok'] !== true) return { ok: false };
  const signals = parseSignals(value['signals']);
  return signals ? { ok: true, signals } : { ok: false };
}

const LABELS = new Set(['AI-generated', 'AI-edited', 'Likely AI']);

function parseConfidence(value: unknown): Confidence | null {
  if (!isObject(value)) return null;
  if (value['kind'] === 'credentials' || value['kind'] === 'metadata')
    return { kind: value['kind'] };
  const percent = value['percent'];
  return value['kind'] === 'score' &&
    typeof percent === 'number' &&
    Number.isInteger(percent) &&
    percent >= 0 &&
    percent <= 99
    ? { kind: 'score', percent }
    : null;
}

/** Validates an image result (from the service worker or from the cache). */
export function parseImageResult(value: unknown): ImageResult | null {
  if (!isObject(value)) return null;
  const verdict = value['verdict'];
  if (verdict !== 'definite' && verdict !== 'likely' && verdict !== 'none') return null;
  const signals = parseSignals(value['signals']);
  if (!signals) return null;
  const label = value['label'];
  const confidence = parseConfidence(value['confidence']);
  const flagged = verdict !== 'none';
  // A flagged image must come with a known label and a confidence; None with neither.
  if (flagged && (typeof label !== 'string' || !LABELS.has(label) || !confidence)) return null;
  return {
    verdict: verdict satisfies Verdict,
    label: flagged ? (label as string) : null,
    confidence: flagged ? confidence : null,
    signals,
    cameraCaptureContext: value['cameraCaptureContext'] === true,
  };
}

/** Validates the service worker's reply to image:check in the content script. */
export function parseCheckImageResponse(value: unknown): CheckImageResponse {
  if (isObject(value) && value['ok'] === true) {
    const result = parseImageResult(value['result']);
    if (result) return { ok: true, result };
  }
  const reason = isObject(value) && value['reason'] === 'inactive' ? 'inactive' : 'unavailable';
  return { ok: false, reason };
}

export function parsePageStateResponse(value: unknown): PageStateResponse {
  return isObject(value)
    ? { active: value['active'] === true, cloudEnabled: value['cloudEnabled'] === true }
    : { active: false, cloudEnabled: false };
}

/** Cloud providers the backend may report. Anything else is not shown. */
const PROVIDERS = new Set(['sightengine']);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/**
 * Validates a second-opinion result: the backend reply in the service worker, and the
 * service worker reply in the content script. Anything malformed counts as unavailable.
 */
export function parseSecondOpinionResponse(value: unknown): SecondOpinionResponse {
  if (isObject(value) && value['ok'] !== false) {
    const { score, deepfake, provider, checkedAt } = value;
    if (
      typeof score === 'number' &&
      score >= 0 &&
      score <= 1 &&
      typeof provider === 'string' &&
      PROVIDERS.has(provider) &&
      typeof checkedAt === 'string' &&
      ISO_INSTANT.test(checkedAt)
    ) {
      // The deepfake score is optional: anything but a 0 to 1 number is dropped, not fatal.
      const face = typeof deepfake === 'number' && deepfake >= 0 && deepfake <= 1 ? deepfake : null;
      return { ok: true, score, deepfake: face, provider, checkedAt };
    }
  }
  return { ok: false, reason: 'unavailable' };
}
