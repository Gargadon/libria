import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GoogleDriveService } from './google-drive.service';
import { FileService } from './file.service';
import { AssetService } from './asset.service';
import { BookStore } from '../store/book.store';
import { RecentProjectsService } from './recent-projects.service';

describe('opening Drive documents safely', () => {
  afterEach(() => { delete window.electronAPI; TestBed.resetTestingModule(); });
  const file = { id: 'remote', name: 'Book.libria' };
  function service(dirty: boolean) {
    const fileService = { store: { isDirty: () => dirty }, validateExternalDocument: vi.fn(),
      openExternalDocument: vi.fn(), openDriveDocument: vi.fn(), saveLibriaFile: vi.fn().mockResolvedValue(false) };
    window.electronAPI = { driveStatus: vi.fn(), driveReadFile: vi.fn().mockResolvedValue({ name: file.name, content: '{}' }) } as unknown as ElectronAPI;
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
  it('loads documents automatically when opening the modal with a connected account', async () => {
    const { drive } = service(false);
    window.electronAPI!.driveStatus = vi.fn().mockResolvedValue({ connected: true, configured: true });
    window.electronAPI!.driveListFiles = vi.fn().mockResolvedValue({ files: [file], nextPageToken: null });
    await drive.show();
    expect(window.electronAPI!.driveListFiles).toHaveBeenCalledOnce();
    expect(drive.files()).toEqual([file]);
    expect(drive.listed()).toBe(true);
  });
  it('does not present a failed document listing as an empty Drive', async () => {
    const { drive } = service(false);
    window.electronAPI!.driveStatus = vi.fn().mockResolvedValue({ connected: true, configured: true });
    window.electronAPI!.driveListFiles = vi.fn().mockRejectedValue(new Error('Offline'));
    await drive.show();
    expect(drive.listed()).toBe(false);
    expect(drive.error()).toBe('Offline');
    expect(drive.busy()).toBe(false);
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
