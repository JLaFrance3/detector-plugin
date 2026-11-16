// REQ-F-009: cloud second opinion. Runs only when the user clicks the button for one image.
// REQ-PRV-002: before upload the image is downscaled to at most 1024 px on its long side and
// re-encoded, which drops all metadata (EXIF, XMP, C2PA, GPS position, camera serial).
import type { SecondOpinionResponse } from '../shared/messages';
import { parseSecondOpinionResponse } from '../shared/messages';

export const MAX_UPLOAD_SIDE = 1024;
const UPLOAD_TIMEOUT_MS = 20_000;
const UNAVAILABLE: SecondOpinionResponse = { ok: false, reason: 'unavailable' };

/** Size that fits inside `max` on the long side, keeping the aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, max = MAX_UPLOAD_SIDE) {
  const longest = Math.max(width, height);
  if (!(longest > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, max / longest);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Decodes the image and draws it onto a canvas at the reduced size, then encodes a fresh
 * JPEG. Only pixels survive this, so no metadata from the original file is uploaded.
 */
export async function prepareUpload(
  bytes: Uint8Array<ArrayBuffer>,
  mimeType: string,
): Promise<Blob> {
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }));
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d context');
    // JPEG has no transparency: paint white first so transparent areas do not turn black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  } finally {
    bitmap.close();
  }
}

/** True for https URLs, and for http on this machine only (local development). */
export function isAllowedBackendUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    return parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export interface SecondOpinionDeps {
  /** Base URL of the backend; empty when the build has none (REQ-NF-002). */
  backendUrl: string;
  installToken: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Sends one prepared image to the backend. Every failure (no backend configured, offline,
 * rate limited, over quota, malformed reply) is reported as "unavailable"; the rest of the
 * extension is unaffected.
 */
export async function requestSecondOpinion(
  image: Blob,
  deps: SecondOpinionDeps,
): Promise<SecondOpinionResponse> {
  if (!deps.backendUrl || !isAllowedBackendUrl(deps.backendUrl)) return UNAVAILABLE;
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const response = await fetchFn(new URL('/v1/check', deps.backendUrl).href, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'x-install-token': deps.installToken },
      body: image,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'error',
      signal: AbortSignal.timeout(deps.timeoutMs ?? UPLOAD_TIMEOUT_MS),
    });
    if (!response.ok) return UNAVAILABLE;
    return parseSecondOpinionResponse(await response.json());
  } catch {
    return UNAVAILABLE;
  }
}

/** A random identifier for this installation, used by the backend only for rate limiting. */
export function newInstallToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
