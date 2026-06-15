import { Injectable, inject } from '@angular/core';
import { BookStore } from '../store/book.store';
import { AssetService } from './asset.service';
import { LibriaDocument, RecentProject } from '../models/book.models';
import { RecentProjectsService } from './recent-projects.service';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class FileService {
  readonly store = inject(BookStore);
  readonly assetService = inject(AssetService);
  readonly recentProjects = inject(RecentProjectsService);
  currentPath: string | null = null;

  private get isElectron(): boolean {
    return !!(window as any).electronAPI;
  }

  get canSilentSave(): boolean {
    if (this.isElectron) return !!this.currentPath;
    return !!(window as any).__libriaFileHandle;
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
      assets: this.assetService.getAll(),
      writingGoals: this.store.writingGoals()
    };
  }

  private defaultName(): string {
    return (this.store.book()?.title || 'Mi_Libro').replace(/\s+/g, '_') + '.libria';
  }

  async saveLibriaFile(saveAs: boolean = false) {
    this.store.setIsSaving(true);
    const doc = this.buildDoc();
    const json = JSON.stringify(doc, null, 2);

    try {
      if (this.isElectron) {
        const api = window.electronAPI!;
        let path = this.currentPath;
        if (saveAs || !path) {
          path = await api.saveDialog(this.defaultName());
          if (!path) {
            this.store.setIsSaving(false);
            return;
          }
        }
        await api.writeFile(path, json);
        this.currentPath = path;
        this.recentProjects.add(path, this.store.book()?.title || this.defaultName());
        this.store.markAsSaved();
      } else {
        const blob = new Blob([json], { type: 'application/json' });
        const defaultName = this.defaultName();

        if ('showSaveFilePicker' in window) {
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
    } catch (err) {
      if ((err as Error).name !== 'AbortError') console.error(err);
    } finally {
      // Small delay to make the bar visible even for fast saves
      setTimeout(() => {
        this.store.setIsSaving(false);
      }, 800);
    }
  }

  async openLibriaFileByPath(path: string) {
    if (!this.isElectron) return;
    try {
      const api = window.electronAPI!;
      const text = await api.readFile(path);
      this.store.loadDocument(JSON.parse(text), this.assetService);
      this.currentPath = path;
      this.recentProjects.add(path, this.store.book()?.title || path.split('/').pop() || path);
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
        this.store.loadDocument(JSON.parse(text), this.assetService);
        this.currentPath = path;
        this.recentProjects.add(path, this.store.book()?.title || path.split('/').pop() || path);
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
        this.store.loadDocument(JSON.parse(text), this.assetService);
        (window as any).__libriaFileHandle = handle;
        if (handle.name) {
          this.recentProjects.add(handle.name, this.store.book()?.title || handle.name);
        }
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
        this.store.loadDocument(JSON.parse(text), this.assetService);
        this.recentProjects.add(file.name, this.store.book()?.title || file.name);
      };
      input.click();
    }
  }

  newProject() {
    this.currentPath = null;
    (window as any).__libriaFileHandle = null;
    this.store.createNewProject();
  }

  closeProject() {
    this.currentPath = null;
    (window as any).__libriaFileHandle = null;
    this.store.closeDocument(this.assetService);
  }
}
