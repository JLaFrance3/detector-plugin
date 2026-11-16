#!/usr/bin/env node
// Runs the Angular CLI and esbuild watchers together (ADR-002: one `npm run watch`).
// Reload the extension from chrome://extensions after a rebuild.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobs = [
  ['popup', 'npx ng build popup --watch --configuration development'],
  ['in-page', 'npx ng build in-page --watch --configuration development'],
  ['esbuild', 'node scripts/build.mjs --dev --watch'],
];

const children = jobs.map(([name, command]) => {
  const child = spawn(command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => `[${name}] ${line}`)
      .join('\n');
  child.stdout.on('data', (c) => console.log(prefix(c)));
  child.stderr.on('data', (c) => console.error(prefix(c)));
  child.on('exit', (code) => console.log(`[${name}] exited with code ${code}`));
  return child;
});

const stop = () => {
  for (const child of children) {
    // On Windows the child is a shell; kill its whole process tree.
    if (process.platform === 'win32' && child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill();
    }
  }
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
