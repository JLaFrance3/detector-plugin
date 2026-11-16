// Shared helpers for end-to-end checks: launches Playwright's Chromium with the built
// extension loaded and serves local test pages. Used by smoke.mjs and the spike scripts.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const distDir = join(here, '..', 'dist');
export const fixturesDir = join(here, 'fixtures');

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

/** Serves a directory on 127.0.0.1 and resolves to `{ url, close }`. */
export async function serve(dir = fixturesDir) {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/favicon.ico') return void res.writeHead(204).end();
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
      const file = join(dir, path === '\\' || path === '/' ? 'index.html' : path);
      if (!file.startsWith(dir)) throw new Error('outside root');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

// Branded Chrome no longer accepts --load-extension, so use Playwright's Chromium and fall back
// to Edge where that build cannot start. Override with AID_E2E_CHANNEL.
const channels = process.env.AID_E2E_CHANNEL
  ? [process.env.AID_E2E_CHANNEL]
  : ['chromium', 'msedge'];

/**
 * Launches a Chromium-based browser with the unpacked extension from dist/.
 * Resolves to `{ context, extensionId, serviceWorker, close }`.
 */
export async function launch({ headless = true, args = [] } = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'aid-e2e-'));
  let context;
  let lastError;
  for (const channel of channels) {
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel,
        headless,
        args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`, ...args],
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
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Collects console messages and page errors from a page into an array. */
export function collectLogs(page, into = []) {
  page.on('console', (m) => into.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => into.push(`[pageerror] ${e.message}`));
  return into;
}
