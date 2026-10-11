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
    let dirty = true;
    const store = { book: () => ({ title }), tweaks: () => ({}), activeChapterId: () => null,
      chapters: () => [], notes: () => [], writingGoals: () => ({}), characters: () => [], locations: () => [],
      markAsSaved: vi.fn(() => { dirty = false; }), setIsSaving: vi.fn(), closeDocument: vi.fn(),
      loadDocument: vi.fn((document: any) => { title = document.metadata.title; dirty = false; }), isDirty: () => dirty };
    const api = { driveCacheFile: vi.fn().mockResolvedValue('local.libria'),
      driveStatus: vi.fn().mockResolvedValue({ connected: true, account: { email: 'writer@example.test' } }),
      driveFileMetadata: vi.fn().mockResolvedValue({ version: '1' }),
      driveWriteFile: vi.fn().mockResolvedValue({ conflict: false, version: '2' }), driveReadFile: vi.fn().mockResolvedValue({ content: 'Remote edits' }),
      readFile: vi.fn(), driveCachedLink: vi.fn(), showError: vi.fn().mockResolvedValue(undefined) };
    window.desktopAPI = api as unknown as DesktopAPI;
    TestBed.configureTestingModule({ providers: [
      { provide: BookStore, useValue: store }, { provide: AssetService, useValue: { getAll: () => ({}) } },
      { provide: RecentProjectsService, useValue: { add: vi.fn() } },
    ] });
    const files = TestBed.inject(FileService);
    files.driveLink.set({ id: 'book', name: 'Book.libria', version: '1', account: 'writer@example.test', baseline: files.documentContent() });
    return { files, api, store, edit: (value: string) => { title = value; dirty = true; } };
  }
  it('saves and permits closing while a Drive network request is still stalled', async () => {
    const f = fixture();
    let resume!: (value: { version: string }) => void;
    f.api.driveFileMetadata.mockImplementation(() => new Promise(resolve => { resume = resolve; }));
    const syncing = f.files.syncDrive();
    await vi.waitFor(() => expect(f.api.driveFileMetadata).toHaveBeenCalled());
    f.edit('Saved before shutting down');
    expect(await f.files.saveLibriaFile(false, false)).toBe(true);
    expect(f.store.isDirty()).toBe(false);
    expect(f.files.syncState()).toBe('pending');
    expect(f.api.driveCacheFile).toHaveBeenLastCalledWith(f.files.driveLink(), f.files.documentContent());
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
    f.files.closeProject();
    resume({ version: '1' });
    await syncing;
    expect(f.files.driveLink()).toBeNull();
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
  });
  it('does not report a failed local save as saved or allow closing without saving', async () => {
    const f = fixture(); f.edit('Unsaved');
    f.api.driveCacheFile.mockRejectedValue(new Error('Disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await f.files.saveLibriaFile(false, false)).toBe(false);
    expect(f.store.isDirty()).toBe(true);
    expect(f.store.markAsSaved).not.toHaveBeenCalled();
    expect(f.api.showError).toHaveBeenCalled();
    expect(f.api.driveFileMetadata).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
  it('queues a save made during synchronization and updates the same Drive file immediately afterwards', async () => {
    const f = fixture(); f.files.autoSync.set(false);
    let resume!: (value: { version: string }) => void;
    f.api.driveFileMetadata.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    const syncing = f.files.syncDrive();
    await vi.waitFor(() => expect(f.api.driveFileMetadata).toHaveBeenCalled());
    f.edit('Save during synchronization');
    expect(await f.files.saveLibriaFile()).toBe(true);
    resume({ version: '1' });
    await syncing;
    expect(f.api.driveWriteFile).toHaveBeenCalledExactlyOnceWith('book', '1', f.files.documentContent(), 'writer@example.test');
    expect(f.files.syncState()).toBe('saved');
    expect(f.files.driveLink()?.id).toBe('book');
    expect(f.files.driveLink()?.version).toBe('2');
  });
  it('updates the original when Drive metadata changed but its content still matches the baseline', async () => {
    const f = fixture(); const baseline = f.files.documentContent(); f.edit('Local change');
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    f.api.driveReadFile.mockResolvedValue({ content: JSON.stringify(JSON.parse(baseline)), version: '2' });
    f.api.driveWriteFile.mockResolvedValue({ conflict: false, version: '3' });
    await f.files.syncDrive();
    expect(f.api.driveWriteFile).toHaveBeenCalledExactlyOnceWith('book', '2', f.files.documentContent(), 'writer@example.test');
    expect(f.files.syncState()).toBe('saved');
    expect(f.files.driveLink()?.version).toBe('3');
  });
  it('uses the acknowledged version when saving again during an upload', async () => {
    const f = fixture(); f.edit('First save');
    let resume!: (value: { conflict: boolean; version: string }) => void;
    f.api.driveWriteFile.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    f.api.driveFileMetadata.mockResolvedValueOnce({ version: '1' }).mockResolvedValue({ version: '2' });
    f.api.driveWriteFile.mockResolvedValue({ conflict: false, version: '3' });
    const syncing = f.files.syncDrive();
    await vi.waitFor(() => expect(f.api.driveWriteFile).toHaveBeenCalledTimes(1));
    f.edit('Second save');
    await f.files.saveLibriaFile();
    resume({ conflict: false, version: '2' });
    await syncing;
    expect(f.api.driveWriteFile).toHaveBeenCalledTimes(2);
    expect(f.api.driveWriteFile).toHaveBeenLastCalledWith('book', '2', f.files.documentContent(), 'writer@example.test');
    expect(f.files.driveLink()?.version).toBe('3');
    expect(f.files.syncState()).toBe('saved');
  });
  it('replaces the original only after an explicit conflict decision and checks its observed version', async () => {
    const f = fixture(); f.edit('My version');
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    f.api.driveReadFile.mockResolvedValue({ content: 'Other author edits', version: '2' });
    await f.files.syncDrive();
    expect(f.files.syncState()).toBe('conflict');
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
    f.api.driveWriteFile.mockResolvedValue({ conflict: false, version: '3' });
    await f.files.replaceDriveVersion();
    expect(f.api.driveWriteFile).toHaveBeenCalledExactlyOnceWith('book', '2', f.files.documentContent(), 'writer@example.test');
    expect(f.files.driveLink()?.id).toBe('book');
    expect(f.files.syncState()).toBe('saved');
  });
  it('stops replacing the original if it changed again after the conflict was shown', async () => {
    const f = fixture(); f.edit('My version');
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    f.api.driveReadFile.mockResolvedValue({ content: 'Other author edits', version: '2' });
    await f.files.syncDrive();
    f.api.driveWriteFile.mockResolvedValue({ conflict: true });
    await f.files.replaceDriveVersion();
    expect(f.files.syncState()).toBe('conflict');
    expect(f.files.driveLink()?.version).toBe('1');
    expect(f.files.documentContent()).toContain('My version');
  });
  it('recovers saved offline changes after reopening and uploads them when Drive is unchanged', async () => {
    const f = fixture(); f.edit('Offline chapter');
    await f.files.saveLibriaFile(false, false);
    const content = f.files.documentContent();
    const link = f.files.driveLink();
    f.files.closeProject();
    f.files.autoSync.set(false);
    f.api.readFile.mockResolvedValue(content);
    f.api.driveCachedLink.mockResolvedValue(link);
    await f.files.openLibriaFileByPath('local.libria');
    expect(f.files.documentContent()).toBe(content);
    expect(f.files.driveLink()).toEqual(link);
    expect(f.files.syncState()).toBe('pending');
    await f.files.syncDrive();
    expect(f.api.driveWriteFile).toHaveBeenCalledWith('book', '1', content, 'writer@example.test');
    expect(f.files.syncState()).toBe('saved');
  });
  it('keeps local changes and avoids uploading when both copies changed', async () => {
    const f = fixture(); f.edit('Local change');
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    await f.files.syncDrive();
    expect(f.files.syncState()).toBe('conflict');
    expect(f.api.driveCacheFile).toHaveBeenCalled();
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
    expect(f.store.loadDocument).not.toHaveBeenCalled();
  });
  it.each([{ trashed: true }, { unavailable: true }])('preserves local edits without uploading an unavailable remote: %j', async state => {
    const f = fixture(); f.edit('Keep this chapter');
    f.api.driveFileMetadata.mockResolvedValue({ version: '1', ...state });
    await f.files.syncDrive();
    expect(f.api.driveCacheFile).toHaveBeenCalled();
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
    expect(f.api.driveReadFile).not.toHaveBeenCalled();
    expect(f.files.syncError()).toContain('papelera');
    expect(f.files.documentContent()).toContain('Keep this chapter');
  });
  it('recognizes a completed upload after closing before its acknowledgement was saved', async () => {
    const f = fixture(); f.edit('Already uploaded');
    f.api.driveFileMetadata.mockResolvedValue({ version: '2' });
    f.api.driveReadFile.mockResolvedValue({ id: 'book', name: 'Book.libria', version: '2', account: 'writer@example.test', content: f.files.documentContent() });
    await f.files.syncDrive();
    expect(f.files.syncState()).toBe('saved');
    expect(f.files.driveLink()?.version).toBe('2');
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
  it('uploads a local document to the chosen folder and links its cached copy', async () => {
    const f = fixture();
    f.files.currentPath = 'C:\\original.libria';
    f.files.driveLink.set(null);
    const link = { id: 'new-file', name: 'Novel.libria', version: '1', account: 'writer@example.test' };
    const create = vi.fn().mockResolvedValue(link);
    window.desktopAPI!.driveCreateFile = create;
    (f.files.recentProjects as any).add = vi.fn();
    await f.files.uploadDriveCopy('folder-id', 'Novel.libria');
    expect(create).toHaveBeenCalledWith('Novel.libria', f.files.documentContent(), 'folder-id');
    expect(f.files.driveLink()?.id).toBe('new-file');
    expect(f.files.currentPath).toBe('local.libria');
    expect(f.store.markAsSaved).toHaveBeenCalledOnce();
    expect(f.api.driveWriteFile).not.toHaveBeenCalled();
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
