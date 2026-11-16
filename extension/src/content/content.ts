// Content script: finds visible images and asks the in-page UI bundle (ui/main.js, loaded
// first in the same isolated world) to render badges.

if (__DEV__) console.debug('[aid] content script loaded');
