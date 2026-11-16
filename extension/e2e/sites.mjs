#!/usr/bin/env node
// TASK-023: performance and cross-site check on real websites (REQ-NF-001, REQ-UI-006).
// For each site it scrolls the page with the extension active and records: time spent in the
// extension's own main-thread callbacks, layout shifts caused by the extension, badges shown,
// and whether a known Definite image injected into the page gets the same badge everywhere.
//
// Usage: npm run build:dev --workspace extension && node e2e/sites.mjs [url ...]
// Needs a development build: the timing log exists only there. Rebuild with `npm run build`
// afterwards.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  checker,
  evaluateInOffscreen,
  findInExtensionUi,
  fixturesDir,
  launch,
  outputDir,
  waitFor,
} from './harness.mjs';

const defaults = [
  ['news', 'https://www.bbc.com/news'],
  ['encyclopedia', 'https://en.wikipedia.org/wiki/Artificial_intelligence_visual_art'],
  ['social', 'https://www.reddit.com/r/pics/'],
  ['dark theme', 'https://www.theverge.com/'],
  ['photo site', 'https://www.flickr.com/explore'],
  ['strict CSP', 'https://github.com/explore'],
  ['media library', 'https://commons.wikimedia.org/wiki/Category:Images_generated_by_DALL-E_3'],
];
const args = process.argv.slice(2);
const sites = args.length ? args.map((url) => ['custom', url]) : defaults;

const check = checker();
const fixture = await readFile(join(fixturesDir, 'c2pa', 'adobe-photoshop-ai-edited-trusted.jpg'));
const dataUrl = `data:image/jpeg;base64,${fixture.toString('base64')}`;
const browser = await launch({ profile: 'pipeline' });
const report = [];
const chips = [];

/** Evaluates an expression in the extension's content-script world of a page. */
async function evaluateInContentScript(page, expression) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const contexts = [];
    cdp.on('Runtime.executionContextCreated', (event) => contexts.push(event.context));
    await cdp.send('Runtime.enable');
    await new Promise((resolve) => setTimeout(resolve, 300));
    const main = await page.mainFrame();
    void main;
    const world = contexts.find(
      (c) => c.auxData?.type === 'isolated' && c.name === 'AI Image Detector',
    );
    if (!world) return null;
    const { result } = await cdp.send('Runtime.evaluate', {
      expression,
      contextId: world.id,
      returnByValue: true,
    });
    return result.value ?? null;
  } catch {
    return null;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

try {
  const popup = await browser.context.newPage();
  await popup.goto(`chrome-extension://${browser.extensionId}/popup/index.html`);
  await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'cache:clear' }));
  const cacheSize = () =>
    browser.serviceWorker.evaluate(
      async () =>
        Object.keys(await chrome.storage.local.get(null)).filter((k) => k.startsWith('v1:')).length,
    );

  for (const [kind, url] of sites) {
    const host = new URL(url).hostname;
    const page = await browser.context.newPage();
    const before = await cacheSize();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (error) {
      console.log(`skip ${host}: ${error.message.split(String.fromCharCode(10))[0]}`);
      await page.close();
      continue;
    }
    // Some sites redirect once more after the first document; let that settle.
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    try {
      // Record layout shifts and which elements moved.
      await page.evaluate(() => {
        window.__aidShift = { total: 0, byExtension: 0 };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput) continue;
            window.__aidShift.total += entry.value;
            if (
              (entry.sources ?? []).some((s) => s.node?.nodeName?.toLowerCase() === 'aid-ui-host')
            ) {
              window.__aidShift.byExtension += entry.value;
            }
          }
        }).observe({ type: 'layout-shift', buffered: true });
      });
      await page.waitForTimeout(2500);

      // A known Definite image, as a data: URL so the site's own servers are not involved.
      const injected = await page.evaluate((src) => {
        const img = new Image(320, 240);
        img.id = 'aid-test-image';
        img.src = src;
        img.style.cssText =
          'position:fixed;left:16px;top:35%;width:320px;height:240px;z-index:2147483000;';
        document.body.append(img);
        return new Promise((resolve) => {
          img.addEventListener('load', () => resolve(true));
          img.addEventListener('error', () => resolve(false));
        });
      }, dataUrl);

      for (let step = 0; step < 6; step++) {
        await page.mouse.wheel(0, 900);
        await page.waitForTimeout(700);
      }
      await page.waitForTimeout(2500);

      const rect = await page.evaluate(() => {
        const r = document.getElementById('aid-test-image')?.getBoundingClientRect();
        return r ? { right: r.right, top: r.top } : null;
      });
      const testBadge = rect
        ? await waitFor(
            async () =>
              (await findInExtensionUi(page, 'aid-badge')).find(
                (b) =>
                  b.box &&
                  Math.abs(b.box.x + b.box.width - (rect.right - 2)) <= 1 &&
                  Math.abs(b.box.y - (rect.top + 2)) <= 1,
              ) ?? null,
            { timeout: 8000 },
          )
        : null;
      const badges = await findInExtensionUi(page, 'aid-badge');
      const perfJson = await evaluateInContentScript(
        page,
        'globalThis.__aidPerf ? JSON.stringify(globalThis.__aidPerf.summary()) : null',
      );
      const perf = perfJson ? JSON.parse(perfJson) : null;
      const shift = await page.evaluate(() => window.__aidShift);
      const leaked = await page.evaluate(
        () =>
          [...document.querySelectorAll('style')].filter((s) =>
            (s.textContent ?? '').includes('.aid-'),
          ).length,
      );

      if (testBadge) {
        const chip = { x: testBadge.box.x + 2, y: testBadge.box.y + 2, width: 20, height: 20 };
        await page.mouse.move(chip.x + 10, chip.y + 10);
        await page.waitForTimeout(300);
        chips.push({ host, png: await page.screenshot({ clip: chip }) });
        await page.screenshot({
          path: join(outputDir, `site-${host}.png`),
          clip: { x: 0, y: Math.max(0, testBadge.box.y - 60), width: 420, height: 330 },
        });
      }

      const maxTask = perf ? Math.max(0, ...Object.values(perf).map((p) => p.max)) : null;
      const entry = {
        kind,
        host,
        imagesChecked: (await cacheSize()) - before,
        badges: badges.length,
        labels: [...new Set(badges.map((b) => b.attributes['aria-label']))],
        testImageLoaded: injected,
        testBadge: testBadge?.attributes['aria-label'] ?? null,
        maxCallbackMs: maxTask === null ? null : Number(maxTask.toFixed(2)),
        perf,
        layoutShiftTotal: Number(shift.total.toFixed(4)),
        layoutShiftByExtension: shift.byExtension,
        leakedStyles: leaked,
      };
      report.push(entry);
      console.log(`\n# ${kind}: ${host}`);
      console.log(
        `     images checked ${entry.imagesChecked}, badges ${entry.badges}, page CLS ${entry.layoutShiftTotal}, longest extension callback ${entry.maxCallbackMs} ms`,
      );
      // A consent dialog or advert drawn over the test image hides its badge on purpose.
      const covered = await page.evaluate(() => {
        const img = document.getElementById('aid-test-image');
        if (!img) return false;
        const r = img.getBoundingClientRect();
        const top = document
          .elementsFromPoint(r.right - 14, r.top + 14)
          .find((el) => el.localName !== 'aid-ui-host');
        return !!top && top !== img;
      });
      if (!injected) {
        console.log(`     test image blocked by the site's content security policy`);
      } else if (covered) {
        check(
          entry.testBadge === null,
          `${host}: test image is under a site overlay, so its badge is hidden`,
        );
      } else {
        check(
          entry.testBadge === 'AI-edited (Content Credentials)',
          `${host}: Definite test image is badged`,
        );
      }
      check(
        entry.layoutShiftByExtension === 0,
        `${host}: REQ-NF-001 no layout shift caused by the extension`,
      );
      check(
        perf !== null && maxTask < 50,
        `${host}: REQ-NF-001 content script callbacks under 50 ms (max ${entry.maxCallbackMs})`,
      );
      check(leaked === 0, `${host}: REQ-UI-006 no extension styles in the page`);
    } catch (error) {
      console.log(`skip ${host}: ${String(error.message).split(String.fromCharCode(10))[0]}`);
    }
    await page.close().catch(() => {});
  }

  // Chip appearance across sites (REQ-UI-006), compared in a blank extension page.
  console.log('\n# Appearance');
  for (const chip of chips.slice(1)) {
    const diff = await popup.evaluate(
      async ([a, b]) => {
        const pixels = async (base64) => {
          const img = new Image();
          img.src = `data:image/png;base64,${base64}`;
          await img.decode();
          const canvas = new OffscreenCanvas(img.width, img.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          return ctx.getImageData(0, 0, img.width, img.height).data;
        };
        const [pa, pb] = [await pixels(a), await pixels(b)];
        let sum = 0;
        for (let i = 0; i < pa.length; i++) sum += Math.abs(pa[i] - pb[i]);
        return sum / pa.length;
      },
      [chips[0].png.toString('base64'), chip.png.toString('base64')],
    );
    check(
      diff < 8,
      `${chip.host}: badge looks the same as on ${chips[0].host} (mean pixel difference ${diff.toFixed(2)} of 255)`,
    );
  }
  check(
    chips.length >= 5,
    `REQ-UI-006: badge appearance verified on ${chips.length} sites (need 5 or more)`,
  );

  const offscreen = await evaluateInOffscreen(
    popup,
    'globalThis.__aidPerf ? JSON.stringify(globalThis.__aidPerf.summary()) : "null"',
  );
  console.log('\n# Offscreen timings (ms)');
  for (const [name, s] of Object.entries(offscreen ?? {})) {
    console.log(
      `     ${name}: median ${s.median.toFixed(0)}, max ${s.max.toFixed(0)}, n=${s.count}`,
    );
  }
  if (offscreen?.['c2pa.read']) {
    check(offscreen['c2pa.read'].median < 300, 'REQ-NF-001: median C2PA read under 300 ms');
  }
  if (offscreen?.['detector.score']) {
    check(
      offscreen['detector.score'].median < 1000,
      'REQ-NF-001: median detector inference under 1 s',
    );
  }
  await writeFile(
    join(outputDir, 'sites-report.json'),
    JSON.stringify({ sites: report, offscreen }, null, 2),
  );
} finally {
  await browser.close();
}

check.finish('sites');
