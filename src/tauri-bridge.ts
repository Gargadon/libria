import { save, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const initTauriBridge = () => {
  if (window.electronAPI) return; 

  if (!(window as any).__TAURI_INTERNALS__) return;

  const tauriAPI: any = {
    saveDialog: async (defaultName: string) => {
      const result = await save({
        defaultPath: defaultName,
        filters: [{ name: 'Documento Libria', extensions: ['libria'] }]
      });
      return result;
    },
    
    openDialog: async () => {
      const result = await open({
        multiple: false,
        filters: [{ name: 'Documento Libria', extensions: ['libria', 'json'] }]
      });
      return result ? (Array.isArray(result) ? result[0] : result) : null;
    },
    
    writeFile: async (filePath: string, content: string) => {
      return await invoke('write_file', { path: filePath, content });
    },
    
    readFile: async (filePath: string) => {
      return await invoke('read_file', { path: filePath });
    },
    
    printToPDF: async (options: any) => {
      console.warn("Tauri printToPDF not implemented yet");
      return new Uint8Array();
    },
    
    printFromHTML: async (html: string, options: any) => {
       console.warn("Tauri printFromHTML not implemented yet");
       return new Uint8Array();
    },

    onMenuAction: async (callback: (action: string) => void) => {
      listen<string>('menu:action', (event) => {
        callback(event.payload);
      });
    },

    onCloseRequested: async (callback: () => void) => {
      listen('tauri://close-requested', () => {
        callback();
      });
    },

    confirmClose: () => {
       invoke('exit_app');
    },

    onFileOpen: async (callback: (filePath: string) => void) => {
      // Deep linking open event
    },

    // Important: Tauri/System WebViews often have different default scaling.
    // Electron (Chromium) usually defaults to 96dpi for 'pt' to 'px' conversion.
    // Some Linux/Windows systems might report different DPIs to Tauri.
    platform: 'tauri',
    arch: 'unknown',

    // Spell checker (Stubbed)
    setSpellCheckerLanguage: async (lang: string) => {},
    getCustomDictionary: async () => [],
    addWordToDictionary: async (word: string) => true,
    removeWordFromDictionary: async (word: string) => true,
  };

  (window as any).electronAPI = tauriAPI;
  
  // FIX: Inject a CSS variable or class to handle potential DPI/Scaling issues in Tauri
  // Some WebViews scale 'pt' units differently. We force a standard zoom if needed.
  const style = document.createElement('style');
  style.textContent = `
    .print-generator, .print__page {
      -webkit-print-color-adjust: exact;
    }
  `;
  document.head.appendChild(style);

  console.log('Tauri bridge initialized');
};
