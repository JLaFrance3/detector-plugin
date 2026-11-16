#!/usr/bin/env node
// Serves the demo sample page (REQ-F-013) on http://localhost:8080.
// Usage: npm run demo   (then open the address with the extension loaded)
//
// The page lists whatever image files are in demo/images/<section>/, so adding a sample is
// just dropping a file into the right folder. Files are served byte for byte: never re-save
// or optimize the C2PA samples, or their signatures stop validating.
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'demo');
const port = Number(process.env.PORT ?? 8080);
const sections = ['definite', 'likely', 'none'];
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};
const isImage = (name) =>
  ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extname(name).toLowerCase());

async function listing() {
  const result = {};
  for (const section of sections) {
    const files = await readdir(join(root, 'images', section)).catch(() => []);
    result[section] = files.filter(isImage).sort();
  }
  return result;
}

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/images.json') {
      res.writeHead(200, { 'content-type': types['.json'], 'cache-control': 'no-store' });
      return void res.end(JSON.stringify(await listing()));
    }
    const file = join(root, normalize(pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(root + sep)) throw new Error('outside root');
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Demo page: http://localhost:${port}/`);
});
