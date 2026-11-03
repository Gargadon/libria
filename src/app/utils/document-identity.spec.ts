import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookStore } from '../store/book.store';
import { FileService } from '../services/file.service';
import { LIBRIA_SCHEMA_VERSION } from '../models/book.models';
import { migrateLibriaDocument, validateLibriaDocument } from './document-validator';

const legacy = () => ({
  libriaVersion: '1.6.2',
  metadata: { title: 'Libro', author: 'Autor', paperSize: '5x8' },
  preferences: {},
  chapters: [
    { id: 'ch-1', title: 'Inicio', body: [{ type: 'chapter-title', text: 'Inicio' }, { type: 'p', text: 'Hola' }] },
  ],
});

const validDocument = (patch: Record<string, unknown> = {}) => ({
  libriaVersion: '2.1.1',
  metadata: { title: 'Libro', author: 'Autor', paperSize: '5x8' },
  preferences: {},
  chapters: [],
  ...patch,
});

const bodyIds = (store: InstanceType<typeof BookStore>) =>
  store.chapters().flatMap((chapter) => chapter.body.map((block) => block.id));

describe('identidad del documento y anclaje de bloques', () => {
  beforeEach(() => TestBed.configureTestingModule({}));
  afterEach(() => {
    TestBed.resetTestingModule();
    delete (window as any).desktopAPI;
  });

  it('marca los documentos heredados con el esquema 1 y asigna identificadores únicos', () => {
    const migrated = migrateLibriaDocument(legacy());

    expect(migrated.schemaVersion).toBe(1);
    const ids = migrated.chapters[0].body.map((block) => block.id);
    expect(ids.every((id) => typeof id === 'string' && id!.startsWith('blk-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => validateLibriaDocument(migrated)).not.toThrow();
    expect(validateLibriaDocument(migrated)).toBe(true);
  });

  it('conserva los identificadores existentes al migrar', () => {
    const doc = legacy();
    doc.chapters[0].body[1] = { id: 'blk-original', type: 'p', text: 'Hola' } as any;
    const migrated = migrateLibriaDocument(doc);

    expect(migrated.chapters[0].body[1].id).toBe('blk-original');
  });

  it('rechaza identificadores de bloque repetidos dentro de un capítulo', () => {
    const doc = validDocument({
      chapters: [{
        id: 'ch-1',
        kind: 'chapter',
        title: 'Uno',
        body: [{ id: 'blk-a', type: 'p', text: 'a' }, { id: 'blk-a', type: 'p', text: 'b' }],
      }],
    });

    expect(() => validateLibriaDocument(doc)).toThrow(/repetido/);
  });

  it('rechaza un esquema más reciente que el soportado', () => {
    const doc = validDocument({ schemaVersion: LIBRIA_SCHEMA_VERSION + 1 });

    expect(() => validateLibriaDocument(doc)).toThrow(/esquema/);
  });

  it('rechaza sellos de revisión inválidos', () => {
    expect(() => validateLibriaDocument(validDocument({ revision: -1 }))).toThrow(/revisión/);
    expect(() => validateLibriaDocument(validDocument({ revision: 1.5 }))).toThrow(/revisión/);
    expect(() => validateLibriaDocument(validDocument({ modifiedBy: 42 }))).toThrow(/autor/);
  });

  it('crea identificadores al abrir un proyecto, añadir capítulos y editar bloques', () => {
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    expect(bodyIds(store).every((id) => typeof id === 'string')).toBe(true);

    store.addChapter('chapter');
    store.insertBlock(store.activeChapterId(), 0, 'p', 'nuevo');
    store.splitBlock(store.activeChapterId(), 1, 2);
    store.insertImageBlock(store.activeChapterId(), 0, 'img-1');

    const ids = bodyIds(store);
    expect(ids.every((id) => typeof id === 'string' && id!.length > 4)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('asigna identificadores a los capítulos restaurados o importados', () => {
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    store.addChapters([{ id: 'importado', kind: 'chapter', title: 'Importado', words: 0, body: [{ type: 'p', text: 'x' }] }]);

    const restored = store.chapters().find((chapter) => chapter.id === 'importado')!;
    expect(restored.body[0].id).toMatch(/^blk-/);
  });

  it('escribe el esquema, la revisión y la autoría en el documento serializado', () => {
    const store = TestBed.inject(BookStore);
    const files = TestBed.inject(FileService);
    store.createNewProject();

    const initial = JSON.parse(files.documentContent());
    expect(initial.schemaVersion).toBe(LIBRIA_SCHEMA_VERSION);
    expect(initial.revision).toBe(0);
    expect(initial.modifiedAt).toBe('');
    expect(() => validateLibriaDocument(initial)).not.toThrow();

    store.setDocumentStamp(7, '2026-11-01T18:00:00.000Z', 'Ana Correctora');
    const stamped = JSON.parse(files.documentContent());
    expect(stamped.revision).toBe(7);
    expect(stamped.modifiedAt).toBe('2026-11-01T18:00:00.000Z');
    expect(stamped.modifiedBy).toBe('Ana Correctora');
    expect(() => validateLibriaDocument(stamped)).not.toThrow();
  });

  it('avanza la revisión solo cuando el guardado se completa', async () => {
    const store = TestBed.inject(BookStore);
    const files = TestBed.inject(FileService);
    store.createNewProject();
    store.setPersonalConfig({ ...store.personalConfig(), userName: 'David' });
    store.updateChapterBlock(store.chapters()[0].id, 1, 'Texto');

    // El usuario cancela el diálogo: no se escribe ni se consume una revisión.
    (window as any).desktopAPI = { saveDialog: async () => null };
    expect(await files.saveLibriaFile()).toBe(false);
    expect(store.documentRevision()).toBe(0);
    expect(store.modifiedAt()).toBe('');

    let written = '';
    (window as any).desktopAPI = {
      saveDialog: async () => 'C:\\tmp\\libro.libria',
      writeFile: async (_path: string, content: string) => { written = content; },
    };
    expect(await files.saveLibriaFile()).toBe(true);
    expect(store.documentRevision()).toBe(1);
    expect(store.modifiedBy()).toBe('David');

    const saved = JSON.parse(written);
    expect(saved.revision).toBe(1);
    expect(saved.schemaVersion).toBe(LIBRIA_SCHEMA_VERSION);
    expect(saved.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(() => validateLibriaDocument(saved)).not.toThrow();
  });
});
