#!/usr/bin/env node
// TASK-005 spike check: runs the detector model in the offscreen document on WebGPU and WASM,
// and reports load time, per-image time, scores and every network host contacted.
// Usage: node e2e/spike-detector.mjs [device/dtype ...]   e.g. webgpu/fp32 wasm/q8
//        AID_E2E_HEADED=1 shows the browser window (WebGPU may need it on some machines).
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { launch, serve } from './harness.mjs';

// Sample images are downloaded from Wikimedia Commons into e2e/output (not committed).
const commons = (path, width = 960) =>
  `https://commons.wikimedia.org/w/index.php?title=Special:Redirect/file/${encodeURIComponent(path)}&width=${width}`;
const samples = [
  ['ai-anime-girl.jpg', commons('An anime girl editing Wikipedia.jpg')],
  ['ai-neural-links.jpg', commons('Neural links (abstraction) 01.jpg')],
  ['ai-esame.jpg', commons('AI-esame.jpg')],
  ['ai-shopping-addiction.jpg', commons('Shopping addiction AI 4.jpg')],
  ['ai-tiefe-zeit.jpg', commons('Tiefe Zeit (Computerphantasie).jpg')],
  ['real-agama.jpg', commons('Roughtail rock agama (Stellagama stellio brachydactyla).jpg')],
  ['real-chameleon.jpg', commons('Blue-legged chameleon (Calumma crypticum) male Ranomafana.jpg')],
  ['real-hawk-moth.jpg', commons('Hummingbird hawk moth (Macroglossum stellatarum) in flight.jpg')],
  ['real-platypus.jpg', commons('Duck-billed platypus (Ornithorhynchus anatinus) Scottsdale.jpg')],
  ['real-autignac.jpg', commons('Autignac, Hérault 01.jpg')],
];

const sampleDir = join(import.meta.dirname, 'output', 'detector-samples');
await mkdir(sampleDir, { recursive: true });
for (const [name, url] of samples) {
  const file = join(sampleDir, name);
  if (await stat(file).catch(() => null)) continue;
  const response = await fetch(url, {
    headers: { 'user-agent': 'aid-spike/0.1 (course project)' },
  });
  if (!response.ok) throw new Error(`download failed for ${name}: HTTP ${response.status}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  await new Promise((resolve) => setTimeout(resolve, 5000)); // Commons rate-limits bursts
}
const names = (await readdir(sampleDir)).filter((f) => f.endsWith('.jpg')).sort();

const configs = (
  process.argv.slice(2).length ? process.argv.slice(2) : ['webgpu/fp32', 'wasm/q8']
).map((c) => {
  const [device, dtype] = c.split('/');
  return { device, dtype };
});

const site = await serve(sampleDir);
const browser = await launch({
  headless: !process.env.AID_E2E_HEADED,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
});
const failures = [];
try {
  const page = await browser.context.newPage();
  await page.goto(`chrome-extension://${browser.extensionId}/popup/index.html`);
  const detect = (name, detector) =>
    page.evaluate(
      ([url, d]) => chrome.runtime.sendMessage({ type: 'spike:detect', url, detector: d }),
      [`${site.url}/${name}`, detector],
    );

  for (const config of configs) {
    const label = `${config.device}/${config.dtype}`;
    console.log(`\n=== ${label}`);
    const started = Date.now();
    const first = await detect(names[0], config);
    if (first?.error) {
      console.log(`not available: ${first.error}`);
      failures.push(`${label}: ${first.error}`);
      continue;
    }
    console.log(
      `model ready after ${((Date.now() - started) / 1000).toFixed(1)} s (load ${first.loadMs} ms, includes download on first run)`,
    );
    const times = [];
    for (const name of names) {
      const result = await detect(name, config);
      if (result?.error) {
        failures.push(`${label} ${name}: ${result.error}`);
        continue;
      }
      times.push(result.ms);
      console.log(`${name.padEnd(28)} score ${result.score.toFixed(4)}  ${result.ms} ms`);
    }
    times.sort((a, b) => a - b);
    console.log(`median ${times[Math.floor(times.length / 2)]} ms over ${times.length} images`);
  }

  // Playwright does not see the offscreen document's requests, so ask the document itself.
  const resources = await page.evaluate(() =>
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'spike:network' }),
  );
  console.log('\nresources loaded by the offscreen document:');
  for (const { url, bytes } of resources) {
    const u = new URL(url);
    const local = u.protocol === 'chrome-extension:';
    console.log(`  ${local ? 'packaged' : u.host} ${u.pathname.slice(0, 90)} (${bytes} bytes)`);
    if (local) continue;
    // Only model files may come from the network (REQ-SEC-008): no scripts, no WASM.
    const allowedHost = /(^|\.)(huggingface\.co|hf\.co)$/.test(u.host);
    if (!allowedHost) failures.push(`unexpected host: ${u.host}`);
    if (/\.(m?js|wasm)$/.test(u.pathname)) failures.push(`runtime code from the network: ${url}`);
  }
} finally {
  await browser.close();
  await site.close();
}

if (failures.length) {
  console.error(`\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('\nspike-detector: ok');
