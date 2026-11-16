import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';
import { OverlayStore } from './overlay-store';

/**
 * Root of the in-page UI. It is the only component with styles: ShadowDom encapsulation keeps
 * them inside the shadow tree instead of the page's <head> (ADR-005, REQ-UI-006).
 * Child components must not declare their own styles; add them to app.css.
 */
@Component({
  selector: 'aid-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(OverlayStore);
}
