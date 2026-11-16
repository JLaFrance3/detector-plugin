import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Root of the in-page UI. It is the only component with styles: ShadowDom encapsulation keeps
 * them inside the shadow tree instead of the page's <head> (ADR-005, REQ-UI-006).
 */
@Component({
  selector: 'aid-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.ShadowDom,
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {}
