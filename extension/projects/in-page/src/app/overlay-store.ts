import { Injectable, computed, signal } from '@angular/core';
import type { Viewport } from '../../../../src/shared/popover-position';
import type { BadgeView, SecondOpinionView, UiOptions } from '../../../../src/shared/ui-bridge';

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
  /** False while the image is hidden, clipped, scrolled out of view or covered. */
  readonly visible: boolean;
}

interface Entry {
  id: number;
  view: BadgeView;
  /** Whether any part of the image is inside the viewport and its scroll containers. */
  inView: boolean;
}

/**
 * Holds the badges to render and keeps them positioned over their images.
 * Badges are absolutely positioned overlays in document coordinates, so they never change
 * the page's layout (REQ-UI-001).
 */
@Injectable({ providedIn: 'root' })
export class OverlayStore {
  readonly badges = signal<readonly BadgeModel[]>([]);
  /** Id of the badge whose details popover is open, if any. */
  readonly openId = signal<number | null>(null);
  /** REQ-UI-004: "Hide on this page" removes every badge until the page is reloaded. */
  readonly hidden = signal(false);
  /** Set when a closing popover should hand keyboard focus back to its badge. */
  readonly focusRequest = signal<number | null>(null);
  readonly viewport = signal<Viewport>({ scrollX: 0, scrollY: 0, width: 0, height: 0 });

  readonly openBadge = computed(() => {
    const id = this.openId();
    return this.badges().find((b) => b.id === id && b.visible) ?? null;
  });

  /** The element carrying the closed shadow root; set once by main.ts. */
  hostElement: Element | null = null;

  private readonly entries = new Map<HTMLImageElement, Entry>();
  private resizeObserver?: ResizeObserver;
  private intersectionObserver?: IntersectionObserver;
  private nextId = 1;
  private frame = 0;
  private listening = false;

  /** REQ-F-009: whether to offer the cloud second opinion button. */
  readonly cloudEnabled = signal(false);
  /** Second opinions by badge id: in progress, or the outcome. */
  readonly opinions = signal<ReadonlyMap<number, 'loading' | SecondOpinionView>>(new Map());
  private opinionHandler: UiOptions['requestSecondOpinion'] | null = null;

  configure(options: UiOptions): void {
    this.cloudEnabled.set(options.cloudEnabled);
    this.opinionHandler = options.requestSecondOpinion;
  }

  /** Runs once per badge, and only from a click on its button (REQ-F-009). */
  async requestOpinion(id: number): Promise<void> {
    if (!this.cloudEnabled() || !this.opinionHandler || this.opinions().has(id)) return;
    const image = [...this.entries].find(([, entry]) => entry.id === id)?.[0];
    if (!image) return;
    const set = (value: 'loading' | SecondOpinionView): void =>
      this.opinions.update((current) => new Map(current).set(id, value));
    set('loading');
    set(
      await this.opinionHandler(image).catch((): SecondOpinionView => ({ status: 'unavailable' })),
    );
  }

  show(image: HTMLImageElement, view: BadgeView): void {
    const existing = this.entries.get(image);
    if (existing) {
      existing.view = view;
    } else {
      this.listen();
      this.entries.set(image, { id: this.nextId++, view, inView: true });
      this.resizeObserver?.observe(image);
      this.intersectionObserver?.observe(image);
    }
    this.scheduleMeasure();
  }

  remove(image: HTMLImageElement): void {
    const entry = this.entries.get(image);
    if (!entry) return;
    this.forget(image);
    if (this.openId() === entry.id) this.openId.set(null);
    this.scheduleMeasure();
  }

  toggle(id: number): void {
    this.openId.update((open) => (open === id ? null : id));
  }

  /** Closes the popover; `returnFocus` when it was closed from the keyboard or its own button. */
  close(returnFocus: boolean): void {
    const id = this.openId();
    if (id === null) return;
    this.openId.set(null);
    if (returnFocus) this.focusRequest.set(id);
  }

  hidePage(): void {
    this.openId.set(null);
    this.hidden.set(true);
  }

  private forget(image: HTMLImageElement): void {
    this.entries.delete(image);
    this.resizeObserver?.unobserve(image);
    this.intersectionObserver?.unobserve(image);
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
    // Tells us when an image is clipped away by a scroll container or leaves the viewport.
    this.intersectionObserver = new IntersectionObserver((records) => {
      for (const record of records) {
        const entry = this.entries.get(record.target as HTMLImageElement);
        if (entry) entry.inView = record.isIntersecting;
      }
      this.scheduleMeasure();
    });

    // REQ-UI-005: the popover closes on Esc and on a click outside the extension's UI.
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && this.openId() !== null) this.close(true);
      },
      true,
    );
    document.addEventListener(
      'pointerdown',
      (event) => {
        // Events from inside the closed shadow root are retargeted to the host element.
        if (this.openId() !== null && event.target !== this.hostElement) this.close(false);
      },
      true,
    );
  }

  private scheduleMeasure(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.measure();
    });
  }

  private measure(): void {
    const root = document.documentElement;
    const viewport: Viewport = {
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      width: root.clientWidth,
      height: root.clientHeight,
    };
    const next: BadgeModel[] = [];
    for (const [image, entry] of this.entries) {
      if (!image.isConnected) {
        this.forget(image);
        continue;
      }
      const rect = image.getBoundingClientRect();
      const x = rect.right - HIT_INSET - HIT_SIZE;
      const y = rect.top + HIT_INSET;
      const visible =
        entry.inView &&
        rect.width >= HIT_SIZE &&
        rect.height >= HIT_SIZE &&
        !this.isCovered(image, x + HIT_SIZE / 2, y + HIT_SIZE / 2, viewport);
      next.push({
        id: entry.id,
        view: entry.view,
        left: Math.round(x + viewport.scrollX),
        top: Math.round(y + viewport.scrollY),
        visible,
      });
    }
    if (!sameBadges(this.badges(), next)) this.badges.set(next);
    const previous = this.viewport();
    if (
      previous.scrollX !== viewport.scrollX ||
      previous.scrollY !== viewport.scrollY ||
      previous.width !== viewport.width ||
      previous.height !== viewport.height
    ) {
      this.viewport.set(viewport);
    }
  }

  /**
   * True when something fixed or sticky (a site header, a cookie bar, a modal) is drawn over
   * the badge's spot. The badge would otherwise float above it, because the UI host sits on
   * top of the page. Ordinary overlays inside the image's own card do not count.
   */
  private isCovered(image: HTMLImageElement, x: number, y: number, viewport: Viewport): boolean {
    if (x < 0 || y < 0 || x > viewport.width || y > viewport.height) return false;
    const top = document.elementsFromPoint(x, y).find((el) => el !== this.hostElement);
    if (!top || top === image || top.contains(image) || image.contains(top)) return false;
    for (
      let el: Element | null = top;
      el && el !== document.documentElement;
      el = el.parentElement
    ) {
      const position = getComputedStyle(el).position;
      if (position === 'fixed' || position === 'sticky') return !el.contains(image);
    }
    return false;
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
