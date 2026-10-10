import { Injectable, inject, signal } from '@angular/core';
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
  readonly cursor = signal<string | null>(null);
  readonly listed = signal(false);
  readonly operation = signal('drive.working');
  readonly pending = signal<DriveDocument | null>(null);
  readonly fileService = inject(FileService);

  async show() {
    this.visible.set(true);
    if (!this.available) return;
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
      this.listed.set(false);
      if (!result.revoked) this.message.set('drive.revokeFailed');
    });
  }
  async list(more = false) {
    await this.run(() => this.fetchFiles(more), 'drive.loadingDocuments');
  }
  private async fetchFiles(more = false) {
    const page = await window.desktopAPI!.driveListFiles(more ? this.cursor() || undefined : undefined);
    this.files.set(more ? [...this.files(), ...page.files] : page.files);
    this.cursor.set(page.nextPageToken);
    this.listed.set(true);
  }
  async download(file: DriveFile) {
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
      if (pending && await this.fileService.saveLibriaFile() && !this.fileService.store.isDirty()) await this.open(pending);
    });
  }
  async discardAndOpen() {
    await this.run(async () => { const pending = this.pending(); if (pending) await this.open(pending); });
  }
  async upload() { await this.run(async () => { await this.fileService.uploadDriveCopy(); }, 'drive.savingDocument'); }
  async sync() { await this.run(async () => { await this.fileService.syncDrive(); }, 'drive.state.working'); }
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
