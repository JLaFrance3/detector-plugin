import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('In-page App', () => {
  it('REQ-UI-006: renders inside its own shadow root', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot?.querySelector('.aid-overlay')).not.toBeNull();
  });
});
