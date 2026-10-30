import { Buffer } from 'buffer';

// Ensure Buffer is available globally
(window as any).Buffer = Buffer;
(globalThis as any).Buffer = Buffer;

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeDesktop } from './desktop';
import { preventBrowserShortcut } from './app/utils/browser-shortcuts';

window.addEventListener('keydown', preventBrowserShortcut);

initializeDesktop().then(() => bootstrapApplication(App, appConfig))
  .catch((err) => console.error(err));
