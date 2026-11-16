// In-page UI bundle. Loaded as a content script before content.js (see manifest.json).
// It registers a small API for the content script and starts Angular only when the first
// badge is needed, so pages without flagged images pay almost nothing.
import { createComponent } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import type { BadgeView, InPageUi } from '../../../src/shared/ui-bridge';
import { UI_HOST_TAG, registerInPageUi } from '../../../src/shared/ui-bridge';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { OverlayStore } from './app/overlay-store';

// The host element lives in the page's DOM, so page CSS can target it. `!important` rules in
// a shadow tree's :host beat the page's `!important` rules, which keeps the host inert.
const HOST_CSS = `
  :host {
    all: initial !important;
    position: absolute !important;
    top: 0 !important;
    left: 0 !important;
    width: 0 !important;
    height: 0 !important;
    overflow: visible !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
  }
`;

let starting: Promise<OverlayStore> | undefined;

async function start(): Promise<OverlayStore> {
  const host = document.createElement(UI_HOST_TAG);
  // Closed: page scripts cannot reach the UI through host.shadowRoot (ADR-005).
  const shadow = host.attachShadow({ mode: 'closed' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(HOST_CSS);
  shadow.adoptedStyleSheets = [sheet];
  const mount = document.createElement('div');
  shadow.append(mount);
  document.documentElement.append(host);

  // Zoneless application with no root component; components are attached by hand.
  const app = await createApplication(appConfig);
  const root = createComponent(App, { environmentInjector: app.injector, hostElement: mount });
  app.attachView(root.hostView);
  return app.injector.get(OverlayStore);
}

function store(): Promise<OverlayStore> {
  starting ??= start();
  return starting;
}

const ui: InPageUi = {
  showBadge(image: HTMLImageElement, view: BadgeView): void {
    void store().then((s) => s.show(image, view));
  },
  removeBadge(image: HTMLImageElement): void {
    // Nothing to remove if the UI never started.
    void starting?.then((s) => s.remove(image));
  },
};

registerInPageUi(ui);
