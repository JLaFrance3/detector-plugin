// Client for Sightengine's AI-generated image model (REQ-F-012).
// The API credentials come from the environment and are only ever sent to Sightengine
// (REQ-SEC-004). The endpoint URL is a constant: nothing a client sends can change where
// this service connects to (REQ-SEC-006).
import type { AllowedImageType } from './image.js';

const ENDPOINT = 'https://api.sightengine.com/1.0/check.json';
const TIMEOUT_MS = 15_000;

export interface ProviderResult {
  /** Probability from 0 to 1 that the image is AI-generated. */
  score: number;
  /** Operations Sightengine billed for this check, when reported (REQ-NF-005 open item). */
  operations: number | null;
}

export interface Provider {
  readonly name: string;
  check(bytes: Uint8Array<ArrayBuffer>, type: AllowedImageType): Promise<ProviderResult>;
}

export class ProviderError extends Error {}

const extension: Record<AllowedImageType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Reads `type.ai_generated` from a Sightengine response and clamps it to 0..1. */
export function normalizeScore(body: unknown): ProviderResult {
  const data = body as {
    status?: unknown;
    type?: { ai_generated?: unknown };
    request?: { operations?: unknown };
  } | null;
  const score = data?.type?.ai_generated;
  if (data?.status !== 'success' || typeof score !== 'number' || !Number.isFinite(score)) {
    throw new ProviderError('unexpected provider response');
  }
  const operations = data.request?.operations;
  return {
    score: Math.min(1, Math.max(0, score)),
    operations: typeof operations === 'number' ? operations : null,
  };
}

export function createSightengine(
  credentials: { apiUser: string; apiSecret: string },
  fetchFn: typeof fetch = fetch,
): Provider {
  return {
    name: 'sightengine',
    async check(bytes, type) {
      const form = new FormData();
      form.set('models', 'genai');
      form.set('api_user', credentials.apiUser);
      form.set('api_secret', credentials.apiSecret);
      form.set('media', new Blob([bytes], { type }), `image.${extension[type]}`);

      let response: Response;
      try {
        response = await fetchFn(ENDPOINT, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
          redirect: 'error',
        });
      } catch {
        // Never include the cause: it could echo request details.
        throw new ProviderError('provider unreachable');
      }
      if (!response.ok) throw new ProviderError(`provider returned HTTP ${response.status}`);
      return normalizeScore(await response.json().catch(() => null));
    },
  };
}
