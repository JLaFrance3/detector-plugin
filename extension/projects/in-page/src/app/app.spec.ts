import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('In-page App', () => {
  it('REQ-UI-006: renders inside its own shadow root with its styles', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot?.querySelector('style')?.textContent).toContain('.aid-badge');
  });

  it('REQ-F-007: shows no badge when there is nothing to flag', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.shadowRoot?.querySelector('.aid-badge')).toBeNull();
  });
});
