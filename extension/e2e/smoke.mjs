#!/usr/bin/env node
// Smoke test: the built extension loads in Chromium, its service worker registers, the popup
// renders and the content scripts run on a page without errors.
// Usage: npm run e2e:smoke --workspace extension   (after `npm run build`)
import { collectLogs, launch, serve } from './harness.mjs';

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const site = await serve();
const browser = await launch();
try {
  check(browser.serviceWorker.url().endsWith('/service-worker.js'), 'service worker registered');

  const popup = await browser.context.newPage();
  const popupLogs = collectLogs(popup);
  await popup.goto(`chrome-extension://${browser.extensionId}/popup/index.html`);
  const heading = await popup.locator('h1').first().textContent({ timeout: 10000 });
  check((heading ?? '').includes('AI Image Detector'), 'popup renders');
  check(!popupLogs.some((l) => /error/i.test(l)), `popup has no errors ${popupLogs.join(' | ')}`);

  const page = await browser.context.newPage();
  const pageLogs = collectLogs(page);
  await page.goto(`${site.url}/index.html`);
  await page.waitForTimeout(1500);
  check(
    !pageLogs.some((l) => l.startsWith('[pageerror]') || l.startsWith('[error]')),
    `content scripts run without errors ${pageLogs.join(' | ')}`,
  );
} finally {
  await browser.close();
  await site.close();
}

if (failures.length) {
  console.error(`smoke: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('smoke: ok');
