#!/usr/bin/env node
// Builds the service worker, content script and offscreen document with esbuild and copies
// static files (manifest, offscreen.html) into dist/. The Angular CLI builds dist/popup and
// dist/ui separately (ADR-002).
//
// Usage: node scripts/build.mjs [--dev] [--watch]
import * as esbuild from 'esbuild';
import { watch as watchDir } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const dev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');
// Optional second-opinion backend (TASK-019). Leave unset to build without one.
let backendUrl = (process.env.AID_BACKEND_URL ?? '').trim();
while (backendUrl.endsWith('/')) backendUrl = backendUrl.slice(0, -1);

const staticFiles = [
  ['src/manifest.json', 'manifest.json'],
  ['src/offscreen/offscreen.html', 'offscreen/offscreen.html'],
];

// Third-party runtime files that must ship inside the extension (REQ-SEC-008: no remote code).
// They are loaded by URL at runtime, so esbuild cannot bundle them.
const require = createRequire(import.meta.url);
const c2paDist = dirname(require.resolve('@contentauth/c2pa-web'));
const vendorFiles = [
  [join(c2paDist, 'resources', 'c2pa_bg.wasm'), 'offscreen/vendor/c2pa_bg.wasm'],
  [join(c2paDist, 'c2pa_worker.js'), 'offscreen/vendor/c2pa_worker.js'],
  // ONNX Runtime Web binary for transformers.js. Resolved from transformers.js so the version
  // always matches the JavaScript glue that esbuild bundles into offscreen.js.
  [
    join(
      dirname(
        createRequire(require.resolve('@huggingface/transformers')).resolve('onnxruntime-web'),
      ),
      'ort-wasm-simd-threaded.asyncify.wasm',
    ),
    'offscreen/vendor/ort-wasm-simd-threaded.asyncify.wasm',
  ],
];

async function copyStatic() {
  for (const [from, to] of staticFiles) {
    await mkdir(dirname(join(dist, to)), { recursive: true });
    await cp(join(root, from), join(dist, to));
  }
  for (const [from, to] of vendorFiles) {
    await mkdir(dirname(join(dist, to)), { recursive: true });
    await cp(from, join(dist, to));
  }
}

// The Angular CLI emits the in-page UI bundle as an ES module, but manifest content scripts
// run as classic scripts. The bundle has no imports or exports, so wrapping it in a strict
// IIFE keeps module-like semantics and stops its top-level names leaking into the isolated
// world's global scope.
const uiBundle = join(dist, 'ui', 'main.js');
const wrapHead = '(()=>{"use strict";/*aid-wrapped*/\n';

async function wrapUiBundle() {
  let code;
  try {
    code = await readFile(uiBundle, 'utf8');
  } catch {
    return; // not built yet
  }
  if (code.startsWith(wrapHead) || code.trim() === '') return;
  await writeFile(uiBundle, `${wrapHead}${code}\n})();\n`);
}

/** @type {import('esbuild').Plugin} */
const copyStaticPlugin = {
  name: 'copy-static',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length === 0) await copyStatic();
    });
  },
};

/** @type {import('esbuild').BuildOptions} */
const common = {
  absWorkingDir: root,
  bundle: true,
  target: 'chrome124',
  platform: 'browser',
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  legalComments: 'none',
  define: { __DEV__: JSON.stringify(dev), __BACKEND_URL__: JSON.stringify(backendUrl) },
  loader: { '.pem': 'text', '.cfg': 'text' },
  logLevel: 'info',
};

/** @type {import('esbuild').BuildOptions[]} */
const targets = [
  {
    ...common,
    entryPoints: ['src/background/service-worker.ts'],
    outfile: 'dist/service-worker.js',
    format: 'esm',
  },
  {
    ...common,
    entryPoints: ['src/content/content.ts'],
    outfile: 'dist/content.js',
    format: 'iife',
  },
  {
    ...common,
    entryPoints: ['src/offscreen/offscreen.ts'],
    outfile: 'dist/offscreen/offscreen.js',
    format: 'esm',
    plugins: [copyStaticPlugin],
  },
];

if (watch) {
  const contexts = await Promise.all(targets.map((t) => esbuild.context(t)));
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('esbuild: watching service worker, content script and offscreen document');

  // Re-wrap the UI bundle whenever `ng build in-page --watch` rewrites it.
  await mkdir(dirname(uiBundle), { recursive: true });
  await wrapUiBundle();
  let timer;
  watchDir(dirname(uiBundle), () => {
    clearTimeout(timer);
    timer = setTimeout(() => wrapUiBundle().catch(console.error), 150);
  });
} else {
  await Promise.all(targets.map((t) => esbuild.build(t)));
  await wrapUiBundle();
}
