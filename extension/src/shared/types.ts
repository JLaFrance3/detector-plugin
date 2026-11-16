// Domain types shared by the service worker, offscreen document, content script and UI.
// Everything here is plain JSON so it can cross chrome.runtime messages and chrome.storage.

/** REQ-F-005: exactly one verdict per image. */
export type Verdict = 'definite' | 'likely' | 'none';

/** IPTC digital source type, reduced to what the extension acts on. */
export type AiSource = 'generated' | 'edited';

export type C2paValidation = 'trusted' | 'valid-untrusted' | 'invalid';

/** Result of reading C2PA Content Credentials. All strings are already sanitized. */
export interface C2paSignal {
  /** True when the image carries a C2PA manifest. */
  present: boolean;
  /** Signature, hash binding and certificate chain all check out. */
  valid: boolean;
  /** Valid and the signer chains to the C2PA trust list (REQ-SEC-007). */
  trusted: boolean;
  signer: string | null;
  /** Claim generator: the tool that produced the manifest. */
  tool: string | null;
  signedAt: string | null;
  /** AI source type declared by the manifest, if any. */
  aiSource: AiSource | null;
  /** The manifest declares a camera capture. */
  cameraCapture: boolean;
  /** Why validation failed, when it did (a validation status code). */
  failureReason: string | null;
}

/** Result of reading unsigned IPTC/XMP metadata (REQ-F-004). */
export interface IptcSignal {
  aiSource: AiSource | null;
}

/** Result of the on-device detector (REQ-F-006). */
export interface DetectorSignal {
  /** Probability from 0 to 1 that the image is AI-generated. */
  score: number;
}

/** Everything the checks found for one image. `null` means that check did not run. */
export interface ImageSignals {
  c2pa: C2paSignal | null;
  iptc: IptcSignal | null;
  detector: DetectorSignal | null;
}

/** How the confidence is presented (REQ-F-005 table). */
export type Confidence =
  { kind: 'credentials' } | { kind: 'metadata' } | { kind: 'score'; percent: number };

/** The verdict for one image plus the evidence shown in the details popover. */
export interface ImageResult {
  verdict: Verdict;
  /** "AI-generated" or "AI-edited" for Definite; "Likely AI" for Likely; null for None. */
  label: string | null;
  confidence: Confidence | null;
  signals: ImageSignals;
  /**
   * Set when valid Content Credentials say the image came from a camera but the detector
   * still ran (REQ-F-005); the popover shows the detector result with that context.
   */
  cameraCaptureContext: boolean;
}

/** Model status shown in the popup (REQ-F-010). */
export type ModelStatus =
  | { state: 'not-downloaded' }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; device: 'webgpu' | 'wasm' }
  | { state: 'error' };

export interface Settings {
  /** Global on/off switch. */
  enabled: boolean;
  /** Hostnames where the extension is switched off. */
  disabledSites: string[];
  /** Cloud second opinion (REQ-F-009). Off by default. */
  cloudEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  disabledSites: [],
  cloudEnabled: false,
};

/**
 * Detector threshold T (REQ-F-005). Calibrated in TASK-022: the lowest value with a real-photo
 * false positive rate of at most 5% on the evaluation set (see extension/eval/RESULTS.md).
 */
export const DEFAULT_THRESHOLD = 0.5;
