import { TestBed } from '@angular/core/testing';
import type { ModelStatus, Settings } from '../../../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../../../src/shared/types';
import { App } from './app';
import type { ExtensionApi } from './extension-api';
import { EXTENSION_API } from './extension-api';

/** In-memory stand-in for the Chrome APIs the popup uses. */
class FakeApi implements ExtensionApi {
  settings: Settings = { ...DEFAULT_SETTINGS };
  modelStatus: ModelStatus = { state: 'not-downloaded' };
  hostname: string | null = 'news.example';
  cleared = 0;
  cached = 12;
  private listener?: (change: { settings?: Settings; modelStatus?: ModelStatus }) => void;

  loadSettings = () => Promise.resolve(this.settings);
  saveSettings = (settings: Settings) => {
    this.settings = settings;
    return Promise.resolve();
  };
  loadModelStatus = () => Promise.resolve(this.modelStatus);
  activeHostname = () => Promise.resolve(this.hostname);
  clearCache = () => {
    this.cleared++;
    return Promise.resolve(this.cached);
  };
  onChange = (listener: (change: { settings?: Settings; modelStatus?: ModelStatus }) => void) => {
    this.listener = listener;
    return () => (this.listener = undefined);
  };
  emit(change: { settings?: Settings; modelStatus?: ModelStatus }): void {
    this.listener?.(change);
  }
}

async function render(configure?: (api: FakeApi) => void) {
  const api = new FakeApi();
  configure?.(api);
  TestBed.configureTestingModule({ providers: [{ provide: EXTENSION_API, useValue: api }] });
  const fixture = TestBed.createComponent(App);
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    // Let pending promises (the fake API calls) resolve before rendering.
    await new Promise<void>((resolve) => setTimeout(resolve));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await settle();
  const input = (id: string) => el.querySelector(`#${id}`) as HTMLInputElement;
  const toggle = async (id: string) => {
    const box = input(id);
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change'));
    await settle();
  };
  return { api, el, settle, input, toggle };
}

describe('Popup App', () => {
  it('REQ-F-010: shows the default settings: on globally, cloud second opinion off', async () => {
    const { el, input } = await render();
    expect(el.querySelector('h1')?.textContent).toContain('AI Image Detector');
    expect(input('enabled').checked).toBe(true);
    expect(input('site-enabled').checked).toBe(true);
    expect(input('cloud-enabled').checked).toBe(false);
  });

  it('REQ-F-010: turning the extension off globally is saved', async () => {
    const { api, toggle, input } = await render();
    await toggle('enabled');
    expect(api.settings.enabled).toBe(false);
    // The per-site switch is meaningless while everything is off.
    expect(input('site-enabled').disabled).toBe(true);
  });

  it('REQ-F-010: turning it off for the current site stores the hostname', async () => {
    const { api, el, toggle } = await render();
    expect(el.textContent).toContain('news.example');
    await toggle('site-enabled');
    expect(api.settings.disabledSites).toEqual(['news.example']);
    await toggle('site-enabled');
    expect(api.settings.disabledSites).toEqual([]);
  });

  it('REQ-F-010: a site that is already switched off is shown as off', async () => {
    const { input } = await render((api) => {
      api.settings = { ...DEFAULT_SETTINGS, disabledSites: ['news.example'] };
    });
    expect(input('site-enabled').checked).toBe(false);
  });

  it('REQ-F-010: the cloud second opinion can be switched on and off', async () => {
    const { api, toggle } = await render();
    await toggle('cloud-enabled');
    expect(api.settings.cloudEnabled).toBe(true);
    await toggle('cloud-enabled');
    expect(api.settings.cloudEnabled).toBe(false);
  });

  it('REQ-F-010: clear cache asks the service worker and reports the count', async () => {
    const { api, el, settle } = await render();
    (el.querySelector('#clear-cache') as HTMLButtonElement).click();
    await settle();
    expect(api.cleared).toBe(1);
    expect(el.querySelector('#cache-message')?.textContent).toContain('Removed 12 saved results.');
  });

  it('REQ-F-010: shows model status: not downloaded, downloading with percent, ready', async () => {
    const { api, el, settle } = await render();
    const status = () => el.querySelector('#model-status')?.textContent ?? '';
    expect(status()).toContain('Not downloaded yet');

    // Status updates arrive live while the popup is open.
    api.emit({ modelStatus: { state: 'downloading', percent: 42 } });
    await settle();
    expect(status()).toContain('42%');
    expect((el.querySelector('progress') as HTMLProgressElement).value).toBe(42);

    api.emit({ modelStatus: { state: 'ready', device: 'webgpu' } });
    await settle();
    expect(status()).toContain('Ready');
    expect(el.querySelector('progress')).toBeNull();
  });

  it('REQ-F-010: settings changed elsewhere are reflected', async () => {
    const { api, input, settle } = await render();
    api.emit({ settings: { ...DEFAULT_SETTINGS, enabled: false } });
    await settle();
    expect(input('enabled').checked).toBe(false);
  });

  it('REQ-F-010: pages that are not web pages have no per-site switch', async () => {
    const { el } = await render((api) => {
      api.hostname = null;
    });
    expect(el.querySelector('#site-enabled')).toBeNull();
    expect(el.textContent).toContain('This page cannot be checked.');
  });

  it('REQ-UI-003: the popup never claims an image is real', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('No mark does not mean an image is real.');
  });
});
