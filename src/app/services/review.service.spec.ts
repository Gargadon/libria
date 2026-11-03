import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookStore } from '../store/book.store';
import { ReviewService } from './review.service';

const texts = (store: InstanceType<typeof BookStore>, chapterId: string) =>
  store.chapters().find((chapter) => chapter.id === chapterId)?.body.map((block) => block.text ?? '') ?? [];

describe('control de cambios editorial', () => {
  let store: InstanceType<typeof BookStore>;
  let review: ReviewService;
  let chapterId = '';

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = TestBed.inject(BookStore);
    review = TestBed.inject(ReviewService);
    store.createNewProject();
    chapterId = store.activeChapterId();
    review.author.set('Ana Correctora');
    review.role.set('corrector');
    review.start();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('abre una ronda sin cambios pendientes', () => {
    expect(review.active()).toBe(true);
    expect(review.round()?.author).toBe('Ana Correctora');
    expect(review.count()).toBe(0);
    expect(store.review()?.mode).toBe('track');
  });

  it('registra una corrección de texto y permite rechazarla', () => {
    store.updateChapterBlock(chapterId, 1, 'Hola mundo');
    const [change] = review.changes();

    expect(change.kind).toBe('text');
    expect(change.before).toBe('');
    expect(change.after).toBe('Hola mundo');

    review.reject(change);
    expect(texts(store, chapterId)[1]).toBe('');
    expect(review.count()).toBe(0);
  });

  it('aceptar conserva el texto propuesto y retira el cambio', () => {
    store.updateChapterBlock(chapterId, 1, 'Texto aceptado');
    review.accept(review.changes()[0]);

    expect(texts(store, chapterId)[1]).toBe('Texto aceptado');
    expect(review.count()).toBe(0);
    expect(store.review()?.baseline?.[0].body[1].text).toBe('Texto aceptado');
  });

  it('gestiona párrafos insertados', () => {
    store.insertBlock(chapterId, 1, 'p', 'Nuevo párrafo');
    expect(review.changes()[0].kind).toBe('block-insert');
    expect(review.changes()[0].after).toBe('Nuevo párrafo');

    review.reject(review.changes()[0]);
    expect(texts(store, chapterId)).toEqual(['Capítulo 1', '']);

    store.insertBlock(chapterId, 1, 'p', 'Nuevo párrafo');
    review.accept(review.changes()[0]);
    expect(texts(store, chapterId)).toEqual(['Capítulo 1', '', 'Nuevo párrafo']);
  });

  it('restaura un párrafo eliminado en su posición', () => {
    store.updateChapterBlock(chapterId, 1, 'Primero');
    review.acceptAll();
    store.insertBlock(chapterId, 1, 'p', 'Segundo');
    review.acceptAll();
    expect(texts(store, chapterId)).toEqual(['Capítulo 1', 'Primero', 'Segundo']);

    store.deleteBlock(chapterId, 1);
    const change = review.changes().find((item) => item.kind === 'block-delete')!;
    expect(change.before).toBe('Primero');

    review.reject(change);
    expect(texts(store, chapterId)).toEqual(['Capítulo 1', 'Primero', 'Segundo']);
    expect(review.count()).toBe(0);
  });

  it('trata la división de un párrafo como corrección más inserción', () => {
    store.updateChapterBlock(chapterId, 1, 'Uno dos');
    review.acceptAll();
    store.splitBlock(chapterId, 1, 4);

    expect(review.changes().map((change) => change.kind).sort()).toEqual(['block-insert', 'text']);

    review.rejectAll();
    expect(texts(store, chapterId)).toEqual(['Capítulo 1', 'Uno dos']);

    store.splitBlock(chapterId, 1, 4);
    review.acceptAll();
    expect(texts(store, chapterId)).toEqual(['Capítulo 1', 'Uno ', 'dos']);
    expect(review.count()).toBe(0);
  });

  it('acepta un cambio y mantiene pendientes los demás', () => {
    store.insertBlock(chapterId, 1, 'p', 'Otro párrafo');
    store.updateChapterBlock(chapterId, 1, 'Primero');
    const textChange = review.changes().find((change) => change.kind === 'text')!;
    const insertChange = review.changes().find((change) => change.kind === 'block-insert')!;

    review.accept(textChange);
    expect(review.changes().map((change) => change.id)).toEqual([insertChange.id]);
    review.accept(insertChange);
    expect(review.count()).toBe(0);
  });

  it('registra el cambio de título de capítulo', () => {
    store.updateChapterMeta(chapterId, { title: 'Otro título' });
    const change = review.changes().find((item) => item.kind === 'chapter-title')!;

    expect(change.before).toBe('Capítulo 1');
    expect(change.after).toBe('Otro título');
    review.reject(change);
    expect(store.chapters()[0].title).toBe('Capítulo 1');
  });

  it('restaura un capítulo eliminado al rechazar', () => {
    store.addChapter('chapter');
    review.acceptAll();
    const second = store.chapters().find((chapter) => chapter.id !== chapterId)!;
    store.updateChapterBlock(second.id, 1, 'Contenido');
    review.acceptAll();
    const accepted = texts(store, second.id);

    store.deleteChapter(second.id);
    const change = review.changes()[0];
    expect(change.kind).toBe('block-delete');

    review.reject(change);
    expect(store.chapters().some((chapter) => chapter.id === second.id)).toBe(true);
    expect(texts(store, second.id)).toEqual(accepted);
    expect(review.count()).toBe(0);
  });

  it('cerrar aceptando conserva lo propuesto y descartar lo revierte', () => {
    store.updateChapterBlock(chapterId, 1, 'Propuesta');
    review.discard();
    expect(store.review()).toBeNull();
    expect(texts(store, chapterId)[1]).toBe('');

    review.start();
    store.updateChapterBlock(chapterId, 1, 'Propuesta');
    review.finish();
    expect(store.review()).toBeNull();
    expect(texts(store, chapterId)[1]).toBe('Propuesta');
  });

  it('genera un informe con los cambios pendientes', () => {
    store.updateChapterBlock(chapterId, 1, 'Hola mundo');
    const report = review.report();

    expect(report).toContain('Ana Correctora');
    expect(report).toContain('1 cambio pendiente');
    expect(report).toContain('Hola mundo');
  });
});
