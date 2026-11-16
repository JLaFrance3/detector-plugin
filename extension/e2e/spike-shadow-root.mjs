#!/usr/bin/env node
// TASK-003 spike check: the test badge renders inside a closed shadow root with identical
// styling on the local hostile-CSS fixture and on real sites (REQ-UI-006, ADR-005).
// Usage: node e2e/spike-shadow-root.mjs [url ...]   (after `npm run build`)
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { collectLogs, distDir, launch, serve } from './harness.mjs';

const outDir = join(import.meta.dirname, 'output');
await mkdir(outDir, { recursive: true });

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const site = await serve();
const urls = process.argv.slice(2);
const targets = [
  `${site.url}/index.html`,
  ...(urls.length
    ? urls
    : [
        'https://en.wikipedia.org/wiki/Cat',
        'https://github.com/features/copilot',
        'https://www.bbc.com/news',
      ]),
];

const browser = await launch();
const chips = [];
const differences = [];
try {
  for (const url of targets) {
    const name = new URL(url).hostname.replace(/[^a-z0-9.]/gi, '_');
    const page = await browser.context.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    const logs = collectLogs(page);
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    } catch (error) {
      console.log(`skip ${url}: ${error.message.split('\n')[0]}`);
      await page.close();
      continue;
    }
    await page.waitForTimeout(2500);

    const info = await page.evaluate(() => {
      const host = document.querySelector('aid-ui-host');
      const first = [...document.images].find((img) => {
        const r = img.getBoundingClientRect();
        return r.width >= 128 && r.height >= 128;
      });
      first?.scrollIntoView({ block: 'center' });
      return {
        hasHost: !!host,
        shadowRootVisible: host ? host.shadowRoot !== null : null,
        hostDefined: !!customElements.get('aid-ui-host'),
        leakedStyles: [...document.querySelectorAll('style')].filter((s) =>
          (s.textContent ?? '').includes('aid-'),
        ).length,
        hostBox: host ? JSON.stringify(host.getBoundingClientRect()) : null,
        hasLargeImage: !!first,
      };
    });
    if (!info.hasLargeImage) {
      console.log(`skip ${url}: no image of 128 px or more`);
      await page.close();
      continue;
    }
    check(info.hasHost, `${name}: UI host element present`);
    check(info.shadowRootVisible === false, `${name}: shadow root is closed to the page`);
    check(!info.hostDefined, `${name}: no custom element registered`);
    check(info.leakedStyles === 0, `${name}: no styles leaked into the page`);

    await page.waitForTimeout(400);
    const rect = await page.evaluate(() => {
      const img = [...document.images].find((i) => {
        const r = i.getBoundingClientRect();
        return r.width >= 128 && r.height >= 128;
      });
      const r = img.getBoundingClientRect();
      return { right: r.right, top: r.top };
    });
    // Chip: 20 x 20 px, 4 px inside the image's top-right corner. Hover makes it fully opaque.
    const chip = {
      x: Math.round(rect.right) - 24,
      y: Math.round(rect.top) + 4,
      width: 20,
      height: 20,
    };
    await page.mouse.move(chip.x + 10, chip.y + 10);
    await page.waitForTimeout(400);
    const png = await page.screenshot({ clip: chip });
    await writeFile(join(outDir, `chip-${name}.png`), png);
    await page.screenshot({
      path: join(outDir, `context-${name}.png`),
      clip: { x: Math.max(0, chip.x - 260), y: Math.max(0, chip.y - 20), width: 300, height: 120 },
    });
    chips.push({ name, png });
    const errors = logs.filter((l) => l.includes('[aid]') || /NG0\d+/.test(l));
    check(errors.length === 0, `${name}: no extension errors ${errors.join(' | ')}`);
    await page.close();
  }

  // Compare chips in a blank page (decodes the PNGs without extra dependencies). Images sit
  // at fractional pixel positions on some sites, so allow for anti-aliasing differences.
  const page = await browser.context.newPage();
  await page.goto(`${site.url}/index.html`);
  for (const chip of chips.slice(1)) {
    const diff = await page.evaluate(
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
    differences.push({ name: chip.name, diff });
  }
} finally {
  await browser.close();
  await site.close();
}

check(chips.length >= 3, `badge checked on ${chips.length} pages (need 3 or more)`);
for (const { name, diff } of differences) {
  check(
    diff < 8,
    `${name}: chip matches the fixture page (mean pixel difference ${diff.toFixed(2)} of 255)`,
  );
}

const bundle = await readFile(join(distDir, 'ui', 'main.js'), 'utf8');
check(!/customElements\s*\.\s*define/.test(bundle), 'UI bundle never calls customElements.define');
const sizes = {};
for (const f of ['ui/main.js', 'content.js']) sizes[f] = (await stat(join(distDir, f))).size;
console.log(`bundle sizes (bytes): ${JSON.stringify(sizes)}`);

if (failures.length) {
  console.error(`spike-shadow-root: ${failures.length} failure(s)`);
  process.exit(1);
}
console.log('spike-shadow-root: ok');
