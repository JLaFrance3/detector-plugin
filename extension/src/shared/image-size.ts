// Reads an image's pixel dimensions from its header without decoding it, so a small file
// that claims an enormous canvas (a decompression bomb) can be rejected before any decoder
// allocates memory for it. Hostile input: every read is bounds-checked.

export interface ImageSize {
  width: number;
  height: number;
}

/** Images above this many pixels are not decoded (about 7000 x 7000). */
export const MAX_PIXELS = 50_000_000;

const u16be = (b: Uint8Array, i: number): number => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number): number => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number): number => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number): number => u16be(b, i) * 0x10000 + u16be(b, i + 2);
const tag = (b: Uint8Array, i: number): string => String.fromCharCode(...b.subarray(i, i + 4));

function jpegSize(b: Uint8Array): ImageSize | null {
  let i = 2;
  // Walk the segments until a start-of-frame marker; cap the number of steps.
  for (let step = 0; step < 2000 && i + 9 < b.length; step++) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i++; // fill byte
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return { height: u16be(b, i + 5), width: u16be(b, i + 7) };
    const length = u16be(b, i + 2);
    if (length < 2) return null;
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): ImageSize | null {
  if (b.length < 30) return null;
  switch (tag(b, 12)) {
    case 'VP8X':
      return { width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    case 'VP8L': {
      const bits = u16le(b, 21) | (u16le(b, 23) << 16);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    case 'VP8 ':
      return { width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    default:
      return null;
  }
}

/** Dimensions of a JPEG, PNG, WebP or GIF, or null when they cannot be read. */
export function imageDimensions(bytes: Uint8Array): ImageSize | null {
  let size: ImageSize | null = null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8) size = jpegSize(bytes);
  else if (bytes[0] === 0x89 && tag(bytes, 12) === 'IHDR' && bytes.length >= 24) {
    size = { width: u32be(bytes, 16), height: u32be(bytes, 20) };
  } else if (tag(bytes, 0) === 'RIFF' && tag(bytes, 8) === 'WEBP') size = webpSize(bytes);
  else if (tag(bytes, 0) === 'GIF8' && bytes.length >= 10) {
    size = { width: u16le(bytes, 6), height: u16le(bytes, 8) };
  }
  return size && size.width > 0 && size.height > 0 ? size : null;
}

/** True when the header declares more pixels than the extension is willing to decode. */
export function exceedsPixelLimit(bytes: Uint8Array, maxPixels = MAX_PIXELS): boolean {
  const size = imageDimensions(bytes);
  return size !== null && size.width * size.height > maxPixels;
}
