#!/usr/bin/env node
// Scores the evaluation set through the real extension (TASK-022, REQ-NF-006): every image
// goes through the same service worker and offscreen detector that users get.
// Usage: node eval/build-set.mjs && npm run build && node eval/run.mjs
// Writes eval/results.csv, then runs eval/analyze.mjs.
import { execFileSync } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, serve } from '../e2e/harness.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const setDir = join(here, '..', 'e2e', 'output', 'eval-set');
// Entries marked `excluded` were checked by hand and found to be mislabelled.
const manifest = JSON.parse(await readFile(join(here, 'manifest.json'), 'utf8')).filter(
  (item) => !item.excluded,
);
const exists = async (file) => !!(await stat(file).catch(() => null));

const site = await serve(setDir);
const browser = await launch({ profile: 'pipeline' });
const rows = [];
try {
  const page = await browser.context.newPage();
  await page.goto(`chrome-extension://${browser.extensionId}/popup/index.html`);
  page.setDefaultTimeout(300000);

  // Recompressed copies: 60% of the size, JPEG quality 50, made with the browser's own encoder.
  for (const item of manifest) {
    const target = join(setDir, `${item.id}.recompressed.jpg`);
    if (!(await exists(join(setDir, `${item.id}.jpg`))) || (await exists(target))) continue;
    const base64 = await page.evaluate(async (url) => {
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = new OffscreenCanvas(
        Math.round(bitmap.width * 0.6),
        Math.round(bitmap.height * 0.6),
      );
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.5 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return btoa(binary);
    }, `${site.url}/${item.id}.jpg`);
    await writeFile(target, Buffer.from(base64, 'base64'));
  }

  await page.evaluate(() => chrome.runtime.sendMessage({ type: 'cache:clear' }));
  let done = 0;
  for (const item of manifest) {
    for (const variant of ['original', 'recompressed']) {
      const file = variant === 'original' ? `${item.id}.jpg` : `${item.id}.recompressed.jpg`;
      if (!(await exists(join(setDir, file)))) continue;
      const reply = await page.evaluate(
        (url) => chrome.runtime.sendMessage({ type: 'image:check', url }),
        `${site.url}/${file}`,
      );
      const result = reply?.result;
      rows.push({
        id: item.id,
        variant,
        label: item.label,
        group: item.group.replaceAll(',', ' '),
        verdict: result?.verdict ?? 'error',
        basis: result?.confidence?.kind ?? '',
        score: result?.signals?.detector ? result.signals.detector.score.toFixed(6) : '',
      });
      if (++done % 40 === 0) console.log(`scored ${done} images`);
    }
  }
} finally {
  await browser.close();
  await site.close();
}

const columns = ['id', 'variant', 'label', 'group', 'verdict', 'basis', 'score'];
const NEWLINE = String.fromCharCode(10);
await writeFile(
  join(here, 'results.csv'),
  [columns.join(','), ...rows.map((r) => columns.map((c) => r[c]).join(','))].join(NEWLINE) +
    NEWLINE,
);
console.log(`wrote eval/results.csv (${rows.length} rows)`);
execFileSync(process.execPath, [join(here, 'analyze.mjs')], { stdio: 'inherit' });
