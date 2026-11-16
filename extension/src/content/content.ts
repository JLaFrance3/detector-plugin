// Content script: finds visible images and asks the in-page UI bundle (ui/main.js, loaded
// first in the same isolated world) to render badges.
import { getInPageUi } from '../shared/ui-bridge';

// TASK-003 spike: put a test badge on every reasonably large image to prove that Angular
// renders inside a closed shadow root on arbitrary pages. Replaced by real image discovery
// and verdicts in TASK-007 and TASK-015.
function spikeBadges(): void {
  const ui = getInPageUi();
  if (!ui) {
    if (__DEV__) console.warn('[aid] in-page UI bundle is missing');
    return;
  }
  for (const image of document.images) {
    const rect = image.getBoundingClientRect();
    if (rect.width < 128 || rect.height < 128) continue;
    ui.showBadge(image, { kind: 'definite', tooltip: 'AI-generated (Content Credentials)' });
  }
}

spikeBadges();
