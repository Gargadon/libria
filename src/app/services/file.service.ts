import { Injectable, inject } from '@angular/core';
import { BookStore } from '../store/book.store';
import { LibriaDocument } from '../models/book.models';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FileService {
  readonly store = inject(BookStore);
  currentPath: string | null = null;

  private get isElectron(): boolean {
    return !!(window as any).electronAPI;
  }

  private buildDoc(): LibriaDocument {
    return {
      libriaVersion: environment.version,
      metadata: this.store.book(),
      preferences: this.store.tweaks(),
      session: {
        lastActiveChapterId: this.store.activeChapterId()
      },
      chapters: this.store.chapters(),
      notes: this.store.notes(),
      assets: this.store.assets()
    };
  }

  private defaultName(): string {
    return (this.store.book()?.title || 'Mi_Libro').replace(/\s+/g, '_') + '.libria';
  }

  async saveLibriaFile(saveAs: boolean = false) {
    const doc = this.buildDoc();
    const json = JSON.stringify(doc, null, 2);

    if (this.isElectron) {
      try {
        const api = window.electronAPI!;
        let path = this.currentPath;
        if (saveAs || !path) {
          path = await api.saveDialog(this.defaultName());
          if (!path) return;
        }
        await api.writeFile(path, json);
        this.currentPath = path;
        this.store.markAsSaved();
      } catch (err) {
        console.error(err);
      }
      return;
    }

    const blob = new Blob([json], { type: 'application/json' });
    const defaultName = this.defaultName();

    if ('showSaveFilePicker' in window) {
      try {
        let handle = (window as any).__libriaFileHandle;
        if (saveAs || !handle) {
          handle = await (window as any).showSaveFilePicker({
            suggestedName: defaultName,
            types: [{
              description: 'Documento Libria',
              accept: { 'application/json': ['.libria'] }
            }]
          });
        }
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        (window as any).__libriaFileHandle = handle;
        this.store.markAsSaved();
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error(err);
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(url);
      this.store.markAsSaved();
    }
  }

  async openLibriaFileByPath(path: string) {
    if (!this.isElectron) return;
    try {
      const api = window.electronAPI!;
      const text = await api.readFile(path);
      this.store.loadDocument(JSON.parse(text));
      this.currentPath = path;
    } catch (err) {
      console.error(err);
    }
  }

  async openLibriaFile() {
    if (this.isElectron) {
      try {
        const api = window.electronAPI!;
        const path = await api.openDialog();
        if (!path) return;
        const text = await api.readFile(path);
        this.store.loadDocument(JSON.parse(text));
        this.currentPath = path;
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{
            description: 'Documento Libria',
            accept: { 'application/json': ['.libria'] }
          }]
        });
        const file = await handle.getFile();
        const text = await file.text();
        this.store.loadDocument(JSON.parse(text));
        (window as any).__libriaFileHandle = handle;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') console.error(err);
      }
    } else {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.libria,.json';
      input.onchange = async (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        this.store.loadDocument(JSON.parse(text));
      };
      input.click();
    }
  }

  newProject() {
    this.currentPath = null;
    (window as any).__libriaFileHandle = null;
    this.store.createNewProject();
  }
}
