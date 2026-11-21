import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  afterRenderEffect,
  inject,
  viewChildren,
} from '@angular/core';
import { chipText } from '../../../../src/shared/ui-bridge';
import { OverlayStore } from './overlay-store';
import { Popover } from './popover';

/**
 * Root of the in-page UI: the badges and the details popover.
 * It is the only component with styles: ShadowDom encapsulation keeps them inside the shadow
 * tree instead of the page's <head> (ADR-005, REQ-UI-006). Child components must not declare
 * their own styles; add them to app.css.
 */
@Component({
  selector: 'aid-root',
  imports: [Popover],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(OverlayStore);
  protected readonly chipText = chipText;
  private readonly badgeButtons = viewChildren<ElementRef<HTMLButtonElement>>('badgeButton');

  constructor() {
    // When a popover is closed from the keyboard, focus goes back to its badge (REQ-UI-005).
    afterRenderEffect(() => {
      const id = this.store.focusRequest();
      if (id === null) return;
      const button = this.badgeButtons().find(
        (ref) => ref.nativeElement.dataset['badge'] === String(id),
      );
      button?.nativeElement.focus({ preventScroll: true });
      this.store.focusRequest.set(null);
    });
  }
}
