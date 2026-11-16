// Service worker: message routing, image fetch, cache and backend calls.
// It is suspended when idle, so it must not rely on in-memory state.
import { bytesToBase64 } from '../shared/base64';
import { ensureOffscreenDocument } from './offscreen-manager';

chrome.runtime.onInstalled.addListener((details) => {
  if (__DEV__) console.debug('[aid] installed:', details.reason);
});

// TASK-004/005 spike plumbing: fetch an image and hand it to the offscreen document.
// Replaced by the typed, validated message contracts of TASK-006 and TASK-008.
interface SpikeRequest {
  type: 'spike:c2pa' | 'spike:detect';
  url: string;
}

function isSpikeRequest(message: unknown): message is SpikeRequest {
  const m = message as Partial<SpikeRequest> | null;
  return (
    typeof m === 'object' &&
    m !== null &&
    (m.type === 'spike:c2pa' || m.type === 'spike:detect') &&
    typeof m.url === 'string'
  );
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !isSpikeRequest(message)) return false;
  void (async () => {
    try {
      const response = await fetch(message.url, { credentials: 'omit' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await ensureOffscreenDocument();
      const result: unknown = await chrome.runtime.sendMessage({
        target: 'offscreen',
        type: message.type,
        mimeType: response.headers.get('content-type')?.split(';')[0] ?? '',
        bytesBase64: bytesToBase64(bytes),
      });
      sendResponse(result);
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : String(error) });
    }
  })();
  return true; // keep the channel open for the async response
});
