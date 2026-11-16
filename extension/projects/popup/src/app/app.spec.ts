import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('Popup App', () => {
  it('REQ-F-010: renders the settings popup shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('h1')?.textContent).toContain('AI Image Detector');
  });
});
