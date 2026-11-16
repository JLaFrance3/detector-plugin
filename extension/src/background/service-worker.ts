// Service worker: message routing, image fetch, cache and backend calls.
// Chrome suspends it when idle, so durable state lives in chrome.storage; the in-memory
// objects below are only caches and are rebuilt on wake-up.
import type {
  CheckImageResponse,
  ClearCacheResponse,
  PageStateResponse,
  SecondOpinionResponse,
  ServiceWorkerRequest,
} from '../shared/messages';
import { parseAnalyzeResponse, parseServiceWorkerRequest } from '../shared/messages';
import {
  MODEL_STATUS_KEY,
  SETTINGS_KEY,
  hostnameOf,
  isActiveOn,
  parseSettings,
} from '../shared/settings';
import type { Settings } from '../shared/types';
import { DEFAULT_THRESHOLD } from '../shared/types';
import { VerdictCache } from './cache';
import { fetchImageBytes } from './fetch-image';
import { ensureOffscreenDocument } from './offscreen-manager';
import { ImagePipeline } from './pipeline';
import { newInstallToken, prepareUpload, requestSecondOpinion } from './second-opinion';

const INSTALL_TOKEN_KEY = 'installToken';

const cache = new VerdictCache(chrome.storage.local);

const pipeline = new ImagePipeline({
  cacheGet: (url) => cache.get(url),
  cacheSet: (url, signals) => cache.set(url, signals),
  fetchImage: (url) =>
    fetchImageBytes(url, {
      // REQ-F-002: fetch errors are logged in dev builds only.
      onError: (reason) => {
        if (__DEV__) console.debug(`[aid] fetch failed (${reason})`);
      },
    }),
  analyze: async (request) => {
    await ensureOffscreenDocument();
    return parseAnalyzeResponse(await chrome.runtime.sendMessage(request));
  },
  threshold: DEFAULT_THRESHOLD,
});

async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return parseSettings(stored[SETTINGS_KEY]);
}

/** Random per-installation ID, created on first use. Used by the backend for rate limiting. */
async function installToken(): Promise<string> {
  const stored = (await chrome.storage.local.get(INSTALL_TOKEN_KEY))[INSTALL_TOKEN_KEY];
  if (typeof stored === 'string' && /^[0-9a-f]{32}$/.test(stored)) return stored;
  const token = newInstallToken();
  await chrome.storage.local.set({ [INSTALL_TOKEN_KEY]: token });
  return token;
}

async function handle(
  request: ServiceWorkerRequest,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
  switch (request.type) {
    case 'page:state': {
      const settings = await loadSettings();
      const response: PageStateResponse = {
        active: isActiveOn(settings, hostnameOf(sender.url)),
        cloudEnabled: settings.cloudEnabled,
      };
      return response;
    }
    case 'image:check': {
      const settings = await loadSettings();
      // Checked here as well as in the content script: the service worker is the authority.
      const fromPage = sender.tab !== undefined && /^https?:/i.test(sender.url ?? '');
      if (fromPage && !isActiveOn(settings, hostnameOf(sender.url))) {
        return { ok: false, reason: 'inactive' } satisfies CheckImageResponse;
      }
      const result = await pipeline.check(request.url);
      return (
        result ? { ok: true, result } : { ok: false, reason: 'unavailable' }
      ) satisfies CheckImageResponse;
    }
    case 'image:second-opinion': {
      // REQ-F-009: only when the user has switched the feature on, one image per request.
      const unavailable: SecondOpinionResponse = { ok: false, reason: 'unavailable' };
      const settings = await loadSettings();
      if (!settings.cloudEnabled || !isActiveOn(settings, hostnameOf(sender.url))) {
        return unavailable;
      }
      const image = await fetchImageBytes(request.url);
      if (!image) return unavailable;
      // REQ-PRV-002: downscale and strip metadata before anything leaves the browser.
      const upload = await prepareUpload(image.bytes, image.mimeType).catch(() => null);
      if (!upload) return unavailable;
      return requestSecondOpinion(upload, {
        backendUrl: __BACKEND_URL__,
        installToken: await installToken(),
      });
    }
    case 'cache:clear':
      return { ok: true, removed: await cache.clear() } satisfies ClearCacheResponse;
    case 'model:status':
      await chrome.storage.local.set({ [MODEL_STATUS_KEY]: request.status });
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // REQ-SEC-003: validate the schema and the sender; drop everything else silently.
  const request = parseServiceWorkerRequest(message, sender, chrome.runtime.id);
  if (!request) return false;
  handle(request, sender).then(sendResponse, (error: unknown) => {
    if (__DEV__) console.warn('[aid] request failed', request.type, error);
    sendResponse(undefined);
  });
  return true; // keep the channel open for the async response
});

chrome.runtime.onInstalled.addListener(() => {
  void cache.prune();
});
chrome.runtime.onStartup.addListener(() => {
  void cache.prune();
});
