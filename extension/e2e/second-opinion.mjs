#!/usr/bin/env node
// End-to-end check of the cloud second opinion (REQ-F-009, REQ-PRV-002, REQ-NF-002) against
// the real backend code with a fake provider, so no Sightengine key or quota is needed.
// Usage: npm run e2e:second-opinion --workspace extension   (after `npm run build` at the root)
// The script rebuilds the extension scripts with a local backend URL and restores them after.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { buildApp } from '../../backend/dist/app.js';
import { checker, findInExtensionUi, launch, serve, waitFor } from './harness.mjs';

const PORT = 8791;
const root = join(import.meta.dirname, '..');
const rebuild = (backendUrl) =>
  execFileSync(process.execPath, ['scripts/build.mjs'], {
    cwd: root,
    env: { ...process.env, AID_BACKEND_URL: backendUrl },
    stdio: 'ignore',
  });

const check = checker();
const uploads = [];
const backend = buildApp({
  minIntervalMs: 0,
  provider: {
    name: 'sightengine',
    check: (bytes, type) => {
      uploads.push({ bytes: Buffer.from(bytes), type });
      // The second upload reports a face edit, to show the extra text (ADR-009).
      const deepfake = uploads.length === 2 ? 0.881 : 0.03;
      return Promise.resolve({ score: 0.874, deepfake, operations: 5 });
    },
  },
});
await backend.listen({ host: '127.0.0.1', port: PORT });
rebuild(`http://127.0.0.1:${PORT}`);

const site = await serve();
const browser = await launch({ profile: 'second-opinion' });
const setCloud = (cloudEnabled) =>
  browser.serviceWorker.evaluate(
    (enabled) =>
      chrome.storage.local.set({
        settings: { enabled: true, disabledSites: [], cloudEnabled: enabled },
      }),
    cloudEnabled,
  );
const ui = (page, className) => findInExtensionUi(page, className);
const centre = (box) => [box.x + box.width / 2, box.y + box.height / 2];
/** Opens the test page and the popover of the badge whose label starts with `prefix`. */
const openPopover = async (prefix) => {
  const page = await browser.context.newPage();
  await page.goto(`${site.url}/pipeline.html`);
  const badge = await waitFor(async () =>
    (await ui(page, 'aid-badge')).find((b) => b.attributes['aria-label']?.startsWith(prefix)),
  );
  // Hover first: the neutral marker on unflagged images only takes clicks once revealed.
  await page.mouse.move(...centre(badge.box));
  await page.waitForTimeout(300);
  await page.mouse.click(...centre(badge.box));
  await waitFor(async () => (await ui(page, 'aid-popover-ready'))[0]);
  return { page, badge };
};
const button = async (page) => (await ui(page, 'aid-second-opinion'))[0];

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(bytes) {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = bytes.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: bytes.readUInt16BE(i + 5), width: bytes.readUInt16BE(i + 7) };
    }
    i += 2 + length;
  }
  return null;
}

try {
  await browser.serviceWorker.evaluate(() => chrome.storage.local.clear());

  console.log('# Off by default');
  let { page } = await openPopover('Likely AI');
  check(!(await button(page)), 'REQ-F-009: no second-opinion button while the setting is off');
  check(uploads.length === 0, 'REQ-PRV-001: nothing uploaded while browsing');
  await page.close();

  console.log('\n# On: one image per click');
  await setCloud(true);
  ({ page } = await openPopover('Likely AI'));
  const offer = await button(page);
  check(offer?.text.trim() === 'Get a second opinion', 'REQ-F-009: button offered when enabled');
  await page.waitForTimeout(1000);
  check(uploads.length === 0, 'REQ-F-009: never automatic; nothing sent before the click');

  await page.mouse.click(...centre(offer.box));
  const result = await waitFor(async () => (await ui(page, 'aid-second-opinion-result'))[0]);
  check(
    (result?.text ?? '')
      .replace(/\s+/g, ' ')
      .includes('Cloud second opinion: 87% likely AI-generated (Sightengine)'),
    `REQ-F-009: result shown as a separate line (${result?.text.replace(/\s+/g, ' ').trim()})`,
  );
  check(uploads.length === 1, 'REQ-F-009: exactly one image sent for one click');
  const badges = await ui(page, 'aid-badge');
  check(
    badges.some((b) => b.attributes['aria-label'] === 'Likely AI · metadata'),
    'REQ-F-009: the badge verdict is unchanged by the second opinion',
  );
  const popoverText = (await ui(page, 'aid-popover'))[0]?.text ?? '';
  check(
    popoverText.includes('Based on image metadata'),
    'REQ-F-009: the original verdict is still shown',
  );

  console.log('\n# What was uploaded');
  const upload = uploads[0];
  const size = upload ? jpegSize(upload.bytes) : null;
  check(upload?.type === 'image/jpeg', 'REQ-PRV-002: upload is a re-encoded JPEG');
  check(
    size && Math.max(size.width, size.height) <= 1024,
    `REQ-PRV-002: at most 1024 px on the long side (${size?.width} x ${size?.height})`,
  );
  const text = upload?.bytes.toString('latin1') ?? '';
  check(
    !['DigitalSourceType', 'xmpmeta', 'Exif', 'c2pa', 'jumb', 'Adobe'].some((s) =>
      text.includes(s),
    ),
    'REQ-PRV-002: metadata stripped (no XMP, EXIF or C2PA in the upload)',
  );
  await page.close();

  console.log('\n# Face edit');
  ({ page } = await openPopover('AI-edited'));
  await page.mouse.click(...centre((await button(page)).box));
  const faced = await waitFor(async () => (await ui(page, 'aid-second-opinion-result'))[0]);
  const facedText = (faced?.text ?? '').replace(/\s+/g, ' ').trim();
  check(
    facedText.includes(
      'Cloud second opinion: 87% likely AI-generated, 88% likely face-edited (Sightengine)',
    ),
    `REQ-F-009: a face-edit score at or over 50% is added to the same line (${facedText})`,
  );
  await page.close();

  console.log('\n# Unflagged image (ADR-011)');
  ({ page } = await openPopover('Not flagged'));
  const plain = await button(page);
  check(
    plain?.text.trim() === 'Get a second opinion',
    'ADR-011: an unflagged image offers a second opinion too',
  );
  const sent = uploads.length;
  await page.mouse.click(...centre(plain.box));
  check(
    !!(await waitFor(async () => (await ui(page, 'aid-second-opinion-result'))[0])),
    'ADR-011: the second opinion for an unflagged image returns a result',
  );
  check(uploads.length === sent + 1, 'REQ-F-009: still exactly one image per click');
  await page.close();

  console.log('\n# Backend down');
  await backend.close();
  ({ page } = await openPopover('AI-edited'));
  const retry = await button(page);
  await page.mouse.click(...centre(retry.box));
  check(
    await waitFor(async () => (await button(page))?.text.trim() === 'Unavailable'),
    'REQ-F-009: button shows "Unavailable" when the backend is unreachable',
  );
  check(
    (await ui(page, 'aid-badge')).length >= 2,
    'REQ-NF-002: badges and popover keep working without the backend',
  );
  await page.close();
} finally {
  await browser.serviceWorker.evaluate(() => chrome.storage.local.clear()).catch(() => {});
  await browser.close();
  await site.close();
  await backend.close().catch(() => {});
  rebuild(''); // restore the normal build, which has no backend URL
}

check.finish('second-opinion');
