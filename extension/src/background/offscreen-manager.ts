// Creates the single offscreen document on demand and reuses it (ADR-004).

const OFFSCREEN_PATH = 'offscreen/offscreen.html';

let creating: Promise<void> | undefined;

export async function ensureOffscreenDocument(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_PATH)],
  });
  if (contexts.length > 0) return;

  // The service worker can receive several requests at once; create only one document.
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification:
        'Reads C2PA Content Credentials and runs the on-device AI image detector in WebAssembly workers.',
    })
    .finally(() => {
      creating = undefined;
    });
  await creating;
}
