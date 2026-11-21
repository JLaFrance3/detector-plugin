#!/usr/bin/env node
// End-to-end check of the core pipeline in a real browser: content script -> service worker
// -> offscreen document (C2PA, XMP, detector) -> verdict -> cache -> badge.
// Usage: npm run e2e:pipeline --workspace extension   (after `npm run build`)
// The first run downloads the detector model (about 87 MB) into e2e/output/profile-pipeline.
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checker,
  evaluateInOffscreen,
  findInExtensionUi,
  launch,
  outputDir,
  serve,
  waitFor,
} from './harness.mjs';

const check = checker();
const sampleDir = join(outputDir, 'detector-samples');
const haveSamples = !!(await stat(join(sampleDir, 'ai-anime-girl.jpg')).catch(() => null));
const site = await serve(undefined, ...(haveSamples ? [sampleDir] : []));
// serve() treats `undefined` as the fixtures directory.
const browser = await launch({ profile: 'pipeline' });

try {
  const popup = await browser.context.newPage();
  await popup.goto(`chrome-extension://${browser.extensionId}/popup/index.html`);
  const send = (message) => popup.evaluate((m) => chrome.runtime.sendMessage(m), message);
  const checkImage = (path) => send({ type: 'image:check', url: `${site.url}${path}` });

  // Start from an empty cache so the run is repeatable with the persistent profile.
  await send({ type: 'cache:clear' });

  // --- Verdicts ------------------------------------------------------------------------
  console.log('\n# Verdicts (first check may wait for the model download)');
  const timeout = { timeout: 300000 };
  popup.setDefaultTimeout(timeout.timeout);

  const definite = await checkImage('/c2pa/adobe-photoshop-ai-edited-trusted.jpg');
  check(
    definite?.ok && definite.result.verdict === 'definite',
    'REQ-F-005 row 1: trusted C2PA with AI source type is Definite',
  );
  check(definite?.result?.label === 'AI-edited', 'REQ-F-005: label is "AI-edited"');
  check(
    definite?.result?.signals?.c2pa?.signer === 'Adobe C2PA',
    'REQ-F-003: signer name returned',
  );
  check(
    /Photoshop/.test(definite?.result?.signals?.c2pa?.tool ?? ''),
    'REQ-F-003: claim generator returned',
  );
  check(definite?.result?.signals?.detector === null, 'REQ-F-005: detector not run for Definite');

  const metadata = await checkImage('/xmp/xmp-ai-generated.jpg');
  check(
    metadata?.result?.verdict === 'likely',
    'REQ-F-005 row 2: unsigned XMP AI source type is Likely',
  );
  check(
    metadata?.result?.confidence?.kind === 'metadata',
    'REQ-F-005: confidence shown as "metadata"',
  );

  const camera = await checkImage('/xmp/xmp-camera.jpg');
  check(
    camera?.result?.signals?.iptc?.aiSource === null,
    'REQ-F-004: camera source type is not AI',
  );

  const real = await checkImage('/c2pa/adobe-20220124-A.jpg');
  const realScore = real?.result?.signals?.detector?.score;
  check(
    typeof realScore === 'number',
    `REQ-F-006: detector scored a real photo (${realScore?.toFixed(4)})`,
  );
  check(real?.result?.verdict === 'none', 'REQ-F-005 row 4: real photo is None');

  const untrusted = await checkImage('/c2pa/adobe-20220124-C.jpg');
  const u = untrusted?.result?.signals?.c2pa;
  check(
    u?.present && u.valid && !u.trusted,
    'REQ-SEC-007: test-certificate manifest is valid but not trusted',
  );
  check(
    untrusted?.result?.verdict !== 'definite',
    'REQ-SEC-007: untrusted signer never gives Definite',
  );

  const tampered = await checkImage('/c2pa/adobe-20220124-E-dat-CA.jpg');
  const t = tampered?.result?.signals?.c2pa;
  check(t?.present && !t.valid && !t.trusted, 'REQ-F-003: tampered manifest fails validation');
  check(
    t?.failureReason === 'assertion.dataHash.mismatch',
    `REQ-F-003: failure reason kept (${t?.failureReason})`,
  );

  const badSignature = await checkImage('/c2pa/adobe-20220124-E-sig-CA.jpg');
  check(
    badSignature?.result?.signals?.c2pa?.failureReason === 'claimSignature.mismatch',
    'REQ-F-003: tampered signature detected',
  );

  const remote = await checkImage('/c2pa/adobe-remote-manifest.jpg');
  check(
    remote?.result?.signals?.c2pa?.present === false,
    'REQ-PRV-001: remote manifest is not fetched',
  );

  if (haveSamples) {
    const ai = await checkImage('/ai-anime-girl.jpg');
    const score = ai?.result?.signals?.detector?.score;
    check(
      ai?.result?.verdict === 'likely',
      `REQ-F-005 row 3: AI image is Likely (score ${score?.toFixed(4)})`,
    );
    check(ai?.result?.confidence?.kind === 'score', 'REQ-F-005: confidence shown as a percentage');
  } else {
    console.log('skip AI sample (run the detector spike once to download samples)');
  }

  // Several images at once: the detector queue must cope with concurrent requests.
  const burst = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((n) => checkImage(`/c2pa/adobe-20220124-A.jpg?burst=${n}`)),
  );
  check(
    burst.every((r) => typeof r?.result?.signals?.detector?.score === 'number'),
    'REQ-F-006: six images submitted together are all scored',
  );

  // --- Failures ------------------------------------------------------------------------
  console.log('\n# Fetch failures');
  const missing = await checkImage('/does-not-exist.jpg');
  check(missing?.ok === false, 'REQ-F-002: HTTP 404 gives no verdict');
  const svg = await checkImage('/logo.svg');
  check(svg?.ok === false, 'REQ-F-001: SVG is not checked');
  const refused = await send({ type: 'image:check', url: 'http://127.0.0.1:9/a.jpg' });
  check(refused?.ok === false, 'REQ-F-002: network error gives no verdict');
  const invalid = await popup
    .evaluate(() =>
      Promise.race([
        chrome.runtime.sendMessage({ type: 'image:check', url: 'file:///C:/Windows/win.ini' }),
        new Promise((resolve) => setTimeout(() => resolve('dropped'), 1500)),
      ]),
    )
    .catch(() => 'dropped');
  check(invalid === 'dropped' || invalid === undefined, 'REQ-SEC-003: invalid message is dropped');

  // --- Cache ---------------------------------------------------------------------------
  console.log('\n# Cache');
  const path = '/c2pa/adobe-20220124-A.jpg';
  const before = site.hits(path, 'extension');
  const again = await checkImage(path);
  check(again?.result?.verdict === 'none', 'REQ-F-011: cached verdict returned');
  check(site.hits(path, 'extension') === before, 'REQ-F-011: cached image is not fetched again');
  const stored = await browser.serviceWorker.evaluate(() => chrome.storage.local.get(null));
  const keys = Object.keys(stored).filter((k) => k.startsWith('v1:'));
  check(
    keys.length >= 6 && keys.every((k) => /^v1:[0-9a-f]{64}$/.test(k)),
    `REQ-F-011: ${keys.length} entries keyed by SHA-256`,
  );
  check(!JSON.stringify(stored).includes('127.0.0.1'), 'REQ-PRV-004: no image URLs in storage');
  check(
    stored.modelStatus?.state === 'ready',
    `REQ-F-010: model status stored (${JSON.stringify(stored.modelStatus)})`,
  );
  const cleared = await send({ type: 'cache:clear' });
  check(
    cleared?.ok && cleared.removed === keys.length,
    'REQ-F-010: clear cache removes all verdicts',
  );

  // --- Network (REQ-PRV-001, REQ-SEC-008) ------------------------------------------------
  console.log('\n# Network');
  const isModelHost = (host) =>
    host === 'huggingface.co' || host.endsWith('.huggingface.co') || host.endsWith('.hf.co');
  const isModelFile = (path) => path.endsWith('.json') || path.endsWith('.onnx');
  const resources = await evaluateInOffscreen(
    popup,
    "JSON.stringify(performance.getEntriesByType('resource').map((entry) => entry.name))",
  );
  if (check(Array.isArray(resources), 'offscreen document is running')) {
    const external = resources.filter((url) => !url.startsWith('chrome-extension://'));
    const hosts = [...new Set(external.map((url) => new URL(url).host))];
    console.log(
      `     offscreen document loaded ${resources.length} resource(s); external hosts: ${hosts.join(', ') || 'none'}`,
    );
    check(
      external.every((url) => isModelHost(new URL(url).host)),
      'REQ-PRV-001: the only external host contacted is the model host',
    );
    check(
      external.every((url) => isModelFile(new URL(url).pathname)),
      'REQ-SEC-008: only model files come from the network, no scripts or WASM',
    );
    check(
      !external.some((url) => url.includes('127.0.0.1')),
      'REQ-PRV-001: the offscreen document never fetches images itself',
    );
  }

  // --- Page behaviour ------------------------------------------------------------------
  console.log('\n# Page behaviour');
  const page = await browser.context.newPage();
  await page.goto(`${site.url}/pipeline.html`);

  /** The visible badge over the image with this id (matched by position), or null. */
  const badgeOn = async (id) => {
    const rect = await page.evaluate((imageId) => {
      const r = document.getElementById(imageId)?.getBoundingClientRect();
      return r ? { right: r.right, top: r.top } : null;
    }, id);
    if (!rect) return null;
    const found = await findInExtensionUi(page, 'aid-badge');
    return (
      found.find(
        (b) =>
          b.box &&
          Math.abs(b.box.x + b.box.width - (rect.right - 2)) <= 1 &&
          Math.abs(b.box.y - (rect.top + 2)) <= 1,
      ) ?? null
    );
  };
  const label = (badge) => badge?.attributes['aria-label'] ?? null;

  // Badge geometry (REQ-UI-001): top-right corner of the image, 4 px inset, 24 px target.
  const definiteBadge = await waitFor(() => badgeOn('definite'));
  check(
    label(definiteBadge) === 'AI-edited (Content Credentials)',
    'REQ-F-007: Definite badge in the top-right corner of its image',
  );
  check(
    definiteBadge?.box?.width === 24 && definiteBadge?.box?.height === 24,
    'REQ-UI-001: 24 x 24 px click target',
  );
  check(
    label(await waitFor(() => badgeOn('likely-metadata'))) === 'Likely AI · metadata',
    'REQ-F-007: Likely badge on the metadata image',
  );
  await page.waitForTimeout(1500);
  const noneMarker = await badgeOn('none');
  check(
    label(noneMarker) === 'Not flagged · details' &&
      noneMarker.attributes.class.includes('aid-neutral') &&
      !noneMarker.attributes.class.includes('aid-revealed'),
    'REQ-F-007, ADR-011: a None image gets only a hidden neutral marker',
  );
  const flagged = (found) => found.filter((b) => !b.attributes.class.includes('aid-neutral'));
  check(
    flagged(await findInExtensionUi(page, 'aid-badge')).length === 2,
    'REQ-F-001: only flagged images in the viewport get a badge',
  );
  // ADR-011: hovering the image reveals its marker.
  const noneRect = await page.evaluate(() => {
    const r = document.getElementById('none').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(noneRect.x, noneRect.y);
  check(
    await waitFor(async () => (await badgeOn('none'))?.attributes.class.includes('aid-revealed')),
    'ADR-011: hovering an unflagged image reveals its marker',
  );
  await page.mouse.move(5, 5);
  check(
    site.hits('/c2pa/adobe-20220124-A.jpg', 'extension') - before === 1,
    'REQ-F-001: an image shown twice is checked once',
  );
  check(
    site.hits('/logo.svg', 'extension') === 1,
    'REQ-F-001: SVG image on the page is not fetched (only the direct test above)',
  );
  check(
    site.hits('/xmp/xmp-ai-edited.jpg', 'extension') === 0,
    'REQ-F-001: small image and off-screen <picture> are not fetched yet',
  );

  // The <picture> image is just below the first screen.
  await page.evaluate(() => document.getElementById('picture').scrollIntoView({ block: 'end' }));
  check(
    label(await waitFor(() => badgeOn('picture'))) === 'Likely AI · metadata',
    'REQ-F-001: <picture> image is checked with the source the browser chose',
  );
  check((await badgeOn('small')) === null, 'REQ-F-001: image below 128 px is skipped');
  check((await badgeOn('svg')) === null, 'REQ-F-001: SVG image is skipped');
  check(
    site.hits('/xmp/xmp-ai-edited.jpg', 'extension') === 1,
    'REQ-F-001: small image never fetched (one fetch, for the <picture>)',
  );
  check(
    site.hits('/gradient.png', 'extension') === 0,
    'REQ-F-001: <picture> fallback that was not chosen is not fetched',
  );
  const belowBefore = site.hits('/c2pa/adobe-20220124-C.jpg', 'extension');
  await page.waitForTimeout(800);
  check(
    site.hits('/c2pa/adobe-20220124-C.jpg', 'extension') === belowBefore,
    'REQ-F-001: image below the fold is not fetched',
  );

  await page.evaluate(() => document.getElementById('below-fold').scrollIntoView());
  await waitFor(() => site.hits('/c2pa/adobe-20220124-C.jpg', 'extension') > belowBefore);
  check(
    site.hits('/c2pa/adobe-20220124-C.jpg', 'extension') === belowBefore + 1,
    'REQ-F-001: checked once scrolled into view',
  );
  check(
    (await findInExtensionUi(page, 'aid-badge')).every((b) => b.box && b.box.y > -24),
    'REQ-UI-001: badges of images scrolled out of view are not rendered',
  );

  // Infinite scroll: an image added later is picked up when it is visible.
  const addedBefore = site.hits('/xmp/xmp-ai-generated.jpg', 'extension');
  await page.evaluate(() => {
    const img = new Image(320, 240);
    img.id = 'added';
    img.src = 'xmp/xmp-ai-generated.jpg?added=1';
    document.getElementById('feed').append(img);
    img.scrollIntoView();
  });
  check(
    label(await waitFor(() => badgeOn('added'))) === 'Likely AI · metadata',
    'REQ-F-001: image added after load gets checked and badged',
  );
  check(
    site.hits('/xmp/xmp-ai-generated.jpg', 'extension') === addedBefore + 1,
    'REQ-F-001: added image fetched once',
  );

  // A source swap removes the stale badge and checks the new image.
  const swapBefore = site.hits('/c2pa/adobe-20220124-A.jpg', 'extension');
  await page.evaluate(() => {
    document.getElementById('added').src = 'c2pa/adobe-20220124-A.jpg?swapped=1';
  });
  check(
    await waitFor(async () => label(await badgeOn('added')) === 'Not flagged · details'),
    'REQ-F-001: the badge follows the new source (here a None image, so the neutral marker)',
  );
  check(
    await waitFor(() => site.hits('/c2pa/adobe-20220124-A.jpg', 'extension') === swapBefore + 1),
    'REQ-F-001: the new source is checked',
  );

  const leaked = await page.evaluate(
    () =>
      [...document.querySelectorAll('style')].filter((s) => (s.textContent ?? '').includes('aid-'))
        .length,
  );
  check(leaked === 0, 'REQ-UI-006: no extension styles in the page');
} finally {
  await browser.close();
  await site.close();
}

check.finish('pipeline');
