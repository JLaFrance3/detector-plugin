// Service worker: message routing, image fetch, cache and backend calls.
// It is suspended when idle, so it must not rely on in-memory state.

chrome.runtime.onInstalled.addListener((details) => {
  if (__DEV__) console.debug('[aid] installed:', details.reason);
});
