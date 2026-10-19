import { describe, it, expect } from 'vitest';
import { preventBrowserShortcut } from './browser-shortcuts';

describe('browser shortcuts', () => {
  it('blocks reload, inspector, browser UI, navigation, print, and zoom', () => {
    for (const init of [
      { key: 'F5' }, { key: 'F12' }, { key: 'F3' }, { key: 'F6' },
      { key: 'F4' }, { key: 'F4', ctrlKey: true },
      { key: 'r', ctrlKey: true }, { key: 'R', ctrlKey: true, shiftKey: true },
      { key: 'I', ctrlKey: true, shiftKey: true }, { key: 'i', metaKey: true, altKey: true },
      { key: 'l', ctrlKey: true }, { key: 'p', ctrlKey: true },
      { key: 't', ctrlKey: true }, { key: 'Tab', ctrlKey: true },
      { key: 'ArrowLeft', altKey: true }, { key: '+', ctrlKey: true },
      { key: 'BrowserBack' },
      { key: 'u', ctrlKey: true }, { key: 'B', ctrlKey: true, shiftKey: true },
      { key: 'a', ctrlKey: true, shiftKey: true },
    ]) {
      const event = new KeyboardEvent('keydown', { ...init, cancelable: true });
      preventBrowserShortcut(event);
      expect(event.defaultPrevented, JSON.stringify(init)).toBe(true);
    }
  });

  it('preserves typing, editing, native Alt+F4 close, F7, and F11', () => {
    for (const init of [
      { key: 'F7' }, { key: 'F11' }, { key: 'Tab' }, { key: 'Escape' },
      { key: 'F4', altKey: true },
      ...['a', 'c', 'x', 'v', 'z', 'y', 'ArrowLeft', 'Backspace'].map(key => ({ key, ctrlKey: true })),
      { key: '@', ctrlKey: true, altKey: true },
      { key: 'a' }, { key: 'Delete' },
    ]) {
      const event = new KeyboardEvent('keydown', { ...init, cancelable: true });
      preventBrowserShortcut(event);
      expect(event.defaultPrevented, JSON.stringify(init)).toBe(false);
    }
  });

  it('lets document shortcuts run before preventing browser defaults', () => {
    let handled = false;
    const app = (event: KeyboardEvent) => { if (event.key === 's') handled = !event.defaultPrevented; };
    document.addEventListener('keydown', app);
    window.addEventListener('keydown', preventBrowserShortcut);
    try {
      const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(event);
      expect(handled).toBe(true);
      expect(event.defaultPrevented).toBe(true);
    } finally {
      document.removeEventListener('keydown', app);
      window.removeEventListener('keydown', preventBrowserShortcut);
    }
  });
});
