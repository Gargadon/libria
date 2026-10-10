import { isTauri, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import { arch, platform } from '@tauri-apps/plugin-os';

/** Install before Angular creates any services. Browser builds keep their web fallbacks. */
export async function initializeDesktop(): Promise<void> {
  if (!isTauri()) return;
  const menuListeners = new Set<(action: string) => void>();
  const closeListeners = new Set<() => void>();
  const fileListeners = new Set<(path: string) => void>();
  let earlyFile: string | null = null;
  const updateListeners = new Set<(update: { version: string; url?: string }) => void>();
  const updateResultListeners = new Set<(result: string) => void>();
  const desktopWindow = getCurrentWindow();
  let closing = false;
  const drive = <T>(method: string, args: unknown[] = []) => invoke<T>('drive', { method, args });
  const api: DesktopAPI = {
    driveStatus: () => drive('status'),
    driveConnect: () => drive('connect'),
    driveDisconnect: () => drive('disconnect'),
    driveListFiles: (cursor) => drive('listFiles', [cursor ?? null]),
    driveReadFile: (id, forceRemote) => drive('readFile', [id, !!forceRemote]),
    driveFileMetadata: (id) => drive('fileMetadata', [id]),
    driveWriteFile: (id, version, content, account) => drive('writeFile', [id, version, content, account]),
    driveCreateFile: (name, content) => drive('createFile', [name, content]),
    driveCacheFile: (link, content) => drive('cacheFile', [link, content]),
    driveCachedLink: (path) => drive('cachedLink', [path]),
    driveCancel: () => drive('cancel'),
    saveDialog: (defaultName, kind = 'document') => invoke('save_dialog', { defaultName, kind }),
    openDialog: (kind = 'document') => invoke('open_dialog', { kind }),
    writeFile: (filePath, content) => invoke('write_file', { filePath, content }),
    readFile: (filePath) => invoke('read_file', { filePath }),
    getFontsCss: () => invoke('fonts_css'),
    getSystemFonts: () => invoke('system_fonts'),
    getFontVariants: (family) => invoke('font_variants', { family }),
    showError: async (title, content) => { await message(content, { title, kind: 'error' }); },
    printFromHTML: async (html, options) => new Uint8Array(await invoke<number[]>('print_html', { html, options })),
    saveExport: async (filename, bytes) => invoke('save_export', { filename, bytes: Array.from(bytes) }),
    onMenuAction: (callback) => { menuListeners.add(callback); },
    onCloseRequested: (callback) => { closeListeners.add(callback); },
    confirmClose: () => {
      closing = true;
      void desktopWindow.close().catch((error) => { closing = false; console.error(error); });
    },
    onFileOpen: (callback) => { fileListeners.add(callback); },
    getPendingPath: async () => {
      const pending = await invoke<string | null>('pending_path');
      const path = earlyFile ?? pending;
      earlyFile = null;
      return path;
    },
    onUpdateAvailable: (callback) => { updateListeners.add(callback); },
    onUpdateCheckResult: (callback) => { updateResultListeners.add(callback); },
    setLanguage: (lang) => { document.documentElement.lang = lang; },
    platform: ({ windows: 'win32', macos: 'darwin' } as Record<string, string>)[platform()] ?? platform(),
    arch: arch() === 'x86_64' ? 'x64' : arch() === 'aarch64' ? 'arm64' : arch(),
    useIntegratedMenu: true,
    // Native underlines and suggestions are provided by the platform WebView.
    setSpellCheckerLanguage: async (lang) => { document.documentElement.lang = lang; },
    getCustomDictionary: () => invoke('dictionary', { action: 'list', word: null }),
    addWordToDictionary: (word) => invoke('dictionary', { action: 'add', word }),
    removeWordFromDictionary: (word) => invoke('dictionary', { action: 'remove', word }),
    checkForUpdates: () => {
      void invoke<{ version: string; url: string } | null>('check_updates').then((update) => {
        if (update) updateListeners.forEach(callback => callback(update));
        else updateResultListeners.forEach(callback => callback('uptodate'));
      }).catch(() => updateResultListeners.forEach(callback => callback('error')));
    },
    openExternal: openUrl,
  };
  await desktopWindow.onCloseRequested((event) => {
    if (closing) return;
    event.preventDefault();
    closeListeners.forEach(callback => callback());
  });
  await listen<string>('file:open', ({ payload }) => {
    if (!fileListeners.size) earlyFile = payload;
    else fileListeners.forEach(callback => callback(payload));
  });
  window.desktopAPI = api;

  // The integrated menu shares the same action dispatch as the previous native menu.
  document.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.defaultPrevented) return;
    const key = event.key.toLowerCase();
    const action = key === 's' ? (event.shiftKey ? 'saveAs' : 'save')
      : !event.shiftKey ? ({ n: 'new', o: 'open', w: 'close', f: 'search', z: 'undo', y: 'redo' } as Record<string, string>)[key]
      : key === 'z' ? 'redo' : undefined;
    if (key === 'q' && !event.shiftKey) {
      event.preventDefault();
      closeListeners.forEach(callback => callback());
    } else if (action) {
      event.preventDefault();
      menuListeners.forEach(callback => callback(action));
    }
  });
  new MutationObserver(() => { void desktopWindow.setTitle(document.title); })
    .observe(document.querySelector('title')!, { childList: true });
}
