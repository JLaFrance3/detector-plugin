// Reads and validates C2PA manifests with @contentauth/c2pa-web (REQ-F-003, REQ-SEC-007).
// Runs in the offscreen document. Everything is local: the WASM binary, the worker script and
// the trust lists ship with the extension, and remote manifest/OCSP fetching is off
// (REQ-PRV-001, REQ-SEC-008).
import type { C2pa, Manifest, ManifestStore, ValidationStatus } from '@contentauth/c2pa-web';
import { Context, Reader, createC2pa } from '@contentauth/c2pa-web';
import c2paTrustList from './trust/C2PA-TRUST-LIST.pem';
import c2paTsaTrustList from './trust/C2PA-TSA-TRUST-LIST.pem';
import interimTrustList from './trust/anchors.pem';
import trustConfig from './trust/store.cfg';

/** Unsanitized result of reading one image. All strings are attacker-controlled. */
export interface C2paRawResult {
  /** True when the image carries a C2PA manifest store. */
  present: boolean;
  /** "Trusted" = valid and the signer chains to a bundled trust list; "Valid" = valid only. */
  validationState: 'Invalid' | 'Valid' | 'Trusted' | null;
  signerName: string | null;
  signerIssuer: string | null;
  signedAt: string | null;
  claimGenerator: string | null;
  digitalSourceTypes: string[];
  failures: { code: string; explanation: string | null }[];
  /** Set when the library could not parse the file at all. */
  error: string | null;
  /** Wall-clock time of the read, in milliseconds. */
  ms: number;
}

/**
 * c2pa-web only accepts an https: worker URL, but an extension must load the worker from its
 * own package: blob: workers (the library's default) are blocked by the MV3 CSP. A
 * chrome-extension: URL is same-origin and at least as trustworthy, so report it as https.
 */
class PackagedWorkerUrl extends URL {
  override get protocol(): string {
    return 'https:';
  }
}

let instance: Promise<C2pa> | undefined;

function c2pa(): Promise<C2pa> {
  instance ??= createC2pa({
    // The library verifies this file against a pinned SHA-512 integrity hash.
    wasmSrc: chrome.runtime.getURL('offscreen/vendor/c2pa_bg.wasm'),
    workerSrc: new PackagedWorkerUrl(chrome.runtime.getURL('offscreen/vendor/c2pa_worker.js')),
  });
  return instance;
}

// One Context for every read: its settings are resolved once and reused.
const context = new Context({
  verify: {
    verifyTrust: true,
    verifyAfterReading: true,
    verifyTimestampTrust: true,
    // No network during validation: both would leak which image is being checked.
    ocspFetch: false,
    remoteManifestFetch: false,
  },
  trust: {
    // Official C2PA trust list and TSA list, plus the interim (pre-2026) Content Credentials
    // list so that images signed before the official list existed still validate.
    trustAnchors: [c2paTrustList, c2paTsaTrustList, interimTrustList].join('\n'),
    trustConfig,
  },
});

export async function readC2pa(blob: Blob, mimeType: string | undefined): Promise<C2paRawResult> {
  const started = performance.now();
  const result: C2paRawResult = {
    present: false,
    validationState: null,
    signerName: null,
    signerIssuer: null,
    signedAt: null,
    claimGenerator: null,
    digitalSourceTypes: [],
    failures: [],
    error: null,
    ms: 0,
  };

  let reader: Reader | null = null;
  try {
    reader = await Reader.fromBlob(await c2pa(), mimeType, blob, context);
    if (reader) {
      const store = await reader.manifestStore();
      const manifest = activeManifest(store);
      result.present = true;
      result.validationState = store.validation_state ?? null;
      result.signerName = manifest?.signature_info?.common_name ?? null;
      result.signerIssuer = manifest?.signature_info?.issuer ?? null;
      result.signedAt = manifest?.signature_info?.time ?? null;
      result.claimGenerator = claimGenerator(manifest);
      result.digitalSourceTypes = manifest ? digitalSourceTypes(manifest) : [];
      result.failures = failures(store);
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    await reader?.free().catch(() => undefined);
  }
  result.ms = Math.round(performance.now() - started);
  return result;
}

function activeManifest(store: ManifestStore): Manifest | undefined {
  const label = store.active_manifest;
  return label ? store.manifests?.[label] : undefined;
}

function claimGenerator(manifest: Manifest | undefined): string | null {
  const info = manifest?.claim_generator_info?.[0];
  if (info?.name) return info.version ? `${info.name} ${info.version}` : info.name;
  return manifest?.claim_generator ?? null;
}

function failures(store: ManifestStore): C2paRawResult['failures'] {
  const list: ValidationStatus[] =
    store.validation_results?.activeManifest?.failure ?? store.validation_status ?? [];
  return list.map((s) => ({ code: String(s.code), explanation: s.explanation ?? null }));
}

/**
 * Collects every digitalSourceType declared by the active manifest's assertions: on actions
 * (c2pa.actions / c2pa.actions.v2) and in metadata assertions. Depth-limited because the
 * assertion data is untrusted.
 */
function digitalSourceTypes(manifest: Manifest): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8 || value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 200)) visit(item, depth + 1);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (/digitalsourcetype$/i.test(key) && typeof child === 'string') found.add(child);
      else visit(child, depth + 1);
    }
  };
  for (const assertion of manifest.assertions ?? []) visit(assertion.data, 0);
  return [...found];
}
