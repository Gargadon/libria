import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GoogleDriveService } from './google-drive.service';
import { FileService } from './file.service';
import { AssetService } from './asset.service';
import { BookStore } from '../store/book.store';
import { RecentProjectsService } from './recent-projects.service';

describe('opening Drive documents safely', () => {
  afterEach(() => { delete window.desktopAPI; TestBed.resetTestingModule(); });
  const file = { id: 'remote', name: 'Book.libria' };
  it('checks cached documents remotely, keeps offline copies on network errors, and detects restoration', async () => {
    const { drive } = service(false);
    const cached = { ...file, account: 'writer@example.test', path: 'local.libria', pending: true, modifiedAt: 1 };
    window.desktopAPI!.driveCachedFiles = vi.fn().mockResolvedValue([cached]);
    window.desktopAPI!.driveStatus = vi.fn().mockResolvedValue({ connected: true, account: { email: cached.account } });
    const metadata = vi.fn().mockResolvedValue({ trashed: true });
    window.desktopAPI!.driveFileMetadata = metadata;
    await drive.refreshOffline();
    expect(drive.offlineFiles()).toEqual([]);
    metadata.mockRejectedValueOnce(new Error('Offline'));
    await drive.refreshOffline();
    expect(drive.offlineFiles()).toEqual([]);
    metadata.mockResolvedValue({ trashed: false });
    await drive.refreshOffline();
    expect(drive.offlineFiles()).toEqual([cached]);
    metadata.mockRejectedValueOnce(new Error('Offline'));
    await drive.refreshOffline();
    expect(drive.offlineFiles()).toEqual([cached]);
    metadata.mockResolvedValue({ unavailable: true });
    await drive.refreshOffline();
    expect(drive.offlineFiles()).toEqual([]);
  });
  function service(dirty: boolean) {
    const fileService = { store: { isDirty: () => dirty }, driveLink: () => null as DriveLink | null, validateExternalDocument: vi.fn(),
      openExternalDocument: vi.fn(), openDriveDocument: vi.fn(), saveLibriaFile: vi.fn().mockResolvedValue(false) };
    window.desktopAPI = { driveStatus: vi.fn(), driveReadFile: vi.fn().mockResolvedValue({ name: file.name, content: '{}' }) } as unknown as DesktopAPI;
    TestBed.configureTestingModule({ providers: [{ provide: FileService, useValue: fileService }] });
    return { drive: TestBed.inject(GoogleDriveService), fileService };
  }
  it('waits for a decision when there are unsaved changes', async () => {
    const { drive, fileService } = service(true);
    await drive.download(file);
    expect(fileService.openExternalDocument).not.toHaveBeenCalled();
    expect(drive.pending()?.name).toBe(file.name);
    await drive.saveAndOpen();
    expect(fileService.openExternalDocument).not.toHaveBeenCalled();
    expect(drive.pending()).not.toBeNull();
    fileService.saveLibriaFile.mockResolvedValue(true);
    fileService.store.isDirty = () => false;
    await drive.saveAndOpen();
    expect(fileService.openDriveDocument).toHaveBeenCalledOnce();
    expect(drive.pending()).toBeNull();
  });
  it('invalid downloaded content never replaces the current book', async () => {
    const { drive, fileService } = service(false);
    fileService.validateExternalDocument.mockImplementation(() => { throw new Error('Invalid document'); });
    await drive.download(file);
    expect(drive.error()).toContain('Invalid document');
    expect(fileService.openExternalDocument).not.toHaveBeenCalled();
  });
  it('only trashes a permitted document after explicit confirmation and retains local copies', async () => {
    const { drive } = service(false);
    const document = { ...file, capabilities: { canTrash: true } };
    const trash = vi.fn().mockResolvedValue({ id: file.id, trashed: true });
    window.desktopAPI!.driveTrashFile = trash;
    drive.status.set({ configured: true, connected: true, writable: true, account: { name: 'Writer', email: 'writer@example.test' } });
    drive.files.set([document]);
    const cached = { ...file, account: 'writer@example.test', path: 'local.libria', pending: true, modifiedAt: 1 };
    drive.offlineFiles.set([cached]);
    drive.requestTrash(document);
    expect(trash).not.toHaveBeenCalled();
    await drive.confirmTrash();
    expect(trash).toHaveBeenCalledWith(file.id, 'writer@example.test');
    expect(drive.files()).toEqual([]);
    expect(drive.offlineFiles()).toEqual([]);
    expect(drive.trashPending()).toBeNull();
  });
  it('blocks trashing folders, documents without permission and the open Drive document', async () => {
    const { drive, fileService } = service(false);
    drive.status.set({ configured: true, connected: true, writable: true, account: { name: 'Writer', email: 'writer@example.test' } });
    expect(drive.canTrash({ ...file, capabilities: { canTrash: false } })).toBe(false);
    expect(drive.canTrash({ ...file, mimeType: 'application/vnd.google-apps.folder', capabilities: { canTrash: true } })).toBe(false);
    fileService.driveLink = () => ({ ...file, version: '1', account: 'writer@example.test' });
    expect(drive.canTrash({ ...file, capabilities: { canTrash: true } })).toBe(false);
  });
  it('keeps the document and confirmation after a network error and rejects a changed account', async () => {
    const { drive } = service(false);
    const document = { ...file, capabilities: { canTrash: true } };
    const trash = vi.fn().mockRejectedValue(new Error('Offline'));
    window.desktopAPI!.driveTrashFile = trash;
    drive.status.set({ configured: true, connected: true, writable: true, account: { name: 'Writer', email: 'writer@example.test' } });
    drive.files.set([document]);
    drive.requestTrash(document);
    await drive.confirmTrash();
    expect(drive.files()).toEqual([document]);
    expect(drive.trashPending()).not.toBeNull();
    expect(drive.error()).toBe('Offline');
    drive.status.set({ configured: true, connected: true, writable: true, account: { name: 'Other', email: 'other@example.test' } });
    await drive.confirmTrash();
    expect(trash).toHaveBeenCalledOnce();
  });
  it('opens a pending local Drive copy without consulting Google or downloading a remote version', async () => {
    const { drive, fileService } = service(false);
    const link = { id: 'remote', name: 'Book.libria', account: 'writer@example.test', version: '1', baseline: 'old' };
    window.desktopAPI!.driveCachedLink = vi.fn().mockResolvedValue(link);
    window.desktopAPI!.readFile = vi.fn().mockResolvedValue('offline changes');
    await drive.openOffline({ ...link, path: 'cached.libria', pending: true, modifiedAt: 1 });
    expect(fileService.openDriveDocument).toHaveBeenCalledWith({ ...link, content: 'offline changes' });
    expect(window.desktopAPI!.driveStatus).not.toHaveBeenCalled();
    expect(window.desktopAPI!.driveReadFile).not.toHaveBeenCalled();
    expect(drive.visible()).toBe(false);
  });
  it('loads documents automatically when opening the modal with a connected account', async () => {
    const { drive } = service(false);
    window.desktopAPI!.driveStatus = vi.fn().mockResolvedValue({ connected: true, configured: true });
    window.desktopAPI!.driveListFiles = vi.fn().mockResolvedValue({ files: [file], nextPageToken: null });
    await drive.show();
    expect(window.desktopAPI!.driveListFiles).toHaveBeenCalledOnce();
    expect(drive.files()).toEqual([file]);
    expect(drive.listed()).toBe(true);
  });
  it('does not present a failed document listing as an empty Drive', async () => {
    const { drive } = service(false);
    window.desktopAPI!.driveStatus = vi.fn().mockResolvedValue({ connected: true, configured: true });
    window.desktopAPI!.driveListFiles = vi.fn().mockRejectedValue(new Error('Offline'));
    await drive.show();
    expect(drive.listed()).toBe(false);
    expect(drive.error()).toBe('Offline');
    expect(drive.busy()).toBe(false);
  });
  it('paginates authorized documents independently of the selected save folder', async () => {
    const { drive } = service(false);
    const folder = { id: 'books', name: 'Books', mimeType: 'application/vnd.google-apps.folder' };
    const list = vi.fn().mockResolvedValue({ files: [file], nextPageToken: 'next' });
    window.desktopAPI!.driveListFiles = list;
    drive.folders.set([folder]);
    await drive.list();
    await drive.list(true);
    expect(list).toHaveBeenLastCalledWith('next', undefined, true);
    list.mockRejectedValueOnce(new Error('Offline'));
    await drive.list();
    expect(drive.folder.id).toBe('books');
    expect(drive.files()).toEqual([file, file]);
    expect(drive.error()).toBe('Offline');
  });
  it('updates a linked document instead of starting a new Drive upload', async () => {
    const { drive, fileService } = service(false);
    fileService.driveLink = () => ({ ...file, version: '1', account: 'writer@example.test' });
    const sync = vi.fn().mockResolvedValue(undefined);
    Object.assign(fileService, { syncDrive: sync });
    window.desktopAPI!.driveStatus = vi.fn().mockResolvedValue({ connected: true });
    window.desktopAPI!.driveListFiles = vi.fn().mockResolvedValue({ files: [], nextPageToken: null });
    const create = vi.fn();
    window.desktopAPI!.driveCreateFile = create;
    await drive.saveToDrive();
    expect(sync).toHaveBeenCalledOnce();
    expect(drive.mode()).toBe('browse');
    expect(drive.currentRequested()).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
  it('opens the official picker and preserves unsaved changes until the user decides', async () => {
    const { drive, fileService } = service(true);
    window.desktopAPI!.drivePickFile = vi.fn().mockResolvedValue(file);
    await drive.pickDocument();
    expect(window.desktopAPI!.drivePickFile).toHaveBeenCalledWith('document');
    expect(window.desktopAPI!.driveReadFile).toHaveBeenCalledWith(file.id);
    expect(drive.pending()?.name).toBe(file.name);
    expect(fileService.openDriveDocument).not.toHaveBeenCalled();
    expect(drive.connecting()).toBe(false);
  });
  it('keeps the destination after cancelling the official folder picker', async () => {
    const { drive } = service(false);
    const folder = { id: 'books', name: 'Books' };
    drive.folders.set([folder]);
    window.desktopAPI!.drivePickFile = vi.fn().mockRejectedValue(new Error('cancelada'));
    await drive.pickFolder();
    expect(drive.folder).toEqual(folder);
    expect(drive.busy()).toBe(false);
    expect(drive.connecting()).toBe(false);
  });
  it('saves a new copy to the selected folder and never opens existing files in save mode', async () => {
    const { drive, fileService } = service(false);
    const upload = vi.fn().mockResolvedValue(undefined);
    Object.assign(fileService, { uploadDriveCopy: upload });
    window.desktopAPI!.driveListFiles = vi.fn().mockResolvedValue({ files: [file], nextPageToken: null });
    drive.mode.set('save');
    drive.status.set({ connected: true, configured: true, writable: true, account: null });
    drive.folders.set([{ id: 'root', name: 'Root' }, { id: 'books', name: 'Books' }]);
    drive.filename.set('My book');
    await drive.download(file);
    expect(window.desktopAPI!.driveReadFile).not.toHaveBeenCalled();
    await drive.upload();
    expect(upload).toHaveBeenCalledWith('books', 'My book.libria');
    expect(drive.message()).toBe('drive.savedSuccessfully');
    expect(drive.mode()).toBe('browse');
  });
  it('blocks saving in a read-only folder and keeps the picker after an upload error', async () => {
    const { drive, fileService } = service(false);
    const upload = vi.fn().mockRejectedValue(new Error('Upload failed'));
    Object.assign(fileService, { uploadDriveCopy: upload });
    drive.mode.set('save');
    drive.status.set({ connected: true, configured: true, writable: true, account: null });
    drive.filename.set('Book.libria');
    drive.folders.set([{ id: 'books', name: 'Books', capabilities: { canAddChildren: false } }]);
    await drive.upload();
    expect(upload).not.toHaveBeenCalled();
    drive.folders.set([{ id: 'root', name: 'Root' }]);
    await drive.upload();
    expect(drive.mode()).toBe('save');
    expect(drive.error()).toBe('Upload failed');
  });
  it('clears the old local destination only after successful native loading', () => {
    const store = { loadDocument: vi.fn() };
    TestBed.configureTestingModule({ providers: [
      { provide: BookStore, useValue: store }, { provide: AssetService, useValue: {} },
      { provide: RecentProjectsService, useValue: {} },
    ] });
    const files = TestBed.inject(FileService);
    files.currentPath = 'C:\\old.libria';
    expect(() => files.openExternalDocument('{}')).toThrow();
    expect(files.currentPath).toBe('C:\\old.libria');
    files.openExternalDocument(JSON.stringify({ libriaVersion: '1.10.0', metadata: { title: 'Book', author: 'Writer', paperSize: '5x8' },
      preferences: {}, chapters: [{ id: 'chapter', title: 'Start', body: [] }] }));
    expect(store.loadDocument).toHaveBeenCalledOnce();
    expect(files.currentPath).toBeNull();
    expect(files.canSilentSave).toBe(false);
  });
});
