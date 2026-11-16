// Shared helpers for end-to-end checks: launches a Chromium-based browser with the built
// extension loaded and serves local test pages.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const distDir = join(here, '..', 'dist');
export const fixturesDir = join(here, 'fixtures');
export const outputDir = join(here, 'output');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/**
 * Serves one or more directories on 127.0.0.1 (later ones are fallbacks).
 * Resolves to `{ url, close, hits }`. `hits(path, by)` counts requests for a path: by
 * 'extension' (fetch() from the service worker, Sec-Fetch-Dest: empty), by 'page' (the
 * page's own image loads) or in total.
 */
export async function serve(...dirs) {
  const roots = dirs.map((d) => d ?? fixturesDir);
  if (roots.length === 0) roots.push(fixturesDir);
  const log = [];
  const server = createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (pathname === '/favicon.ico') return void res.writeHead(204).end();
    log.push({ path: pathname, dest: req.headers['sec-fetch-dest'] ?? '' });
    for (const root of roots) {
      try {
        const file = join(root, normalize(pathname === '/' ? 'index.html' : pathname));
        if (!file.startsWith(root + sep)) continue;
        const body = await readFile(file);
        res.writeHead(200, {
          'content-type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'cache-control': 'no-store',
        });
        return void res.end(body);
      } catch {
        // try the next root
      }
    }
    res.writeHead(404).end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
    hits: (path, by) =>
      log.filter(
        (entry) =>
          entry.path === path &&
          (by === undefined ||
            (by === 'extension' ? entry.dest === 'empty' : entry.dest !== 'empty')),
      ).length,
  };
}

// Branded Chrome no longer accepts --load-extension, so use Playwright's Chromium and fall back
// to Edge where that build cannot start. Override with AID_E2E_CHANNEL.
const channels = process.env.AID_E2E_CHANNEL
  ? [process.env.AID_E2E_CHANNEL]
  : ['chromium', 'msedge'];

/**
 * Launches the browser with the unpacked extension from dist/.
 * `profile` names a persistent profile under e2e/output/ so that the downloaded detector model
 * is reused between runs; without it a fresh temporary profile is used and deleted afterwards.
 * Resolves to `{ context, extensionId, serviceWorker, close }`.
 */
export async function launch({ headless = !process.env.AID_E2E_HEADED, args = [], profile } = {}) {
  let userDataDir;
  if (profile) {
    userDataDir = join(outputDir, `profile-${profile}`);
    await mkdir(userDataDir, { recursive: true });
  } else {
    userDataDir = await mkdtemp(join(tmpdir(), 'aid-e2e-'));
  }
  let context;
  let lastError;
  for (const channel of channels) {
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel,
        headless,
        viewport: { width: 1280, height: 900 },
        args: [
          `--disable-extensions-except=${distDir}`,
          `--load-extension=${distDir}`,
          '--enable-unsafe-webgpu', // WebGPU in headless mode
          ...args,
        ],
      });
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!context) throw lastError;
  const serviceWorker =
    context.serviceWorkers()[0] ??
    (await context.waitForEvent('serviceworker', { timeout: 15000 }));
  const extensionId = new URL(serviceWorker.url()).host;
  return {
    context,
    extensionId,
    serviceWorker,
    close: async () => {
      await context.close();
      if (!profile) await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Collects console messages and page errors from a page into an array. */
export function collectLogs(page, into = []) {
  page.on('console', (m) => into.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => into.push(`[pageerror] ${e.message}`));
  return into;
}

/**
 * Finds elements inside the extension's UI. The UI lives in a closed shadow root that page
 * scripts (and Playwright selectors) cannot reach, so this walks the DOM through the DevTools
 * protocol, which can. Returns `{ tag, attributes, text, box }` for every element whose class
 * list contains `className`.
 */
export async function findInExtensionUi(page, className) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
    const found = [];
    const textOf = (node) =>
      node.nodeType === 3
        ? node.nodeValue
        : [...(node.children ?? []), ...(node.shadowRoots ?? [])].map(textOf).join('');
    const walk = (node, insideUi) => {
      const inside = insideUi || node.localName === 'aid-ui-host';
      if (inside && node.nodeType === 1) {
        const attributes = {};
        for (let i = 0; i < (node.attributes ?? []).length; i += 2) {
          attributes[node.attributes[i]] = node.attributes[i + 1];
        }
        if ((attributes.class ?? '').split(/\s+/).includes(className)) {
          found.push({ nodeId: node.nodeId, tag: node.localName, attributes, text: textOf(node) });
        }
      }
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) {
        walk(child, inside);
      }
    };
    walk(root, false);
    for (const item of found) {
      try {
        const { model } = await cdp.send('DOM.getBoxModel', { nodeId: item.nodeId });
        const [x, y] = model.border;
        item.box = { x, y, width: model.width, height: model.height };
      } catch {
        item.box = null; // not rendered
      }
    }
    return found;
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/** Minimal assertion helper: prints a line per check and remembers failures. */
export function checker() {
  const failures = [];
  const check = (ok, what) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
    return ok;
  };
  check.finish = (name) => {
    if (failures.length) {
      console.error(`${name}: ${failures.length} failure(s)`);
      process.exit(1);
    }
    console.log(`${name}: ok`);
  };
  return check;
}

/** Polls `fn` until it returns a truthy value or the timeout passes. */
export async function waitFor(fn, { timeout = 15000, interval = 150 } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
}

/**
 * Evaluates an expression (which must return a JSON string) inside the offscreen document
 * and returns the parsed value, or null when there is no offscreen document. Playwright does
 * not expose offscreen documents as pages, so this attaches to the target over the DevTools
 * protocol from any page of the same browser.
 */
export async function evaluateInOffscreen(page, expression) {
  const cdp = await page.context().newCDPSession(page);
  try {
    const { targetInfos } = await cdp.send('Target.getTargets');
    const target = targetInfos.find((t) => t.url.includes('/offscreen/offscreen.html'));
    if (!target) return null;
    const { sessionId } = await cdp.send('Target.attachToTarget', {
      targetId: target.targetId,
      flatten: false,
    });
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('offscreen evaluate timed out')), 10000);
      cdp.on('Target.receivedMessageFromTarget', (event) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== 1) return;
        clearTimeout(timer);
        resolve(message.result?.result?.value);
      });
    });
    await cdp.send('Target.sendMessageToTarget', {
      sessionId,
      message: JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }),
    });
    const value = await reply;
    return typeof value === 'string' ? JSON.parse(value) : null;
  } catch {
    return null;
  } finally {
    await cdp.detach().catch(() => {});
  }
}
