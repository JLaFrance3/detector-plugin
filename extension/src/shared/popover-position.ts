// REQ-UI-005: where to put the details popover so that it is anchored to its badge and stays
// inside the viewport. Pure geometry in document coordinates.

export const POPOVER_MAX_WIDTH = 320;
/** Gap kept between the popover and the viewport edges and between popover and badge. */
export const POPOVER_MARGIN = 8;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Viewport {
  scrollX: number;
  scrollY: number;
  width: number;
  height: number;
}

/** Width available to the popover: at most 320 px, less on a very narrow viewport. */
export function popoverWidth(viewportWidth: number): number {
  return Math.max(0, Math.min(POPOVER_MAX_WIDTH, viewportWidth - 2 * POPOVER_MARGIN));
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Top-left corner for a popover of the given size. Preferred placement is below the badge
 * with right edges aligned; it flips above when there is no room below, and is clamped to the
 * viewport as a last resort.
 */
export function placePopover(
  anchor: Box,
  size: { width: number; height: number },
  viewport: Viewport,
): { left: number; top: number } {
  const minLeft = viewport.scrollX + POPOVER_MARGIN;
  const maxLeft = viewport.scrollX + viewport.width - POPOVER_MARGIN - size.width;
  const left = clamp(anchor.left + anchor.width - size.width, minLeft, maxLeft);

  const viewTop = viewport.scrollY + POPOVER_MARGIN;
  const viewBottom = viewport.scrollY + viewport.height - POPOVER_MARGIN;
  const below = anchor.top + anchor.height + POPOVER_MARGIN / 2;
  const above = anchor.top - POPOVER_MARGIN / 2 - size.height;

  let top = below;
  if (below + size.height > viewBottom && above >= viewTop) top = above;
  top = clamp(top, viewTop, viewBottom - size.height);
  return { left: Math.round(left), top: Math.round(top) };
}
