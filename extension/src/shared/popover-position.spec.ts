import type { Box, Viewport } from './popover-position';
import { POPOVER_MARGIN, placePopover, popoverWidth } from './popover-position';

const viewport = (overrides: Partial<Viewport> = {}): Viewport => ({
  scrollX: 0,
  scrollY: 0,
  width: 1280,
  height: 800,
  ...overrides,
});
const badge = (left: number, top: number): Box => ({ left, top, width: 24, height: 24 });
const size = { width: 320, height: 300 };

/** True when the popover lies fully inside the viewport. */
function inside(pos: { left: number; top: number }, s: typeof size, v: Viewport): boolean {
  return (
    pos.left >= v.scrollX &&
    pos.top >= v.scrollY &&
    pos.left + s.width <= v.scrollX + v.width &&
    pos.top + s.height <= v.scrollY + v.height
  );
}

describe('popover placement', () => {
  it('REQ-UI-005: at most 320 px wide', () => {
    expect(popoverWidth(1280)).toBe(320);
    expect(popoverWidth(320)).toBe(320 - 2 * POPOVER_MARGIN);
    expect(popoverWidth(10)).toBe(0);
  });

  it('REQ-UI-005: anchored below the badge with right edges aligned', () => {
    const pos = placePopover(badge(700, 100), size, viewport());
    expect(pos.left + size.width).toBe(724);
    expect(pos.top).toBe(100 + 24 + POPOVER_MARGIN / 2);
  });

  it('REQ-UI-005: flips above the badge near the bottom of the viewport', () => {
    const pos = placePopover(badge(700, 700), size, viewport());
    expect(pos.top + size.height).toBeLessThanOrEqual(700);
    expect(inside(pos, size, viewport())).toBe(true);
  });

  it('REQ-UI-005: shifts right when the badge is near the left edge', () => {
    const pos = placePopover(badge(40, 100), size, viewport());
    expect(pos.left).toBe(POPOVER_MARGIN);
  });

  it('REQ-UI-005: stays inside the viewport when the page is scrolled', () => {
    const v = viewport({ scrollX: 300, scrollY: 5000 });
    const pos = placePopover(badge(320, 5750), size, v);
    expect(inside(pos, size, v)).toBe(true);
  });

  it('REQ-UI-005: stays inside the viewport for badges anywhere on screen', () => {
    const v = viewport({ scrollY: 1200, width: 1024, height: 700 });
    for (let x = 0; x <= 1000; x += 100) {
      for (let y = 1200; y <= 1876; y += 52) {
        expect(inside(placePopover(badge(x, y), size, v), size, v)).toBe(true);
      }
    }
  });

  it('REQ-UI-005: keeps the top edge visible when the popover is taller than the viewport', () => {
    const v = viewport({ height: 200 });
    const pos = placePopover(badge(700, 50), size, v);
    expect(pos.top).toBe(POPOVER_MARGIN);
  });
});
