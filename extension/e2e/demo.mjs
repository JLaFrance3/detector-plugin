#!/usr/bin/env node
// Checks the demo sample page (REQ-F-013): every image in the Definite and Likely sections
// gets the matching badge, and no image in the None section gets one.
// Usage: npm run e2e:demo --workspace extension   (after `npm run build`)
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { checker, findInExtensionUi, launch, outputDir, waitFor } from './harness.mjs';

const PORT = 8093;
const repo = join(import.meta.dirname, '..', '..');
const server = spawn(process.execPath, [join(repo, 'scripts', 'serve-demo.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: 'ignore',
});
const check = checker();
const browser = await launch({ profile: 'pipeline' });

try {
  const page = await browser.context.newPage();
  await waitFor(() =>
    page.goto(`http://localhost:${PORT}/`).then(
      () => true,
      () => false,
    ),
  );
  await page.waitForSelector('figure img');
  const listing = await page.evaluate(async () => (await fetch('images.json')).json());
  console.log(
    `samples: ${listing.definite.length} definite, ${listing.likely.length} likely, ${listing.none.length} none`,
  );
  check(
    listing.definite.length >= 5,
    `REQ-F-013: at least 5 AI images with valid C2PA (have ${listing.definite.length})`,
  );
  check(
    listing.likely.length >= 5,
    `REQ-F-013: at least 5 AI images with metadata stripped (have ${listing.likely.length})`,
  );
  check(
    listing.none.length >= 5,
    `REQ-F-013: at least 5 real photos (have ${listing.none.length})`,
  );

  /** Scrolls an image into view and returns the label of its badge, or null. */
  const badgeFor = async (section, index, expectBadge) => {
    const rect = await page.evaluate(
      ([s, i]) => {
        const img = document.querySelectorAll(`[data-section="${s}"] img`)[i];
        img.scrollIntoView({ block: 'center' });
        const r = img.getBoundingClientRect();
        return { right: r.right, top: r.top };
      },
      [section, index],
    );
    const find = async () =>
      (await findInExtensionUi(page, 'aid-badge')).find(
        (b) =>
          b.box &&
          Math.abs(b.box.x + b.box.width - (rect.right - 2)) <= 1 &&
          Math.abs(b.box.y - (rect.top + 2)) <= 1,
      ) ?? null;
    // Wait long enough for a check to finish before concluding there is no badge.
    const badge = await waitFor(find, { timeout: expectBadge ? 60000 : 4000 });
    return badge?.attributes['aria-label'] ?? null;
  };

  for (const [section, expected] of [
    ['definite', /^AI-(generated|edited) \(Content Credentials\)$/],
    ['likely', /^Likely AI · \d+%$/],
    ['none', /^Not flagged · details$/],
  ]) {
    console.log(`\n# ${section}`);
    for (let i = 0; i < listing[section].length; i++) {
      const label = await badgeFor(section, i, expected !== null);
      const ok = expected ? expected.test(label ?? '') : label === null;
      check(ok, `${listing[section][i]}: ${label ?? 'no badge'}`);
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(outputDir, 'demo-page.png'), fullPage: false });
} finally {
  await browser.close();
  server.kill();
}

check.finish('demo');
