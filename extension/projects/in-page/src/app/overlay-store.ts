import { Injectable, signal } from '@angular/core';
import type { BadgeView } from '../../../../src/shared/ui-bridge';

/** Size of the badge's click target (REQ-UI-001). The visible chip is 20 px, centred in it. */
export const HIT_SIZE = 24;
/** Gap between the visible chip and the image's top and right edges (REQ-UI-001). */
export const INSET = 4;
const CHIP_SIZE = 20;
/** Offset of the click target so that the chip inside it sits INSET px from the edges. */
const HIT_INSET = INSET - (HIT_SIZE - CHIP_SIZE) / 2;

export interface BadgeModel {
  readonly id: number;
  readonly view: BadgeView;
  /** Document coordinates of the click target's top-left corner. */
  readonly left: number;
  readonly top: number;
  /** False while the image has no layout box (hidden or detached). */
  readonly visible: boolean;
}

interface Entry {
  id: number;
  view: BadgeView;
}

/**
 * Holds the badges to render and keeps them positioned over their images.
 * Badges are absolutely positioned overlays in document coordinates, so they never change
 * the page's layout (REQ-UI-001).
 */
@Injectable({ providedIn: 'root' })
export class OverlayStore {
  readonly badges = signal<readonly BadgeModel[]>([]);

  private readonly entries = new Map<HTMLImageElement, Entry>();
  private resizeObserver?: ResizeObserver;
  private nextId = 1;
  private frame = 0;
  private listening = false;

  show(image: HTMLImageElement, view: BadgeView): void {
    const existing = this.entries.get(image);
    if (existing) {
      existing.view = view;
    } else {
      this.listen();
      this.entries.set(image, { id: this.nextId++, view });
      this.resizeObserver?.observe(image);
    }
    this.scheduleMeasure();
  }

  remove(image: HTMLImageElement): void {
    if (!this.entries.delete(image)) return;
    this.resizeObserver?.unobserve(image);
    this.scheduleMeasure();
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    const onChange = () => this.scheduleMeasure();
    // Capture phase so scrolling inside any nested scroll container is seen too.
    window.addEventListener('scroll', onChange, { capture: true, passive: true });
    window.addEventListener('resize', onChange, { passive: true });
    this.resizeObserver = new ResizeObserver(onChange);
    this.resizeObserver.observe(document.documentElement);
  }

  private scheduleMeasure(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
    });
  }

  private measure(): void {
    const next: BadgeModel[] = [];
    for (const [image, entry] of this.entries) {
      if (!image.isConnected) {
        this.entries.delete(image);
        this.resizeObserver?.unobserve(image);
        continue;
      }
      const rect = image.getBoundingClientRect();
      next.push({
        id: entry.id,
        view: entry.view,
        left: Math.round(rect.right + window.scrollX - HIT_INSET - HIT_SIZE),
        top: Math.round(rect.top + window.scrollY + HIT_INSET),
        visible: rect.width > 0 && rect.height > 0,
      });
    }
    if (!sameBadges(this.badges(), next)) this.badges.set(next);
  }
}

function sameBadges(a: readonly BadgeModel[], b: readonly BadgeModel[]): boolean {
  return (
    a.length === b.length &&
    a.every((x, i) => {
      const y = b[i];
      return (
        y !== undefined &&
        x.id === y.id &&
        x.view === y.view &&
        x.left === y.left &&
        x.top === y.top &&
        x.visible === y.visible
      );
    })
  );
}
