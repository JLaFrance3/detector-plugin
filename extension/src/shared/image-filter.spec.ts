import { MIN_RENDERED_SIZE, checkableUrl, isLargeEnough, looksLikeSvg } from './image-filter';
import { MAX_IMAGE_BYTES } from './messages';

const image = (overrides: Partial<Parameters<typeof checkableUrl>[0]> = {}) => ({
  currentSrc: 'https://cdn.example/photo.jpg',
  src: 'https://cdn.example/photo.jpg',
  width: 640,
  height: 480,
  ...overrides,
});

describe('image filter', () => {
  it('REQ-F-001: images below 128 px in either rendered dimension are skipped', () => {
    expect(MIN_RENDERED_SIZE).toBe(128);
    expect(isLargeEnough(128, 128)).toBe(true);
    expect(isLargeEnough(127.9, 500)).toBe(false);
    expect(isLargeEnough(500, 127)).toBe(false);
    expect(checkableUrl(image({ width: 127, height: 600 }))).toBeNull();
    expect(checkableUrl(image({ width: 600, height: 64 }))).toBeNull();
    expect(checkableUrl(image({ width: 0, height: 0 }))).toBeNull();
    expect(checkableUrl(image({ width: 128, height: 128 }))).toBe('https://cdn.example/photo.jpg');
  });

  it('REQ-F-001: SVG images are skipped', () => {
    expect(looksLikeSvg('https://cdn.example/logo.svg')).toBe(true);
    expect(looksLikeSvg('https://cdn.example/logo.SVG?v=2#x')).toBe(true);
    expect(looksLikeSvg('https://cdn.example/logo.svgz')).toBe(true);
    expect(looksLikeSvg('data:image/svg+xml;base64,PHN2Zz4=')).toBe(true);
    expect(looksLikeSvg('https://cdn.example/svg-tutorial.png')).toBe(false);
    expect(checkableUrl(image({ currentSrc: 'https://cdn.example/logo.svg' }))).toBeNull();
    expect(checkableUrl(image({ currentSrc: 'data:image/svg+xml,<svg/>' }))).toBeNull();
  });

  it('REQ-F-001: the source the browser chose (picture, srcset) is the one checked', () => {
    expect(
      checkableUrl(
        image({
          currentSrc: 'https://cdn.example/photo-2x.webp',
          src: 'https://cdn.example/photo.jpg',
        }),
      ),
    ).toBe('https://cdn.example/photo-2x.webp');
    expect(checkableUrl(image({ currentSrc: '', src: 'https://cdn.example/fallback.jpg' }))).toBe(
      'https://cdn.example/fallback.jpg',
    );
    expect(checkableUrl(image({ currentSrc: '', src: '' }))).toBeNull();
  });

  it('REQ-F-001: data: URL images up to 20 MB are checked and larger ones skipped', () => {
    const small = `data:image/png;base64,${'A'.repeat(1000)}`;
    expect(checkableUrl(image({ currentSrc: small }))).toBe(small);
    // 20 MB of image data is about 26.7 million base64 characters.
    const atLimit = `data:image/jpeg;base64,${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3))}`;
    expect(checkableUrl(image({ currentSrc: atLimit }))).toBe(atLimit);
    const tooBig = `data:image/jpeg;base64,${'A'.repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1000)}`;
    expect(checkableUrl(image({ currentSrc: tooBig }))).toBeNull();
  });

  it('REQ-F-001: URLs the extension cannot fetch are skipped', () => {
    for (const currentSrc of [
      'blob:https://x.example/1234',
      'file:///C:/a.png',
      'about:blank',
      'chrome-extension://abc/icon.png',
    ]) {
      expect(checkableUrl(image({ currentSrc }))).toBeNull();
    }
  });
});
