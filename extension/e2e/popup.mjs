#!/usr/bin/env node
// End-to-end check of the settings popup (REQ-F-010): settings persist across a browser
// restart, switching a site off stops scanning there after a reload, and the popup reflects
// model status changes live.
// Usage: npm run e2e:popup --workspace extension   (after `npm run build`)
import { join } from 'node:path';
import { checker, findInExtensionUi, launch, outputDir, serve, waitFor } from './harness.mjs';

const check = checker();
const site = await serve();
const image = '/c2pa/adobe-photoshop-ai-edited-trusted.jpg';

let browser = await launch({ profile: 'popup' });
const storage = () => browser.serviceWorker.evaluate(() => chrome.storage.local.get(null));
const openPopup = async () => {
  const popup = await browser.context.newPage();
  await popup.setViewportSize({ width: 360, height: 520 });
  await popup.goto(`chrome-extension://${browser.extensionId}/popup/index.html`);
  await popup.waitForSelector('#enabled');
  return popup;
};
/** Loads the test page and reports whether its Definite image got a badge. */
const badgedAfterLoad = async () => {
  const page = await browser.context.newPage();
  await page.goto(`${site.url}/pipeline.html`);
  const found = await waitFor(
    async () => ((await findInExtensionUi(page, 'aid-badge')).length > 0 ? true : null),
    { timeout: 6000 },
  );
  await page.close();
  return !!found;
};

try {
  // Start from defaults.
  await browser.serviceWorker.evaluate(() => chrome.storage.local.clear());
  let popup = await openPopup();
  await popup.screenshot({ path: join(outputDir, 'popup.png') });
  check(await popup.isChecked('#enabled'), 'REQ-F-010: on globally by default');
  check(
    !(await popup.isChecked('#cloud-enabled')),
    'REQ-F-010: cloud second opinion off by default',
  );
  check(
    (await popup.textContent('#model-status')).includes('Not downloaded'),
    'REQ-F-010: model status shows "not downloaded"',
  );

  console.log('\n# Model status');
  // The offscreen document reports status through the service worker into storage; the popup
  // must follow along without being reopened.
  await browser.serviceWorker.evaluate(() =>
    chrome.storage.local.set({ modelStatus: { state: 'downloading', percent: 37 } }),
  );
  check(
    await waitFor(async () => (await popup.textContent('#model-status')).includes('37%')),
    'REQ-F-010: model status updates live (downloading 37%)',
  );
  await browser.serviceWorker.evaluate(() =>
    chrome.storage.local.set({ modelStatus: { state: 'ready', device: 'webgpu' } }),
  );
  check(
    await waitFor(async () => (await popup.textContent('#model-status')).includes('Ready')),
    'REQ-F-010: model status updates live (ready)',
  );

  console.log('\n# Scanning follows the settings');
  check(await badgedAfterLoad(), 'baseline: the test page gets a badge');
  const baseline = site.hits(image, 'extension');

  // Switch this site off the way the popup does: by hostname in stored settings.
  await browser.serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, disabledSites: ['127.0.0.1'], cloudEnabled: false },
    }),
  );
  check(
    !(await badgedAfterLoad()),
    'REQ-F-010: per-site off stops badges on that hostname after reload',
  );
  check(
    site.hits(image, 'extension') === baseline,
    'REQ-F-010: per-site off stops image fetches too',
  );

  await popup.click('#cloud-enabled');
  await popup.click('#enabled');
  const saved = await waitFor(async () => {
    const s = (await storage()).settings;
    return s && s.enabled === false && s.cloudEnabled === true ? s : null;
  });
  check(!!saved, `REQ-F-010: popup switches are saved (${JSON.stringify(saved)})`);
  check(
    JSON.stringify(saved?.disabledSites) === '["127.0.0.1"]',
    'REQ-F-010: saving one switch keeps the others',
  );

  console.log('\n# Clear cache');
  const before = Object.keys(await storage()).filter((k) => k.startsWith('v1:')).length;
  await popup.click('#clear-cache');
  check(
    await waitFor(async () => (await popup.textContent('#cache-message')).includes('Removed')),
    `REQ-F-010: clear cache reports what it removed (${before} entries before)`,
  );
  const after = await storage();
  check(
    Object.keys(after).filter((k) => k.startsWith('v1:')).length === 0 && !!after.settings,
    'REQ-PRV-004: verdicts cleared, settings kept',
  );

  console.log('\n# Restart');
  await browser.close();
  browser = await launch({ profile: 'popup' });
  const restored = (await storage()).settings;
  check(
    restored?.enabled === false &&
      restored?.cloudEnabled === true &&
      restored?.disabledSites?.[0] === '127.0.0.1',
    'REQ-F-010: settings persist across a browser restart',
  );
  popup = await openPopup();
  check(!(await popup.isChecked('#enabled')), 'REQ-F-010: popup shows the persisted global switch');
  check(
    await popup.isChecked('#cloud-enabled'),
    'REQ-F-010: popup shows the persisted cloud switch',
  );
  check(!(await badgedAfterLoad()), 'REQ-F-010: global off stops scanning everywhere');

  // Back on for this site: scanning resumes.
  await browser.serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      settings: { enabled: true, disabledSites: [], cloudEnabled: false },
    }),
  );
  check(await badgedAfterLoad(), 'REQ-F-010: switching back on resumes scanning after reload');
} finally {
  await browser.serviceWorker.evaluate(() => chrome.storage.local.clear()).catch(() => {});
  await browser.close();
  await site.close();
}

check.finish('popup');
