// REQ-F-001: finds <img> elements (including those inside <picture>) when they first become
// visible, including images added after page load, and reports each image URL once.
//
// - MutationObserver notices images added later (infinite scroll, client-side rendering).
// - IntersectionObserver reports when an image enters the viewport; images that never become
//   visible are never reported, so they are never fetched or checked.
// - A capturing `load` listener notices when a visible image gets a new source (lazy loading,
//   carousels), because `load` events do not bubble but can be captured.
import { checkableUrl } from '../shared/image-filter';
import { timed } from '../shared/perf';
import { UI_HOST_TAG } from '../shared/ui-bridge';

export interface ImageWatcherEvents {
  /** A visible image should be checked. Called at most once per image and URL. */
  onCandidate(image: HTMLImageElement, url: string): void;
  /** A previously reported image changed its source; any badge for it is now stale. */
  onSourceChanged(image: HTMLImageElement): void;
}

export class ImageWatcher {
  /** URL already reported for an image, so each image is queued at most once per source. */
  private readonly reported = new WeakMap<HTMLImageElement, string>();
  private readonly visible = new WeakSet<HTMLImageElement>();
  private readonly intersections: IntersectionObserver;
  private readonly mutations: MutationObserver;
  private readonly onLoad = (event: Event): void => {
    const target = event.target;
    if (target instanceof HTMLImageElement && this.visible.has(target)) {
      timed('content.load', () => this.consider(target));
    }
  };

  constructor(
    private readonly root: Document,
    private readonly events: ImageWatcherEvents,
  ) {
    this.intersections = new IntersectionObserver((entries) => {
      timed('content.intersection', () => this.onIntersections(entries));
    });
    this.mutations = new MutationObserver((records) => {
      timed('content.mutation', () => {
        for (const record of records) {
          for (const node of record.addedNodes) this.observeTree(node);
        }
      });
    });
  }

  private onIntersections(entries: IntersectionObserverEntry[]): void {
    {
      for (const entry of entries) {
        const image = entry.target as HTMLImageElement;
        if (entry.isIntersecting) {
          this.visible.add(image);
          this.consider(image);
        } else {
          this.visible.delete(image);
        }
      }
    }
  }

  start(): void {
    timed('content.start', () => this.observeTree(this.root.documentElement));
    this.mutations.observe(this.root.documentElement, { childList: true, subtree: true });
    this.root.addEventListener('load', this.onLoad, true);
  }

  stop(): void {
    this.intersections.disconnect();
    this.mutations.disconnect();
    this.root.removeEventListener('load', this.onLoad, true);
  }

  private observeTree(node: Node): void {
    if (!(node instanceof Element)) return;
    // Never look inside the extension's own UI.
    if (node.localName === UI_HOST_TAG || node.closest(UI_HOST_TAG)) return;
    if (node instanceof HTMLImageElement) this.intersections.observe(node);
    // getElementsByTagName is live and fast; copying keeps iteration stable.
    for (const image of Array.from(node.getElementsByTagName('img'))) {
      this.intersections.observe(image);
    }
  }

  /** Reports the image if it is checkable and its current source has not been reported yet. */
  private consider(image: HTMLImageElement): void {
    // Wait for the image to load: before that there is no reliable source or size. The
    // capturing load listener calls back here when it has.
    if (!image.complete || image.naturalWidth === 0) return;
    const rect = image.getBoundingClientRect();
    const url = checkableUrl({
      currentSrc: image.currentSrc,
      src: image.src,
      width: rect.width,
      height: rect.height,
    });
    const previous = this.reported.get(image);
    if (url === previous) return;
    if (previous !== undefined) this.events.onSourceChanged(image);
    if (url === null) {
      this.reported.delete(image);
      return;
    }
    this.reported.set(image, url);
    this.events.onCandidate(image, url);
  }
}
