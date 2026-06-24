import { Injectable } from '@angular/core';
import { BookTheme } from '../models/book.models';

const STORAGE_KEY = 'libria-custom-themes';
const THEME_FILE_VERSION = '1';

@Injectable({ providedIn: 'root' })
export class CustomThemesService {

  load(): BookTheme[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as BookTheme[];
    } catch {}
    return [];
  }

  private persist(themes: BookTheme[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(themes));
    } catch {}
  }

  save(theme: BookTheme): BookTheme[] {
    const themes = this.load();
    const idx = themes.findIndex(t => t.id === theme.id);
    if (idx >= 0) {
      themes[idx] = theme;
    } else {
      themes.push(theme);
    }
    this.persist(themes);
    return themes;
  }

  delete(id: string): BookTheme[] {
    const themes = this.load().filter(t => t.id !== id);
    this.persist(themes);
    return themes;
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  async exportTheme(theme: BookTheme): Promise<void> {
    const payload = JSON.stringify({
      libriaThemeVersion: THEME_FILE_VERSION,
      id: theme.id,
      name: theme.name,
      tweaks: theme.tweaks
    }, null, 2);

    const safeName = theme.name.replace(/[^a-zA-Z0-9_\-\u00C0-\u024F ]/g, '').trim() || 'tema';
    const fileName = `${safeName}.libria-theme`;

    const api = (window as any).electronAPI;
    if (api) {
      const path = await api.saveDialog(fileName);
      if (!path) return;
      await api.writeFile(path, payload);
    } else {
      // Web / fallback
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // ─── Import ──────────────────────────────────────────────────────────────────

  async importTheme(): Promise<BookTheme | null> {
    const api = (window as any).electronAPI;

    let text: string | null = null;

    if (api) {
      const path = await api.openDialog();
      if (!path) return null;
      text = await api.readFile(path);
    } else {
      text = await this._webFilePicker();
    }

    if (!text) return null;

    try {
      const parsed = JSON.parse(text);
      if (!parsed.tweaks || !parsed.name) {
        console.warn('[CustomThemesService] Invalid .libria-theme file');
        return null;
      }
      // Always assign a fresh id on import to avoid collisions
      return {
        id: crypto.randomUUID(),
        name: String(parsed.name),
        tweaks: parsed.tweaks,
        isCustom: true
      } satisfies BookTheme;
    } catch (err) {
      console.error('[CustomThemesService] Failed to parse theme file', err);
      return null;
    }
  }

  private _webFilePicker(): Promise<string | null> {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.libria-theme,.json';
      input.onchange = async (e: any) => {
        const file: File | undefined = e.target.files?.[0];
        if (!file) { resolve(null); return; }
        resolve(await file.text());
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
}
