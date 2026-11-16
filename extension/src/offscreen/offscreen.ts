// Offscreen document: hosts the C2PA reader and the on-device detector (ADR-004).
// It accepts one message, `analyze`, and only from this extension's service worker
// (REQ-SEC-003). It has no access to chrome.storage; status goes to the service worker.
import { base64ToBytes } from '../shared/base64';
import type { AnalyzeResponse, ModelStatusChanged } from '../shared/messages';
import { parseOffscreenRequest } from '../shared/messages';
import { installPerfLog } from '../shared/perf';
import { analyzeImage } from './analyze';
import { readC2pa } from './c2pa-reader';
import { DetectorService } from './detector-service';

const detector = new DetectorService((status) => {
  const message: ModelStatusChanged = { type: 'model:status', status };
  // The service worker may be starting up; a lost status update is harmless.
  chrome.runtime.sendMessage(message).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  const request = parseOffscreenRequest(message, sender, chrome.runtime.id);
  if (!request) return false; // invalid or foreign: drop without replying

  void (async () => {
    let response: AnalyzeResponse = { ok: false };
    try {
      const signals = await analyzeImage(base64ToBytes(request.bytesBase64), request.mimeType, {
        readC2pa,
        scoreImage: (blob) => detector.score(blob),
      });
      response = { ok: true, signals };
    } catch (error) {
      if (__DEV__) console.warn('[aid] analyze failed', error);
    }
    sendResponse(response);
  })();
  return true; // keep the channel open for the async response
});

if (__DEV__) installPerfLog(); // timings for the performance check (TASK-023)
void detector.reportInitialStatus();
if (__DEV__) console.debug('[aid] offscreen document loaded');
