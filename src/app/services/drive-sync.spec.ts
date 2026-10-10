import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileService } from './file.service';
import { BookStore } from '../store/book.store';
import { AssetService } from './asset.service';
import { RecentProjectsService } from './recent-projects.service';

describe('Drive synchronization', () => {
  afterEach(() => { TestBed.resetTestingModule(); delete window.desktopAPI; });
  function fixture() {
    let title = 'Original';
    const store = { book: () => ({ title }), tweaks: () => ({}), activeChapterId: () => null,
      chapters: () => [], notes: () => [], writingGoals: () => ({}), characters: () => [], locations: () => [],
      markAsSaved: vi.fn(), loadDocument: vi.fn(), isDirty: () => true };
    const api = { driveCacheFile: vi.fn().mockResolvedValue('local.libria'),
      driveStatus: vi.fn().mockResolvedValue({ connected: true, account: { email: 'writer@example.test' } }),
      driveFileMetadata: vi.fn().mockResolvedValue({ version: '1' }),
      driveWriteFile: vi.fn().mockResolvedValue({ conflict: false, version: '2' }), driveReadFile: vi.fn() };
    window.desktopAPI = api as unknown as DesktopAPI;
    TestBed.configureTestingModule({ providers: [
      { provide: BookStore, useValue: store }, { provide: AssetService, useValue: { getAll: () => ({}) } },
      { provide: RecentProjectsService, useValue: { add: vi.fn() } },
    ] });
    const files = TestBed.inject(FileService);
    files.driveLink.set({ id: 'book', name: 'Book.libria', version: '1', account: 'writer@example.test', baseline: files.documentContent() });
    return { files, api, store, edit: (value: string) => { title = value; } };
  }
  it('keeps local changes and avoids uploading when both copies changed', async () => {
    const f = fixture(); f.edit('Local change');
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    await f.files.syncDrive();
    expect(f.files.syncState()).toBe('conflict');
    expect(f.api.driveCacheFile).toHaveBeenCalled();
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
    expect(f.store.loadDocument).not.toHaveBeenCalled();
  });
  it('preserves an offline working copy and reports pending synchronization', async () => {
    const f = fixture(); f.edit('Offline change');
    f.api.driveFileMetadata.mockRejectedValue(new Error('Offline'));
    await f.files.syncDrive();
    expect(f.files.syncState()).toBe('pending');
    expect(f.files.syncError()).toBe('Offline');
    expect(f.api.driveCacheFile).toHaveBeenCalledWith(f.files.driveLink(), f.files.documentContent());
    expect(f.files.driveLink()?.version).toBe('1');
  });
  it('does not mark edits made during an upload as saved', async () => {
    const f = fixture(); f.edit('Uploaded change');
    f.api.driveWriteFile.mockImplementation(async () => { f.edit('Newer edit'); return { conflict: false, version: '2' }; });
    await f.files.syncDrive();
    expect(f.store.markAsSaved).not.toHaveBeenCalled();
    expect(f.files.syncState()).toBe('pending');
    expect(f.files.driveLink()?.version).toBe('2');
    expect(f.files.driveLink()?.baseline).toContain('Uploaded change');
    expect(f.api.driveCacheFile).toHaveBeenLastCalledWith(f.files.driveLink(), f.files.documentContent());
  });
  it('does not attach an upload result to a replacement document', async () => {
    const f = fixture(); f.edit('Uploaded change');
    f.api.driveWriteFile.mockImplementation(async () => { f.files.openExternalDocument = vi.fn();
      // Closing invalidates the document generation even while a request is running.
      (f.store as any).closeDocument = vi.fn(); f.files.closeProject();
      return { conflict: false, version: '2' }; });
    await f.files.syncDrive();
    expect(f.files.driveLink()).toBeNull();
    expect(f.files.currentPath).toBeNull();
    expect(f.store.markAsSaved).not.toHaveBeenCalled();
  });
  it('pulls remote changes only when the working copy is unchanged', async () => {
    const f = fixture();
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    f.api.driveReadFile.mockResolvedValue({ id: 'book', name: 'Book.libria', version: '2', account: 'writer@example.test', content: '{}' });
    f.files.openDriveDocument = vi.fn().mockResolvedValue(undefined);
    await f.files.syncDrive();
    expect(f.files.openDriveDocument).toHaveBeenCalledOnce();
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
  });
  it('does not replace edits made while downloading a remote change', async () => {
    const f = fixture();
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    f.api.driveReadFile.mockImplementation(async () => { f.edit('Typed during download'); return { content: '{}' }; });
    f.files.openDriveDocument = vi.fn();
    await f.files.syncDrive();
    expect(f.files.openDriveDocument).not.toHaveBeenCalled();
    expect(f.files.syncState()).toBe('conflict');
  });
});
