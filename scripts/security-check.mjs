#!/usr/bin/env node
// Security checks before submission (TASK-025). Run after `npm run build`.
// Usage: npm run security
//  1. npm audit: no high or critical vulnerabilities (REQ-SEC-009)
//  2. extension/dist: manifest permissions, CSP, no remote code, no key-like strings
//     (REQ-SEC-004, REQ-SEC-008), via extension/scripts/check-dist.mjs
//  3. every hostname that appears in the built extension is on a reviewed list, and none
//     belongs to an analytics or telemetry service (REQ-PRV-001, REQ-PRV-003)
//  4. the banned DOM/eval APIs do not appear in our own source (REQ-SEC-002); lint enforces
//     this too, this is an independent check that does not rely on the lint configuration
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'extension', 'dist');
const problems = [];
const note = (text) => console.log(`     ${text}`);
const section = (title) => console.log(`\n# ${title}`);
const ok = (condition, text) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${text}`);
  if (!condition) problems.push(text);
};

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === 'output' || name.startsWith('.')) {
      continue;
    }
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
};

// --- 1. Dependencies ------------------------------------------------------------------------
section('Dependencies (REQ-SEC-009)');
const audit = spawnSync('npm audit --json', { cwd: root, encoding: 'utf8', shell: true });
try {
  const counts = JSON.parse(audit.stdout).metadata.vulnerabilities;
  ok(
    counts.high === 0 && counts.critical === 0,
    `npm audit: ${counts.critical} critical, ${counts.high} high`,
  );
  note(
    `${counts.moderate} moderate, ${counts.low} low (development tooling; see docs/security-review.md)`,
  );
} catch {
  ok(false, 'npm audit did not return a report');
}
for (const lock of ['package-lock.json']) {
  ok(!!statSync(join(root, lock), { throwIfNoEntry: false }), `${lock} is present`);
}

// --- 2. Built extension ---------------------------------------------------------------------
section('Built extension (REQ-SEC-004, REQ-SEC-008)');
try {
  const output = execFileSync(
    process.execPath,
    [join(root, 'extension', 'scripts', 'check-dist.mjs')],
    {
      encoding: 'utf8',
    },
  );
  ok(true, output.trim());
} catch (error) {
  ok(false, `check-dist failed: ${String(error.stdout ?? error.message).trim()}`);
}

// --- 3. Hostnames in the bundle -------------------------------------------------------------
section('Network destinations in the bundle (REQ-PRV-001, REQ-PRV-003)');
// Why each host may appear. "contacted" hosts are the only ones the extension connects to.
const reviewed = {
  'huggingface.co': 'contacted: one-time download of the detector model weights',
  'jeanlafrance.xyz':
    'contacted only when the user clicks "Get a second opinion" with the cloud setting on (project backend)',
  'synthid.com': 'link in the details popover, opened only when the user clicks it',
  'openai.com': 'link in the details popover, opened only when the user clicks it',
  'claude.com': 'link in the details popover, opened only when the user clicks it',
  'www.w3.org': 'XML and SVG namespace identifiers, never fetched',
  'cv.iptc.org': 'IPTC digital source type identifiers, never fetched',
  'c2pa.org': 'C2PA digital source type identifiers, never fetched',
  'angular.dev': 'documentation link inside an Angular error message',
  'web.dev': 'documentation link inside a library message',
  'developer.mozilla.org': 'documentation link inside a library message',
  'github.com': 'documentation link inside a library message',
  'gist.github.com': 'documentation link inside a library message',
  'verify.contentauthenticity.org': 'identifier string inside the C2PA library, never fetched',
  'cdn.jsdelivr.net':
    'default ONNX Runtime location in transformers.js; overridden with a packaged file before use and verified unused by the e2e network check',
};
const tracking =
  /google-analytics|googletagmanager|doubleclick|segment\.(io|com)|sentry\.io|mixpanel|amplitude|posthog|hotjar|datadoghq|newrelic|bugsnag|fullstory|plausible|matomo/i;
const hosts = new Map();
const textTypes = new Set(['.js', '.mjs', '.html', '.json', '.css']);
for (const file of walk(dist)) {
  if (!textTypes.has(extname(file))) continue;
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/https?:\/\/([A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+)/g)) {
    const host = match[1].toLowerCase();
    if (!hosts.has(host)) hosts.set(host, new Set());
    hosts.get(host).add(relative(dist, file).replaceAll('\\', '/'));
  }
  ok(
    !tracking.test(text),
    `${relative(dist, file).replaceAll('\\', '/')}: no analytics or telemetry endpoints`,
  );
}
for (const [host, files] of [...hosts].sort()) {
  const reason = reviewed[host];
  ok(!!reason, `${host} (${[...files].join(', ')}): ${reason ?? 'NOT REVIEWED'}`);
}

// --- 4. Banned APIs in our source -----------------------------------------------------------
section('Banned DOM and eval APIs in our source (REQ-SEC-002)');
const banned = [
  [/\.(innerHTML|outerHTML)\s*[+]?=(?!=)/, 'assignment to innerHTML/outerHTML'],
  [/\binsertAdjacentHTML\s*\(/, 'insertAdjacentHTML()'],
  [/\[(innerHTML|outerHTML)\]\s*=/, '[innerHTML] template binding'],
  [/\bbypassSecurityTrust[A-Za-z]*\s*\(/, 'DomSanitizer.bypassSecurityTrust*()'],
  [/(^|[^.\w])eval\s*\(/, 'eval()'],
  [/\bnew\s+Function\s*\(/, 'new Function()'],
  [/\bdocument\.write(ln)?\s*\(/, 'document.write()'],
];
const sources = [
  ...walk(join(root, 'extension', 'src')),
  ...walk(join(root, 'extension', 'projects')),
  ...walk(join(root, 'backend', 'src')),
  ...walk(join(root, 'demo')),
].filter((f) => ['.ts', '.html', '.js'].includes(extname(f)) && !f.endsWith('.spec.ts'));
let hits = 0;
for (const file of sources) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    // Comments may name the APIs (for example to say they are banned).
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (const [pattern, what] of banned) {
      if (pattern.test(code)) {
        hits++;
        ok(false, `${relative(root, file)}:${index + 1}: ${what}`);
      }
    }
  });
}
ok(hits === 0, `${sources.length} source files scanned, ${hits} uses of banned APIs`);

console.log('');
if (problems.length) {
  console.error(`security-check: ${problems.length} problem(s)`);
  process.exit(1);
}
console.log('security-check: ok');
