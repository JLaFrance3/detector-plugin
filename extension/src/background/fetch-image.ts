// REQ-F-002: fetches an image's bytes in the service worker using the extension's host
// permissions. Any failure (network error, HTTP error, timeout, not an image, too large)
// yields null, which the caller turns into verdict None with no badge.
import { exceedsPixelLimit } from '../shared/image-size';
import { MAX_IMAGE_BYTES } from '../shared/messages';

export const FETCH_TIMEOUT_MS = 10_000;

export interface FetchedImage {
  bytes: Uint8Array<ArrayBuffer>;
  /** Type detected from the file's first bytes, not the Content-Type header. */
  mimeType: string;
}

export interface FetchOptions {
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
  /** Called with a short reason when the fetch fails (logged in dev builds only). */
  onError?: (reason: string) => void;
}

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, i) => bytes[offset + i] === byte);

const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));

/**
 * Detects a raster image format from its magic bytes. Returns null for anything else,
 * including SVG and HTML, whatever the server's Content-Type claims.
 */
export function sniffImageType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  if (startsWith(bytes, ascii('GIF87a')) || startsWith(bytes, ascii('GIF89a'))) return 'image/gif';
  if (startsWith(bytes, ascii('ftyp'), 4)) {
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
    if (['heic', 'heix', 'mif1', 'msf1'].includes(brand)) return 'image/heic';
  }
  return null;
}

/** Reads a response body, giving up as soon as it exceeds `maxBytes`. */
async function readCapped(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    return buffer.byteLength > maxBytes ? null : new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function fetchImageBytes(
  url: string,
  options: FetchOptions = {},
): Promise<FetchedImage | null> {
  const {
    fetchFn = fetch,
    timeoutMs = FETCH_TIMEOUT_MS,
    maxBytes = MAX_IMAGE_BYTES,
    onError,
  } = options;
  const controller = new AbortController();
  // One deadline for the whole exchange, body included.
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, {
      method: 'GET',
      signal: controller.signal,
      // Never send the user's cookies or a referrer for an image check.
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow',
    });
    if (!response.ok) {
      onError?.(`HTTP ${response.status}`);
      return null;
    }
    const bytes = await readCapped(response, maxBytes);
    if (!bytes) {
      onError?.('larger than the size limit');
      return null;
    }
    const mimeType = sniffImageType(bytes);
    if (!mimeType) {
      onError?.('not a supported image format');
      return null;
    }
    // A decompression bomb: few bytes, enormous canvas. Never hand it to a decoder.
    if (exceedsPixelLimit(bytes)) {
      onError?.('too many pixels');
      return null;
    }
    return { bytes, mimeType };
  } catch (error) {
    onError?.(controller.signal.aborted ? 'timed out' : `network error: ${String(error)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
