#!/usr/bin/env node
// TASK-004 spike check: reads C2PA manifests in the offscreen document for sample images and
// prints the fields, validation state and timing.
// Usage: node e2e/spike-c2pa.mjs [image-url ...]   (after `npm run build`)
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fixturesDir, launch, serve } from './harness.mjs';

const site = await serve();
const browser = await launch();
const failures = [];

// What each fixture must produce (see e2e/fixtures/c2pa/README.md).
const AI_EDITED =
  'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia';
const expected = {
  'adobe-20220124-A.jpg': { present: false },
  'adobe-20220124-C.jpg': { present: true, validationState: 'Valid' },
  'adobe-20220124-CA.jpg': { present: true, validationState: 'Valid' },
  'adobe-20220124-E-dat-CA.jpg': { present: true, validationState: 'Invalid' },
  'adobe-20220124-E-sig-CA.jpg': { present: true, validationState: 'Invalid' },
  'adobe-photoshop-ai-edited-trusted.jpg': {
    present: true,
    validationState: 'Trusted',
    sourceType: AI_EDITED,
  },
  'adobe-trusted-no-ai-source.jpg': { present: true, validationState: 'Trusted', sourceType: null },
  'adobe-remote-manifest.jpg': { present: false },
  'gradient.png': { present: false },
};

try {
  const fixtureNames = (await readdir(join(fixturesDir, 'c2pa'))).filter((f) =>
    /\.(jpe?g|png|webp)$/i.test(f),
  );
  const urls = [
    ...fixtureNames.map((f) => `${site.url}/c2pa/${f}`),
    `${site.url}/gradient.png`,
    ...process.argv.slice(2),
  ];

  // Any extension page can talk to the service worker; the popup is convenient.
  const page = await browser.context.newPage();
  await page.goto(`chrome-extension://${browser.extensionId}/popup/index.html`);
  const read = (url) =>
    page.evaluate((u) => chrome.runtime.sendMessage({ type: 'spike:c2pa', url: u }), url);

  const requests = [];
  browser.context.on('request', (r) => requests.push(r.url()));

  await read(urls[0]); // warm-up: loads the WASM module and the worker
  const timings = [];
  for (const url of urls) {
    const result = await read(url);
    const name = url.split('/').pop();
    console.log(`\n${name}`);
    console.log(JSON.stringify(result, null, 2));
    const want = expected[name];
    if (want) {
      if (result?.present !== want.present) failures.push(`${name}: present=${result?.present}`);
      if (want.validationState && result?.validationState !== want.validationState) {
        failures.push(`${name}: state ${result?.validationState}, want ${want.validationState}`);
      }
      if (want.sourceType && !result?.digitalSourceTypes?.includes(want.sourceType)) {
        failures.push(`${name}: missing source type ${want.sourceType}`);
      }
      if (want.sourceType === null && result?.digitalSourceTypes?.length) {
        failures.push(`${name}: unexpected source type`);
      }
    }
    if (typeof result?.ms === 'number') timings.push(result.ms);
  }

  // Repeat reads to get a stable median.
  for (let i = 0; i < 4; i++) {
    for (const url of urls) timings.push((await read(url)).ms);
  }
  timings.sort((a, b) => a - b);
  const median = timings[Math.floor(timings.length / 2)];
  console.log(`\nreads: ${timings.length}, median ${median} ms, max ${timings.at(-1)} ms`);

  const external = requests.filter(
    (u) => !u.startsWith('chrome-extension://') && !u.startsWith(site.url),
  );
  console.log(`network requests outside the extension and test server: ${external.length}`);
  for (const u of external) failures.push(`unexpected request: ${u}`);
} finally {
  await browser.close();
  await site.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('spike-c2pa: ok');
