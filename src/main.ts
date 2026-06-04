import { Buffer } from 'buffer';

// Ensure Buffer is available globally
(window as any).Buffer = Buffer;
(globalThis as any).Buffer = Buffer;

import { initTauriBridge } from './tauri-bridge';
initTauriBridge();

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
