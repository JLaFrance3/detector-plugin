#!/usr/bin/env node
// End-to-end check of the in-page UI: badge (REQ-UI-001 to 004) and details popover
// (REQ-F-008, REQ-UI-005), on a page with deliberately hostile CSS (REQ-UI-006).
// Usage: npm run e2e:ui --workspace extension   (after `npm run build`)
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checker, findInExtensionUi, launch, outputDir, serve, waitFor } from './harness.mjs';

const check = checker();
await mkdir(outputDir, { recursive: true });
const site = await serve();
const browser = await launch({ profile: 'pipeline' });

try {
  const page = await browser.context.newPage();
  await page.goto(`${site.url}/pipeline.html`);
  // Record layout shifts and image clicks from the start.
  await page.evaluate(() => {
    window.__shifts = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__shifts += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
    window.__imageClicks = 0;
    document.getElementById('definite').addEventListener('click', () => window.__imageClicks++);
  });

  const badges = await waitFor(async () => {
    const found = await findInExtensionUi(page, 'aid-badge');
    return found.length >= 2 ? found : null;
  });
  const definite = (badges ?? []).find((b) => b.attributes['aria-label']?.startsWith('AI-edited'));
  const likely = (badges ?? []).find((b) => b.attributes['aria-label']?.startsWith('Likely AI'));
  check(!!definite && !!likely, 'REQ-F-007: Definite and Likely badges are shown');
  const centre = (box) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const ui = (className) => findInExtensionUi(page, className);

  // --- Badge ---------------------------------------------------------------------------
  console.log('\n# Badge');
  const chips = await ui('aid-chip');
  check(
    chips.length >= 2 && chips.every((c) => c.box && c.box.width <= 20 && c.box.height <= 20),
    `REQ-UI-001: visible chip is at most 20 x 20 px (${chips.map((c) => `${c.box?.width}x${c.box?.height}`).join(', ')})`,
  );
  check(
    definite?.box?.width === 24 && definite?.box?.height === 24,
    'REQ-UI-001: 24 x 24 px click target',
  );
  const chipTexts = chips.map((c) => c.text.trim());
  check(
    chipTexts.includes('AI') && chipTexts.includes('AI?'),
    'REQ-UI-002: Definite and Likely differ by text',
  );
  const classes = chips.map((c) => c.attributes.class);
  check(
    classes.some((c) => c.includes('aid-chip-likely')) &&
      classes.some((c) => !c.includes('aid-chip-likely')),
    'REQ-UI-002: Definite and Likely differ by shape',
  );
  check(
    definite?.attributes['aria-label'] === 'AI-edited (Content Credentials)' &&
      likely?.attributes['aria-label'] === 'Likely AI · metadata',
    'REQ-UI-002: tooltip text',
  );
  const shifts = await page.evaluate(() => window.__shifts);
  check(shifts === 0, `REQ-UI-001: no layout shift (score ${shifts})`);

  // The rest of the image stays clickable.
  const imageBox = await page.evaluate(() => {
    const r = document.getElementById('definite').getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  await page.mouse.click(imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2);
  await page.mouse.click(imageBox.x + imageBox.width - 40, imageBox.y + 12);
  check(
    (await page.evaluate(() => window.__imageClicks)) === 2,
    'REQ-UI-001: clicks on the rest of the image reach the page',
  );

  await page.mouse.move(10, 10);
  await page.screenshot({
    path: join(outputDir, 'ui-badges-rest.png'),
    clip: { x: 0, y: 60, width: 380, height: 540 },
  });
  await page.mouse.move(centre(definite.box).x, centre(definite.box).y);
  await page.waitForTimeout(250);
  await page.screenshot({
    path: join(outputDir, 'ui-badge-hover.png'),
    clip: { x: 0, y: 60, width: 380, height: 280 },
  });
  const tip = (await ui('aid-tip')).find((t) => t.box);
  check(
    !!tip && tip.text.trim() === 'AI-edited (Content Credentials)',
    'REQ-UI-001: tooltip shown on hover',
  );

  // --- Popover -------------------------------------------------------------------------
  console.log('\n# Details popover');
  await page.mouse.click(centre(definite.box).x, centre(definite.box).y);
  const popover = await waitFor(async () => (await ui('aid-popover-ready'))[0] ?? null);
  check(!!popover, 'REQ-F-008: clicking the badge opens the details popover');
  check(
    (await page.evaluate(() => window.__imageClicks)) === 2,
    'REQ-UI-001: a badge click does not click the image',
  );
  await page.waitForTimeout(250);
  await page.screenshot({
    path: join(outputDir, 'ui-popover-definite.png'),
    clip: { x: 0, y: 60, width: 420, height: 520 },
  });

  const text = popover?.text.replace(/\s+/g, ' ') ?? '';
  check(
    text.includes('AI-edited') && text.includes('Confirmed by Content Credentials'),
    'REQ-F-008: shows verdict and confidence',
  );
  check(
    text.includes('Adobe C2PA') && text.includes('Photoshop'),
    'REQ-F-008: shows C2PA signer and tool',
  );
  check(
    text.includes('Image metadata') && text.includes('On-device detector'),
    'REQ-F-008: lists each signal',
  );
  check(
    text.includes('A mark shows AI involvement. No mark does not mean an image is real.'),
    'REQ-F-008: shows the fixed caveat',
  );
  check(
    popover?.attributes.role === 'dialog' && !!popover?.attributes['aria-label'],
    'REQ-UI-005: popover has an accessible name',
  );
  const vp = page.viewportSize();
  const pb = popover?.box;
  check(pb && pb.width <= 320, `REQ-UI-005: at most 320 px wide (${pb?.width})`);
  check(
    pb && pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= vp.width && pb.y + pb.height <= vp.height,
    'REQ-UI-005: inside the viewport',
  );
  check(
    await page.evaluate(() => document.activeElement?.localName === 'aid-ui-host'),
    'REQ-UI-005: keyboard focus moves into the popover',
  );

  // Links: collected through the DevTools protocol like everything else in the closed root.
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const anchors = [];
  const walk = (node) => {
    if (node.localName === 'a') {
      const attrs = {};
      for (let i = 0; i < node.attributes.length; i += 2)
        attrs[node.attributes[i]] = node.attributes[i + 1];
      if ((attrs.rel ?? '').includes('noopener')) anchors.push(attrs);
    }
    for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) walk(child);
  };
  walk(root);
  await cdp.detach();
  const hrefs = anchors.map((a) => a.href);
  check(
    hrefs.includes('https://synthid.com/') &&
      hrefs.includes('https://openai.com/verify') &&
      hrefs.includes('https://claude.com/check-content'),
    `REQ-F-008: links to the official checkers (${hrefs.join(', ')})`,
  );
  check(
    anchors.every((a) => a.target === '_blank' && a.rel.includes('noreferrer')),
    'REQ-PRV-001: links open in a new tab without a referrer',
  );

  const isOpen = async () => (await ui('aid-popover')).length > 0;
  await page.keyboard.press('Escape');
  check(await waitFor(async () => !(await isOpen())), 'REQ-UI-005: Esc closes the popover');
  check(
    await page.evaluate(() => document.activeElement?.localName === 'aid-ui-host'),
    'REQ-UI-005: focus returns to the badge after Esc',
  );

  // Keyboard: the badge is focused, so Enter opens it again.
  await page.keyboard.press('Enter');
  check(await waitFor(isOpen), 'REQ-UI-005: the badge opens from the keyboard');
  await page.mouse.click(900, 500);
  check(
    await waitFor(async () => !(await isOpen())),
    'REQ-UI-005: an outside click closes the popover',
  );

  await page.mouse.click(centre(likely.box).x, centre(likely.box).y);
  const second = await waitFor(async () => (await ui('aid-popover-ready'))[0] ?? null);
  check(
    (second?.text ?? '').includes('Based on image metadata'),
    'REQ-F-008: Likely popover explains the metadata basis',
  );
  await page.waitForTimeout(250);
  await page.screenshot({
    path: join(outputDir, 'ui-popover-likely.png'),
    clip: { x: 0, y: 300, width: 420, height: 560 },
  });
  const close = (await ui('aid-close'))[0];
  await page.mouse.click(centre(close.box).x, centre(close.box).y);
  check(
    await waitFor(async () => !(await isOpen())),
    'REQ-UI-005: the close button closes the popover',
  );

  check(
    (await page.evaluate(() => window.__shifts)) === 0,
    'REQ-UI-001: still no layout shift after using the UI',
  );

  // Near the bottom-left of a small viewport the popover must still fit.
  await page.setViewportSize({ width: 360, height: 500 });
  await page.evaluate(() => document.getElementById('definite').scrollIntoView({ block: 'end' }));
  await page.waitForTimeout(400);
  const moved = (await ui('aid-badge')).find((b) =>
    b.attributes['aria-label']?.startsWith('AI-edited'),
  );
  await page.mouse.click(centre(moved.box).x, centre(moved.box).y);
  const small = await waitFor(async () => (await ui('aid-popover-ready'))[0] ?? null);
  const sb = small?.box;
  check(
    sb && sb.x >= 0 && sb.x + sb.width <= 360 && sb.width <= 320,
    `REQ-UI-005: repositions to stay inside a narrow viewport (${JSON.stringify(sb)})`,
  );
  await page.screenshot({ path: join(outputDir, 'ui-popover-narrow.png') });

  // Hide on this page.
  const hide = (await ui('aid-hide-page'))[0];
  await page.mouse.click(centre(hide.box).x, centre(hide.box).y);
  check(
    await waitFor(async () => (await ui('aid-badge')).length === 0),
    'REQ-UI-004: "Hide on this page" removes the badges',
  );

  check(
    await page.evaluate(() => document.querySelector('aid-ui-host').shadowRoot === null),
    'REQ-UI-006: the shadow root is closed to the page',
  );
} finally {
  await browser.close();
  await site.close();
}

check.finish('ui');
