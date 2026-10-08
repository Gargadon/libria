import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { BookStore } from '../store/book.store';
import { AssetService } from './asset.service';
import { LibriaDocument } from '../models/book.models';
import { RecentProjectsService } from './recent-projects.service';
import { environment } from '../../environments/environment';
import { migrateLibriaDocument, validateLibriaDocument } from '../utils/document-validator';

@Injectable({ providedIn: 'root' })
export class FileService {
  readonly store = inject(BookStore);
  readonly assetService = inject(AssetService);
  readonly recentProjects = inject(RecentProjectsService);
  currentPath: string | null = null;
  readonly driveLink = signal<DriveLink | null>(null);
  readonly syncState = signal<'idle' | 'working' | 'saved' | 'pending' | 'conflict'>('idle');
  readonly syncError = signal('');
  readonly autoSync = signal(true);
  private epoch = 0;
  private syncing = false;
  constructor() {
    const interval = setInterval(() => {
      if (this.driveLink() && this.autoSync() && this.syncState() !== 'conflict') void this.syncDrive();
    }, 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(interval));
  }
  private detachDrive() { this.epoch++; this.driveLink.set(null); this.syncState.set('idle'); this.syncError.set(''); }
  documentContent(): string { return JSON.stringify(this.buildDoc(), null, 2); }
  async openDriveDocument(document: DriveDocument): Promise<void> {
    this.validateExternalDocument(document.content);
    const epoch = this.epoch, previous = this.documentContent();
    const path = await window.electronAPI!.driveCacheFile(document, document.content);
    if (epoch !== this.epoch || this.documentContent() !== previous) throw new Error('El documento abierto cambió. Vuelve a abrir el archivo de Drive.');
    this.openExternalDocument(document.content);
    const link = { ...document, baseline: document.baseline || this.documentContent() };
    delete (link as Partial<DriveDocument>).content;
    const openedEpoch = this.epoch;
    await window.electronAPI!.driveCacheFile(link, this.documentContent());
    if (openedEpoch !== this.epoch) return;
    this.currentPath = path;
    this.driveLink.set(link);
    this.recentProjects.add(path, document.name, 'drive');
    this.syncState.set(this.documentContent() === link.baseline ? 'saved' : 'pending');
  }
  async uploadDriveCopy(): Promise<void> {
    if (this.syncing) throw new Error('Espera a que termine la sincronización actual.');
    const epoch = this.epoch, content = this.documentContent();
    const link = await window.electronAPI!.driveCreateFile(this.defaultName(), content);
    const path = await window.electronAPI!.driveCacheFile({ ...link, baseline: content }, content);
    if (epoch !== this.epoch) return;
    this.currentPath = path;
    this.driveLink.set({ ...link, baseline: content });
    this.recentProjects.add(path, link.name, 'drive');
    if (this.documentContent() === content) this.store.markAsSaved();
    this.syncState.set(this.documentContent() === content ? 'saved' : 'pending');
  }
  async syncDrive(): Promise<void> {
    const link = this.driveLink(), api = window.electronAPI;
    if (!link || !api || this.syncing) return;
    this.syncing = true;
    const epoch = this.epoch, content = this.documentContent();
    this.syncState.set('working'); this.syncError.set('');
    try {
      // Local copy is saved before any network request; the link stays outside .libria.
      const path = await api.driveCacheFile(link, content);
      if (epoch !== this.epoch) return;
      this.currentPath = path;
      const status = await api.driveStatus();
      if (!status.connected || status.account?.email !== link.account) throw new Error('Conecta la cuenta de Drive de este documento para sincronizar.');
      const remote = await api.driveFileMetadata(link.id);
      if (epoch !== this.epoch) return;
      const localChanged = content !== link.baseline;
      if (remote.version !== link.version) {
        if (localChanged || this.documentContent() !== content) { this.syncState.set('conflict'); return; }
        const document = await api.driveReadFile(link.id, true);
        if (epoch !== this.epoch) return;
        if (this.documentContent() !== content) { this.syncState.set('conflict'); return; }
        await this.openDriveDocument(document);
      } else if (localChanged) {
        const result = await api.driveWriteFile(link.id, link.version, content, link.account);
        if (epoch !== this.epoch) return;
        if (result.conflict) { this.syncState.set('conflict'); return; }
        const updated = { ...link, version: result.version!, name: result.name || link.name, baseline: content };
        await api.driveCacheFile(updated, this.documentContent());
        if (epoch !== this.epoch) return;
        this.driveLink.set(updated);
        if (this.documentContent() === content) this.store.markAsSaved();
      }
      if (epoch === this.epoch) this.syncState.set(this.documentContent() === this.driveLink()?.baseline ? 'saved' : 'pending');
    } catch (error) {
      if (epoch === this.epoch) { this.syncState.set('pending'); this.syncError.set(error instanceof Error ? error.message : String(error)); }
    } finally { this.syncing = false; }
  }

  private get isElectron(): boolean {
    return !!(window as any).electronAPI;
  }

  get canSilentSave(): boolean {
    if (this.isElectron) return !!this.currentPath;
    return !!(window as any).__libriaFileHandle;
  }

  private buildDoc(): LibriaDocument {
    const { mode: _mode, ...rest } = this.store.tweaks();
    return {
      libriaVersion: environment.version,
      metadata: this.store.book(),
      preferences: { ...rest, mode: undefined as any },
      session: {
        lastActiveChapterId: this.store.activeChapterId()
      },
      chapters: this.store.chapters(),
      notes: this.store.notes(),
      assets: this.assetService.getAll(),
      writingGoals: this.store.writingGoals(),
      characters: this.store.characters(),
      locations: this.store.locations()
    };
  }

  private defaultName(): string {
    return (this.store.book()?.title || 'Mi_Libro').replace(/\s+/g, '_') + '.libria';
  }

  validateExternalDocument(content: string): void {
    validateLibriaDocument(migrateLibriaDocument(JSON.parse(content)));
  }

  openExternalDocument(content: string): void {
    this.validateExternalDocument(content);
    this.store.loadDocument(JSON.parse(content), this.assetService);
    this.detachDrive();
    this.currentPath = null;
    (window as any).__libriaFileHandle = null;
  }

  async saveLibriaFile(saveAs: boolean = false): Promise<boolean> {
    this.store.setIsSaving(true);
    const doc = this.buildDoc();
    const json = JSON.stringify(doc, null, 2);
    const epoch = this.epoch;
    let saved = false;

    try {
      if (this.isElectron) {
        const api = window.electronAPI!;
        let path = this.currentPath;
        if (saveAs || !path) {
          path = await api.saveDialog(this.defaultName());
          if (!path) {
            this.store.setIsSaving(false);
            return false;
          }
        }
        await api.writeFile(path, json);
        if (epoch !== this.epoch) return false;
        this.currentPath = path;
        this.recentProjects.add(path, this.store.book()?.title || this.defaultName(), !saveAs && this.driveLink() ? 'drive' : 'local');
        if (this.documentContent() === json) this.store.markAsSaved();
        if (!saveAs && this.driveLink()) await this.syncDrive();
        if (saveAs) this.detachDrive();
        saved = true;
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
          saved = true;
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = defaultName;
          a.click();
          URL.revokeObjectURL(url);
          this.store.markAsSaved();
          saved = true;
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error(err);
        await this.showError('No se pudo guardar el documento', (err as Error).message);
      }
    } finally {
      // Small delay to make the bar visible even for fast saves
      setTimeout(() => {
        this.store.setIsSaving(false);
      }, 800);
    }
    return saved;
  }

  async openLibriaFileByPath(path: string) {
    if (!this.isElectron) return;
    try {
      const api = window.electronAPI!;
      const text = await api.readFile(path);
      this.store.loadDocument(JSON.parse(text), this.assetService);
      this.detachDrive();
      this.currentPath = path;
      const epoch = this.epoch;
      const link = await api.driveCachedLink(path);
      if (epoch !== this.epoch) return;
      this.driveLink.set(link);
      if (this.driveLink()) this.syncState.set('pending');
      this.recentProjects.add(path, this.store.book()?.title || path.split('/').pop() || path, link ? 'drive' : 'local');
    } catch (err) {
      console.error(err);
      await this.showError('No se pudo abrir el documento', (err as Error).message);
    }
  }

  async openLibriaFile() {
    if (this.isElectron) {
      try {
        const api = window.electronAPI!;
        const path = await api.openDialog();
        if (!path) return;
        await this.openLibriaFileByPath(path);
      } catch (err) {
        console.error(err);
        await this.showError('No se pudo abrir el documento', (err as Error).message);
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
        try {
          const file = e.target.files[0];
          if (!file) return;
          const text = await file.text();
          this.store.loadDocument(JSON.parse(text), this.assetService);
          this.recentProjects.add(file.name, this.store.book()?.title || file.name);
        } catch (err) {
          console.error(err);
          await this.showError('No se pudo abrir el documento', (err as Error).message);
        }
      };
      input.click();
    }
  }

  newProject() {
    this.detachDrive();
    this.currentPath = null;
    (window as any).__libriaFileHandle = null;
    this.store.createNewProject();
  }

  closeProject() {
    this.detachDrive();
    this.currentPath = null;
    (window as any).__libriaFileHandle = null;
    this.store.closeDocument(this.assetService);
  }

  private async showError(title: string, detail: string): Promise<void> {
    const api = (window as any).electronAPI;
    if (api?.showError) {
      await api.showError(title, detail || 'Ocurrió un error inesperado.');
    }
  }
}
