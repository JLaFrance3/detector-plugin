// REQ-F-001: which images are worth checking. Pure functions used by the content script.
import { isCheckableImageUrl } from './messages';

/** Images smaller than this in either rendered dimension are skipped. */
export const MIN_RENDERED_SIZE = 128;

export function isLargeEnough(width: number, height: number): boolean {
  return width >= MIN_RENDERED_SIZE && height >= MIN_RENDERED_SIZE;
}

/** True when the URL clearly points at an SVG (the fetch step also checks the real bytes). */
export function looksLikeSvg(url: string): boolean {
  if (/^data:image\/svg\+xml/i.test(url)) return true;
  try {
    return /\.svgz?$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export interface ImageCandidate {
  /** `img.currentSrc`: the source the browser chose, including from <picture> and srcset. */
  currentSrc: string;
  /** `img.src`, used before the browser has picked a source. */
  src: string;
  /** Rendered size in CSS pixels. */
  width: number;
  height: number;
}

/**
 * The URL to check for an image, or null when the image should be skipped: too small, SVG,
 * no usable URL, a scheme the extension cannot fetch, or a data: URL above 20 MB.
 */
export function checkableUrl(image: ImageCandidate): string | null {
  if (!isLargeEnough(image.width, image.height)) return null;
  const url = image.currentSrc || image.src;
  if (!url || looksLikeSvg(url)) return null;
  return isCheckableImageUrl(url) ? url : null;
}
