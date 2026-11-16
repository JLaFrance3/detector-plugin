import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isActiveOn, withSiteDisabled } from '../../../../src/shared/settings';
import type { ModelStatus, Settings } from '../../../../src/shared/types';
import { DEFAULT_SETTINGS } from '../../../../src/shared/types';
import { EXTENSION_API } from './extension-api';

/** Toolbar popup: settings and status (REQ-F-010). */
@Component({
  selector: 'aid-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(EXTENSION_API);

  protected readonly loaded = signal(false);
  protected readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  protected readonly hostname = signal<string | null>(null);
  protected readonly modelStatus = signal<ModelStatus>({ state: 'not-downloaded' });
  /** Result of the last "Clear cache" click, shown next to the button. */
  protected readonly cacheMessage = signal('');

  protected readonly siteEnabled = computed(() => {
    const host = this.hostname();
    return host !== null && !this.settings().disabledSites.includes(host);
  });
  protected readonly activeHere = computed(() => isActiveOn(this.settings(), this.hostname()));

  protected readonly modelText = computed(() => {
    const status = this.modelStatus();
    switch (status.state) {
      case 'not-downloaded':
        return 'Not downloaded yet. It downloads once, the first time an image is checked.';
      case 'downloading':
        return `Downloading… ${status.percent}%`;
      case 'ready':
        return `Ready (${status.device === 'webgpu' ? 'GPU' : 'CPU'})`;
      case 'error':
        return 'Could not load. Detection by model is paused; provenance checks still work.';
    }
  });
  protected readonly downloadPercent = computed(() => {
    const status = this.modelStatus();
    return status.state === 'downloading' ? status.percent : null;
  });

  constructor() {
    void this.load();
    // REQ-F-010: model status updates live while the popup is open.
    const unsubscribe = this.api.onChange((change) => {
      if (change.settings) this.settings.set(change.settings);
      if (change.modelStatus) this.modelStatus.set(change.modelStatus);
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  private async load(): Promise<void> {
    const [settings, hostname, modelStatus] = await Promise.all([
      this.api.loadSettings(),
      this.api.activeHostname().catch(() => null),
      this.api.loadModelStatus(),
    ]);
    this.settings.set(settings);
    this.hostname.set(hostname);
    this.modelStatus.set(modelStatus);
    this.loaded.set(true);
  }

  private async save(settings: Settings): Promise<void> {
    this.settings.set(settings);
    await this.api.saveSettings(settings);
  }

  protected setEnabled(event: Event): void {
    void this.save({ ...this.settings(), enabled: (event.target as HTMLInputElement).checked });
  }

  protected setSiteEnabled(event: Event): void {
    const host = this.hostname();
    if (host === null) return;
    const enabled = (event.target as HTMLInputElement).checked;
    void this.save(withSiteDisabled(this.settings(), host, !enabled));
  }

  protected setCloudEnabled(event: Event): void {
    void this.save({
      ...this.settings(),
      cloudEnabled: (event.target as HTMLInputElement).checked,
    });
  }

  protected async clearCache(): Promise<void> {
    this.cacheMessage.set('Clearing…');
    try {
      const removed = await this.api.clearCache();
      this.cacheMessage.set(
        removed === 1 ? 'Removed 1 saved result.' : `Removed ${removed} saved results.`,
      );
    } catch {
      this.cacheMessage.set('Could not clear the saved results.');
    }
  }
}
