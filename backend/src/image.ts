// REQ-SEC-005: the upload's type is decided by its magic bytes, not by the Content-Type header.

export type AllowedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/** REQ-SEC-005: uploads of at most 5 MB. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, i) => bytes[offset + i] === byte);

const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));

/** REQ-F-012: JPEG, PNG and WebP only. Returns null for anything else. */
export function detectImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp';
  return null;
}
