import type { ApplicationConfig } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { EXTENSION_API, chromeExtensionApi } from './extension-api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: EXTENSION_API, useValue: chromeExtensionApi },
  ],
};
