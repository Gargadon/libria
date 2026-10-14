import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookStore } from '../store/book.store';
import { FileService } from './file.service';
import { RecoveryService } from './recovery.service';
import { RecoveryStorageService, RecoveryVersion } from './recovery-storage.service';
import { AssetService } from './asset.service';

describe('persistent manuscript recovery', () => {
  let records: RecoveryVersion[];
  let storage: { list: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers();
    records = [];
    storage = {
      list: vi.fn(async () => [...records]),
      put: vi.fn(async (version: RecoveryVersion) => { records = [version, ...records.filter(v => v.id !== version.id)]; }),
    };
    TestBed.configureTestingModule({ providers: [{ provide: RecoveryStorageService, useValue: storage }] });
  });
  afterEach(async () => {
    await TestBed.inject(RecoveryService).flush();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  it('backs up a never-saved book including images and restores as a dirty detached copy', async () => {
    const service = TestBed.inject(RecoveryService);
    const store = TestBed.inject(BookStore);
    const files = TestBed.inject(FileService);
    store.createNewProject();
    TestBed.inject(AssetService).set('picture', 'data:image/png;base64,aGVsbG8=');
    store.updateChapterBlock(store.chapters()[0].id, 1, 'Trabajo sin guardar');
    TestBed.tick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0].content).assets.picture).toContain('base64');
    expect(files.currentPath).toBeNull();
    const version = records[0];
    store.updateChapterBlock(store.chapters()[0].id, 1, 'Trabajo nuevo');
    TestBed.tick();
    await service.restore(version);
    expect(store.chapters()[0].body[1].text).toBe('Trabajo sin guardar');
    expect(store.isDirty()).toBe(true);
    expect(files.currentPath).toBeNull();
    expect(files.driveLink()).toBeNull();
    expect(records.some(v => v.content.includes('Trabajo nuevo'))).toBe(true);
  });

  it('flushes the previous project when switching and rotates checkpoints after two minutes', async () => {
    const service = TestBed.inject(RecoveryService);
    const store = TestBed.inject(BookStore);
    store.createNewProject(); TestBed.tick();
    await service.flush();
    store.updateChapterBlock(store.chapters()[0].id, 1, 'Primera sesión'); TestBed.tick();
    await vi.advanceTimersByTimeAsync(120000);
    store.updateChapterBlock(store.chapters()[0].id, 1, 'Segunda versión'); TestBed.tick();
    store.createNewProject(); TestBed.tick();
    await service.flush();
    expect(new Set(records.map(v => v.projectId)).size).toBe(2);
    expect(records.some(v => v.content.includes('Primera sesión'))).toBe(true);
    expect(records.some(v => v.content.includes('Segunda versión'))).toBe(true);
  });

  it('surfaces storage failures and refuses to replace unprotected current work', async () => {
    const service = TestBed.inject(RecoveryService);
    const store = TestBed.inject(BookStore);
    store.createNewProject(); TestBed.tick();
    await service.flush();
    const version = records[0];
    storage.put.mockRejectedValue(new Error('Quota exceeded'));
    store.updateChapterBlock(store.chapters()[0].id, 1, 'Conservar'); TestBed.tick();
    await service.restore(version);
    expect(service.error()).toBe(true);
    expect(store.chapters()[0].body[1].text).toBe('Conservar');
  });

  it('restores a chapter with isolated image keys, leaving existing text and assets intact', async () => {
    const service = TestBed.inject(RecoveryService);
    const store = TestBed.inject(BookStore);
    const assets = TestBed.inject(AssetService);
    store.createNewProject();
    assets.set('picture', 'old-image');
    store.addChapters([{ id: 'illustrated', title: 'Ilustrado', kind: 'chapter', words: 0, body: [{ type: 'image', src: 'picture' }] }]);
    store.addNote('illustrated', 0, 'editor', 'Revisor', 'Revisar imagen');
    TestBed.tick(); await service.flush();
    const version = records[0];
    assets.set('picture', 'new-image'); TestBed.tick();
    await service.restore(version, 'illustrated');
    expect(store.chapters()).toHaveLength(3);
    const restored = store.chapters()[2];
    expect(restored.id).not.toBe('illustrated');
    expect(assets.get('picture')).toBe('new-image');
    expect(assets.get(restored.body[0].src!)).toBe('old-image');
    const recoveredNote = store.notes().find(note => note.chapterId === restored.id)!;
    expect(recoveredNote.content).toBe('Revisar imagen');
    expect(recoveredNote.id).not.toBe(store.notes()[0].id);
  });
});
