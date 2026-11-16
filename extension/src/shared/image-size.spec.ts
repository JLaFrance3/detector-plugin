import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_PIXELS, exceedsPixelLimit, imageDimensions } from './image-size';

const fixtures = join(import.meta.dirname, '..', '..', 'e2e', 'fixtures');
const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));

/** PNG signature plus an IHDR chunk declaring the given size. */
function pngHeader(width: number, height: number): Uint8Array {
  const be = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  return Uint8Array.from([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...be(13),
    ...ascii('IHDR'),
    ...be(width),
    ...be(height),
    8,
    2,
    0,
    0,
    0,
  ]);
}

/** Minimal JPEG: SOI, a short APP0 segment, then SOF0 with the given size. */
function jpegHeader(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    3,
    1,
    0x22,
    0,
    2,
    0x11,
    1,
    3,
    0x11,
    1,
  ]);
}

describe('imageDimensions', () => {
  it('REQ-NF-001: reads the size of real JPEG and PNG files', () => {
    expect(imageDimensions(readFileSync(join(fixtures, 'gradient.png')))).toEqual({
      width: 320,
      height: 240,
    });
    const jpeg = imageDimensions(readFileSync(join(fixtures, 'c2pa', 'adobe-20220124-A.jpg')));
    expect(jpeg?.width).toBe(1024);
    expect(jpeg?.height).toBeGreaterThan(0);
  });

  it('REQ-NF-001: reads constructed JPEG, PNG, WebP and GIF headers', () => {
    expect(imageDimensions(jpegHeader(4000, 3000))).toEqual({ width: 4000, height: 3000 });
    expect(imageDimensions(pngHeader(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    // Extended WebP: canvas width and height minus one, 24 bits each.
    const vp8x = Uint8Array.from([
      ...ascii('RIFF'),
      0,
      0,
      0,
      0,
      ...ascii('WEBP'),
      ...ascii('VP8X'),
      10,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0x7f,
      0x07,
      0x00,
      0x37,
      0x04,
      0x00,
    ]);
    expect(imageDimensions(vp8x)).toEqual({ width: 1920, height: 1080 });
    const gif = Uint8Array.from([...ascii('GIF89a'), 0x40, 0x01, 0xf0, 0x00, 0, 0, 0]);
    expect(imageDimensions(gif)).toEqual({ width: 320, height: 240 });
  });

  it('REQ-SEC-001: returns null for truncated, malformed or unknown data without throwing', () => {
    const inputs = [
      new Uint8Array(0),
      Uint8Array.from([0xff, 0xd8]),
      Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 1, 2, 3, 4, 5, 6]), // zero-length segment
      Uint8Array.from([0xff, 0xd8, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]),
      pngHeader(0, 100),
      Uint8Array.from(ascii('RIFF....WEBPXXXX')),
      Uint8Array.from(ascii('<svg xmlns="http://www.w3.org/2000/svg"/>')),
      new Uint8Array(64).fill(0xff),
    ];
    for (const input of inputs) expect(imageDimensions(input)).toBeNull();
  });
});

describe('exceedsPixelLimit', () => {
  it('REQ-NF-001: a small file declaring a huge canvas is rejected before decoding', () => {
    expect(MAX_PIXELS).toBe(50_000_000);
    expect(exceedsPixelLimit(pngHeader(60000, 60000))).toBe(true);
    expect(exceedsPixelLimit(jpegHeader(65535, 65535))).toBe(true);
    expect(exceedsPixelLimit(pngHeader(4000, 3000))).toBe(false);
    expect(exceedsPixelLimit(pngHeader(7071, 7071))).toBe(false);
    expect(exceedsPixelLimit(pngHeader(7072, 7072))).toBe(true);
  });

  it('REQ-NF-001: images whose size cannot be read are not blocked by this check', () => {
    expect(exceedsPixelLimit(new Uint8Array(10))).toBe(false);
  });
});
