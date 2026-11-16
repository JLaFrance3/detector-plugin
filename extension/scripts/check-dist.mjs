#!/usr/bin/env node
// Post-build checks on extension/dist (run by `npm run build`):
//  - REQ-SEC-008: manifest permissions and CSP are exactly as specified
//  - REQ-SEC-008: nothing in dist loads code from a remote URL
//  - REQ-SEC-004: no API-key-like strings in the bundle
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const problems = [];

// --- Manifest -----------------------------------------------------------------------------
const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');
if (!same(manifest.permissions ?? [], ['storage', 'offscreen'])) {
  problems.push(`permissions must be exactly storage + offscreen, got ${manifest.permissions}`);
}
if (!same(manifest.host_permissions ?? [], ['http://*/*', 'https://*/*'])) {
  problems.push(`host_permissions must be http and https only, got ${manifest.host_permissions}`);
}
if (
  (manifest.optional_permissions ?? []).length ||
  (manifest.optional_host_permissions ?? []).length
) {
  problems.push('optional permissions are not allowed without a new ADR');
}
const csp = manifest.content_security_policy?.extension_pages;
if (csp !== "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'") {
  problems.push(`unexpected extension_pages CSP: ${csp}`);
}

// --- Files --------------------------------------------------------------------------------
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
};
walk(dist);

const remoteCode = [
  [/<script[^>]+src\s*=\s*["']?(?:https?:)?\/\//i, 'remote <script src>'],
  [/\bimportScripts\(\s*["'`]https?:\/\//, 'remote importScripts()'],
  [/\bimport\(\s*["'`]https?:\/\//, 'remote dynamic import()'],
  [/\bfrom\s*["']https?:\/\//, 'remote static import'],
  [/\bnew\s+(?:Shared)?Worker\(\s*["'`]https?:\/\//, 'remote Worker script'],
];

const keyLike = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, 'secret key (sk-...)'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'Google API key'],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, 'GitHub token'],
  [/\bhf_[A-Za-z0-9]{30,}\b/, 'Hugging Face token'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/api_secret["']?\s*[:=]\s*["'][A-Za-z0-9]{12,}["']/i, 'Sightengine api_secret'],
  [/api_user["']?\s*[:=]\s*["'][0-9]{6,}["']/i, 'Sightengine api_user'],
  [/SIGHTENGINE_/, 'Sightengine environment variable name'],
];

const textExt = new Set(['.js', '.mjs', '.html', '.json', '.css', '.txt']);
for (const file of files) {
  if (!textExt.has(extname(file))) continue;
  const rel = relative(dist, file);
  const text = readFileSync(file, 'utf8');
  for (const [re, what] of remoteCode) {
    if (re.test(text)) problems.push(`${rel}: ${what} (REQ-SEC-008)`);
  }
  for (const [re, what] of keyLike) {
    if (re.test(text)) problems.push(`${rel}: ${what} (REQ-SEC-004)`);
  }
}

if (problems.length) {
  console.error(`check-dist: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`check-dist: ok (${files.length} files; manifest permissions and CSP verified)`);
