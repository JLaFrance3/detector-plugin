import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { CAVEAT, CHECKER_LINKS, describeResult } from '../../../../src/shared/details';
import { placePopover, popoverWidth } from '../../../../src/shared/popover-position';
import { chipText } from '../../../../src/shared/ui-bridge';
import type { BadgeModel } from './overlay-store';
import { HIT_SIZE, OverlayStore } from './overlay-store';

/**
 * Details popover for one badge (REQ-F-008, REQ-UI-005). It declares no styles of its own:
 * all rules live in app.css so nothing is added to the page's <head> (see App).
 * Every value shown comes from the image and is rendered with {{ }} interpolation only
 * (REQ-SEC-002).
 */
@Component({
  selector: 'aid-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './popover.html',
})
export class Popover {
  readonly badge = input.required<BadgeModel>();

  protected readonly store = inject(OverlayStore);
  protected readonly details = computed(() => describeResult(this.badge().view.result));
  protected readonly kind = computed(() => this.badge().view.kind);
  protected readonly caveat = CAVEAT;
  protected readonly links = CHECKER_LINKS;
  protected readonly chipText = chipText;

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  /** Rendered height; 0 until the first measurement, during which the panel stays invisible. */
  protected readonly height = signal(0);
  protected readonly width = computed(() => popoverWidth(this.store.viewport().width));
  protected readonly position = computed(() => {
    const badge = this.badge();
    return placePopover(
      { left: badge.left, top: badge.top, width: HIT_SIZE, height: HIT_SIZE },
      { width: this.width(), height: this.height() },
      this.store.viewport(),
    );
  });

  constructor() {
    afterNextRender(() => {
      const element = this.panel().nativeElement;
      // Track the height so the placement stays right if the content wraps differently.
      const observer = new ResizeObserver(() => this.height.set(element.offsetHeight));
      observer.observe(element);
      this.height.set(element.offsetHeight);
      // Move keyboard focus into the dialog without scrolling the page.
      element.focus({ preventScroll: true });
    });
  }
}
