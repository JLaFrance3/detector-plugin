import { TestBed } from '@angular/core/testing';
import type { ImageResult } from '../../../../src/shared/types';
import { decideVerdict } from '../../../../src/shared/verdict';
import { App } from './app';
import type { BadgeModel } from './overlay-store';
import { OverlayStore } from './overlay-store';

// jsdom has no ResizeObserver; the popover only uses it to track its own height.
class FakeResizeObserver {
  observe(): void {
    /* not needed in tests */
  }
  unobserve(): void {
    /* not needed in tests */
  }
  disconnect(): void {
    /* not needed in tests */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= FakeResizeObserver;

const HOSTILE = '<img src=x onerror="window.__pwned = true"><script>window.__pwned = true</script>';

function badge(id: number, result: ImageResult, overrides: Partial<BadgeModel> = {}): BadgeModel {
  const kind = result.verdict === 'definite' ? 'definite' : 'likely';
  return {
    id,
    view: { kind, tooltip: `${result.label} ${HOSTILE}`, result },
    left: 100,
    top: 50,
    visible: true,
    ...overrides,
  };
}

const definite = decideVerdict({
  c2pa: {
    present: true,
    valid: true,
    trusted: true,
    signer: HOSTILE,
    tool: `Tool ${HOSTILE}`,
    signedAt: '2025-08-13T16:30:55+00:00',
    aiSource: 'generated',
    cameraCapture: false,
    failureReason: null,
  },
  iptc: null,
  detector: null,
});
const likely = decideVerdict({ c2pa: null, iptc: null, detector: { score: 0.93 } });

async function render() {
  const fixture = TestBed.createComponent(App);
  const store = TestBed.inject(OverlayStore);
  const root = () => (fixture.nativeElement as HTMLElement).shadowRoot as ShadowRoot;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await settle();
  return { fixture, store, root, settle };
}

describe('In-page App', () => {
  it('REQ-UI-006: renders inside its own shadow root with its styles', async () => {
    const { root } = await render();
    expect(root()).not.toBeNull();
    expect(root().querySelector('style')?.textContent).toContain('.aid-badge');
  });

  it('REQ-F-007: shows no badge when there is nothing to flag', async () => {
    const { root } = await render();
    expect(root().querySelector('.aid-badge')).toBeNull();
  });

  it('REQ-UI-002: Definite and Likely badges differ by text and shape, with tooltip text', async () => {
    const { store, root, settle } = await render();
    store.badges.set([badge(1, definite), badge(2, likely)]);
    await settle();
    const buttons = [...root().querySelectorAll('.aid-badge')];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.querySelector('.aid-chip')?.textContent?.trim()).toBe('AI');
    expect(buttons[1]?.querySelector('.aid-chip')?.textContent?.trim()).toBe('AI?');
    expect(buttons[0]?.querySelector('.aid-chip-likely')).toBeNull();
    expect(buttons[1]?.querySelector('.aid-chip-likely')).not.toBeNull();
    expect(buttons[1]?.getAttribute('aria-label')).toContain('Likely AI');
  });

  it('REQ-UI-001: a hidden or covered image shows no badge', async () => {
    const { store, root, settle } = await render();
    store.badges.set([badge(1, definite, { visible: false })]);
    await settle();
    expect(root().querySelector('.aid-badge')).toBeNull();
  });

  it('REQ-SEC-002: untrusted text is rendered as text, never as markup', async () => {
    const { store, root, settle } = await render();
    store.badges.set([badge(1, definite)]);
    store.openId.set(1);
    await settle();
    const popover = root().querySelector('.aid-popover');
    expect(popover).not.toBeNull();
    // The hostile strings appear literally...
    expect(popover?.textContent).toContain('<img src=x onerror=');
    expect(root().querySelector('.aid-badge')?.getAttribute('aria-label')).toContain('<script>');
    // ...and created no elements and ran nothing.
    expect(root().querySelector('img')).toBeNull();
    expect(root().querySelector('script')).toBeNull();
    expect((globalThis as { __pwned?: boolean }).__pwned).toBeUndefined();
  });

  it('REQ-F-008: the popover shows verdict, signals, caveat and checker links', async () => {
    const { store, root, settle } = await render();
    store.badges.set([badge(2, likely)]);
    store.openId.set(2);
    await settle();
    const popover = root().querySelector('.aid-popover') as HTMLElement;
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(popover.getAttribute('aria-label')).toBe('AI image details');
    expect(popover.textContent).toContain('Likely AI');
    expect(popover.textContent).toContain('Detector score 93%');
    expect(popover.textContent).toContain('No mark does not mean an image is real.');
    const links = [...popover.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://synthid.com/',
      'https://openai.com/verify',
      'https://claude.com/check-content',
    ]);
    expect(links.every((a) => a.target === '_blank' && a.rel === 'noopener noreferrer')).toBe(true);
  });

  it('REQ-UI-005: the close button closes the popover', async () => {
    const { store, root, settle } = await render();
    store.badges.set([badge(1, definite)]);
    store.openId.set(1);
    await settle();
    (root().querySelector('.aid-close') as HTMLButtonElement).click();
    await settle();
    expect(root().querySelector('.aid-popover')).toBeNull();
    expect(store.openId()).toBeNull();
  });

  it('REQ-UI-004: "Hide on this page" removes every badge', async () => {
    const { store, root, settle } = await render();
    store.badges.set([badge(1, definite), badge(2, likely)]);
    store.openId.set(1);
    await settle();
    (root().querySelector('.aid-hide-page') as HTMLButtonElement).click();
    await settle();
    expect(root().querySelector('.aid-badge')).toBeNull();
    expect(root().querySelector('.aid-popover')).toBeNull();
  });

  it('REQ-UI-003: nothing in the UI claims an image is real', async () => {
    const { store, root, settle } = await render();
    store.badges.set([badge(2, likely)]);
    store.openId.set(2);
    await settle();
    const text = (root().textContent ?? '').toLowerCase();
    for (const claim of ['authentic', 'human-made', 'verified real', 'not ai', '✓']) {
      expect(text).not.toContain(claim);
    }
  });
});
