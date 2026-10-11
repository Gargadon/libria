import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { FileService } from './file.service';

@Injectable({ providedIn: 'root' })
export class GoogleDriveService {
  readonly available = !!window.desktopAPI?.driveStatus;
  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly connecting = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly status = signal<DriveStatus | null>(null);
  readonly files = signal<DriveFile[]>([]);
  readonly offlineFiles = signal<DriveCachedFile[]>([]);
  readonly offlineError = signal('');
  private offlineGeneration = 0;
  constructor() {
    const refresh = () => { void this.refreshOffline(); if (this.visible() && !this.busy() && this.status()?.connected) void this.list(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    });
  }
  async refreshOffline() {
    if (!window.desktopAPI?.driveCachedFiles) return;
    const generation = ++this.offlineGeneration;
    try {
      const copies = await window.desktopAPI.driveCachedFiles();
      if (generation !== this.offlineGeneration) return;
      this.offlineFiles.set(copies.filter(file => !file.unavailable));
      if (window.desktopAPI.driveFileMetadata && window.desktopAPI.driveStatus) {
        const status = await window.desktopAPI.driveStatus().catch(() => null);
        for (const file of copies) {
          if (!status?.connected || status.account?.email !== file.account) continue;
          try {
            const remote = await window.desktopAPI.driveFileMetadata(file.id);
            file.unavailable = !!(remote.trashed || remote.unavailable);
          } catch { /* Network errors never imply deletion. Keep the last known state. */ }
        }
      }
      if (generation !== this.offlineGeneration) return;
      this.offlineFiles.set(copies.filter(file => !file.unavailable));
      this.offlineError.set('');
    } catch (error) { this.offlineError.set(String(error)); }
  }
  async openOffline(file: DriveCachedFile) {
    this.visible.set(true);
    await this.run(async () => {
      const api = window.desktopAPI!;
      const content = await api.readFile(file.path);
      const link = await api.driveCachedLink(file.path);
      if (!link) throw new Error('No se encontró el vínculo de esta copia local de Drive.');
      this.fileService.validateExternalDocument(content);
      const document = { ...link, content };
      if (this.fileService.store.isDirty()) this.pending.set(document);
      else await this.open(document);
    }, 'drive.openingDocument');
  }
  readonly cursor = signal<string | null>(null);
  readonly listed = signal(false);
  readonly operation = signal('drive.working');
  readonly mode = signal<'browse' | 'save'>('browse');
  readonly currentRequested = signal(false);
  readonly folders = signal<DriveFile[]>([{ id: 'root', name: 'drive.myDrive' }]);
  readonly filename = signal('');
  isFolder(file: DriveFile): boolean { return file.mimeType === 'application/vnd.google-apps.folder'; }
  get folder(): DriveFile { return this.folders().at(-1)!; }
  readonly pending = signal<DriveDocument | null>(null);
  readonly trashPending = signal<{ file: DriveFile; account: string } | null>(null);
  isCurrentDocument(file: DriveFile): boolean {
    const link = this.fileService.driveLink();
    return !!link && link.id === file.id && link.account === this.status()?.account?.email;
  }
  canTrash(file: DriveFile): boolean {
    return this.mode() === 'browse' && !!this.status()?.connected && !!this.status()?.writable
      && !!this.status()?.account?.email && !this.isFolder(file)
      && file.name.toLowerCase().endsWith('.libria') && file.capabilities?.canTrash === true
      && !this.isCurrentDocument(file);
  }
  requestTrash(file: DriveFile) {
    if (this.busy() || !this.canTrash(file)) return;
    this.trashPending.set({ file, account: this.status()!.account!.email });
  }
  async confirmTrash() {
    const pending = this.trashPending();
    if (!pending || !this.canTrash(pending.file) || pending.account !== this.status()?.account?.email) return;
    await this.run(async () => {
      const result = await window.desktopAPI!.driveTrashFile(pending.file.id, pending.account);
      if (result.id !== pending.file.id || !result.trashed) throw new Error('No se pudo confirmar el traslado a la papelera.');
      ++this.offlineGeneration;
      this.files.update(files => files.filter(file => file.id !== pending.file.id));
      this.offlineFiles.update(files => files.filter(file => file.id !== pending.file.id || file.account !== pending.account));
      this.trashPending.set(null);
      this.message.set('drive.trashSuccess');
    }, 'drive.trashing');
  }
  readonly fileService = inject(FileService);

  async show(mode: 'browse' | 'save' = 'browse') {
    if (this.busy()) return;
    this.trashPending.set(null);
    this.mode.set(mode);
    this.currentRequested.set(mode === 'browse' && !!this.fileService.driveLink());
    this.folders.set([{ id: 'root', name: 'drive.myDrive' }]);
    this.files.set([]);
    this.cursor.set(null);
    this.listed.set(false);
    if (mode === 'save') this.filename.set((this.fileService.store.book()?.title || 'Mi_Libro').replace(/\s+/g, '_') + '.libria');
    this.visible.set(true);
    if (!this.available) return;
    await this.refreshOffline();
    await this.run(async () => {
      this.status.set(await window.desktopAPI!.driveStatus());
      if (this.status()?.connected) await this.fetchFiles();
    }, 'drive.loadingDocuments');
  }
  async connect() {
    if (this.busy()) return;
    this.connecting.set(true);
    try {
      await this.run(async () => {
        this.status.set(await window.desktopAPI!.driveConnect());
        this.files.set([]);
        this.folders.set([{ id: 'root', name: 'drive.myDrive' }]);
        this.cursor.set(null);
        this.listed.set(false);
        this.operation.set('drive.loadingDocuments');
        await this.fetchFiles();
      }, 'drive.waitingGoogle');
    } finally { this.connecting.set(false); }
  }
  async cancel() { await window.desktopAPI?.driveCancel(); }
  async disconnect() {
    await this.run(async () => {
      const result = await window.desktopAPI!.driveDisconnect();
      this.status.set(await window.desktopAPI!.driveStatus());
      this.files.set([]);
      this.cursor.set(null);
      this.pending.set(null);
      this.folders.set([{ id: 'root', name: 'drive.myDrive' }]);
      this.listed.set(false);
      if (!result.revoked) this.message.set('drive.revokeFailed');
    });
  }
  async list(more = false) {
    await this.run(() => this.fetchFiles(more), 'drive.loadingDocuments');
    await this.refreshOffline();
  }
  private async fetchFiles(more = false) {
    const page = await window.desktopAPI!.driveListFiles(more ? this.cursor() || undefined : undefined, undefined, true);
    this.files.set(more ? [...this.files(), ...page.files] : page.files);
    this.cursor.set(page.nextPageToken);
    this.listed.set(true);
  }
  async download(file: DriveFile) {
    if (this.isFolder(file)) return;
    if (this.mode() === 'save') return;
    await this.run(async () => {
      const result = await window.desktopAPI!.driveReadFile(file.id);
      this.fileService.validateExternalDocument(result.content);
      if (this.fileService.store.isDirty()) this.pending.set(result);
      else await this.open(result);
    }, 'drive.openingDocument');
  }
  async open(result: DriveDocument) {
    await this.fileService.openDriveDocument(result);
    this.pending.set(null);
    this.visible.set(false);
  }
  async saveAndOpen() {
    await this.run(async () => {
      const pending = this.pending();
      if (pending && await this.fileService.saveLibriaFile(false, false) && !this.fileService.store.isDirty()) await this.open(pending);
    });
  }
  async discardAndOpen() {
    await this.run(async () => { const pending = this.pending(); if (pending) await this.open(pending); });
  }
  async beginUpload() { await this.show('save'); }
  async saveToDrive() {
    if (!this.fileService.driveLink()) { await this.beginUpload(); return; }
    await this.show();
    await this.sync();
  }
  async pickDocument() {
    if (this.busy()) return;
    this.connecting.set(true);
    try {
      await this.run(async () => {
        const file = await window.desktopAPI!.drivePickFile('document');
        this.status.set(await window.desktopAPI!.driveStatus());
        const result = await window.desktopAPI!.driveReadFile(file.id);
        this.fileService.validateExternalDocument(result.content);
        if (this.fileService.store.isDirty()) this.pending.set(result);
        else await this.open(result);
      }, 'drive.waitingPicker');
    } finally { this.connecting.set(false); }
  }
  async pickFolder() {
    if (this.busy()) return;
    this.connecting.set(true);
    try {
      await this.run(async () => {
        const folder = await window.desktopAPI!.drivePickFile('folder');
        this.status.set(await window.desktopAPI!.driveStatus());
        this.folders.set([folder]);
      }, 'drive.waitingPicker');
    } finally { this.connecting.set(false); }
  }
  async upload() {
    if (!this.filename().trim() || !this.status()?.writable || this.folder.capabilities?.canAddChildren === false) return;
    await this.run(async () => {
      let name = this.filename().trim();
      if (!name.toLowerCase().endsWith('.libria')) name += '.libria';
      await this.fileService.uploadDriveCopy(this.folder.id, name);
      this.mode.set('browse');
      this.currentRequested.set(true);
      this.message.set('drive.savedSuccessfully');
      await this.fetchFiles();
    }, 'drive.savingDocument');
  }
  async sync() { await this.run(async () => { await this.fileService.syncDrive(); }, 'drive.state.working'); }
  async replaceRemote() { await this.run(() => this.fileService.replaceDriveVersion(), 'drive.state.working'); }
  async useRemote() {
    await this.run(async () => {
      const link = this.fileService.driveLink();
      if (!link) return;
      // Keep an independent native local backup before replacing the working copy.
      if (!await this.fileService.saveLibriaFile(true)) return;
      await this.open(await window.desktopAPI!.driveReadFile(link.id, true));
    });
  }
  private async run(action: () => Promise<void>, operation = 'drive.working') {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    this.operation.set(operation);
    try { await action(); }
    catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
    finally { this.busy.set(false); }
  }
}
