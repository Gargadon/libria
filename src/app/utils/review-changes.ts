import { Block, Chapter, ReviewState } from '../models/book.models';
import { markWholeBlock, renderReviewHtml } from './review-marks';

export type ReviewChangeKind = 'text' | 'block-insert' | 'block-delete' | 'block-replace' | 'chapter-title';

/** Cambio derivado; no se persiste: se calcula comparando el estado aceptado con el actual. */
export interface ReviewChange {
  /** Identificador estable del cambio (`chapterId:blockId`, con sufijo si hace falta). */
  id: string;
  kind: ReviewChangeKind;
  chapterId: string;
  chapterTitle: string;
  blockId: string;
  blockIndex: number;
  /** Texto aceptado (lo que se leería al rechazar). */
  before: string;
  /** Texto propuesto (lo que se leería al aceptar). */
  after: string;
  beforeHtml?: string;
  afterHtml?: string;
  /** Bloque afectado en los cambios de estructura. */
  block?: Block;
  /** Bloque del estado aceptado, para rechazar un reemplazo o una eliminación. */
  acceptedBlock?: Block;
  beforeTitle?: string;
  afterTitle?: string;
}

const blockKey = (chapterId: string, block: Block, index: number) =>
  block.id && block.id.length ? block.id : `${chapterId}#${index}`;

const matches = (a: Block, b: Block) => a.type === b.type;

/**
 * Compara el estado aceptado con el actual y devuelve los cambios pendientes.
 * La alineación se hace por `id` de bloque, de modo que insertar o borrar bloques
 * no desplaza la identidad de los comentarios ni de los cambios posteriores.
 */
export function computeReviewChanges(chapters: Chapter[], baseline: Chapter[] | null | undefined): ReviewChange[] {
  if (!baseline) return [];
  const changes: ReviewChange[] = [];
  const liveChapters = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const baselineChapters = new Map(baseline.map((chapter) => [chapter.id, chapter]));

  for (const chapter of chapters) {
    const accepted = baselineChapters.get(chapter.id);
    if (!accepted) {
      chapter.body.forEach((block, index) => {
        changes.push(insertChange(chapter, block, index));
      });
      continue;
    }
    if ((accepted.title ?? '') !== (chapter.title ?? '')) {
      changes.push({
        id: `${chapter.id}:title`,
        kind: 'chapter-title',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        blockId: 'title',
        blockIndex: -1,
        before: accepted.title ?? '',
        after: chapter.title ?? '',
        beforeTitle: accepted.title ?? '',
        afterTitle: chapter.title ?? '',
      });
    }
    changes.push(...compareChapter(chapter, accepted));
  }

  // Capítulos presentes solo en el estado aceptado: se proponen como eliminados.
  for (const accepted of baseline) {
    if (liveChapters.has(accepted.id)) continue;
    accepted.body.forEach((block, index) => {
      changes.push(deleteChange(accepted, block, index));
    });
  }

  return changes;
}

function compareChapter(chapter: Chapter, accepted: Chapter): ReviewChange[] {
  const changes: ReviewChange[] = [];
  const acceptedIndexById = new Map<string, number>();
  accepted.body.forEach((block, index) => acceptedIndexById.set(blockKey(chapter.id, block, index), index));

  let cursor = 0;
  chapter.body.forEach((block, index) => {
    const key = blockKey(chapter.id, block, index);
    const acceptedIndex = acceptedIndexById.get(key);

    // Bloques aceptados que desaparecieron antes de este punto.
    const limit = acceptedIndex ?? cursor;
    while (cursor < limit) {
      const pending = accepted.body[cursor];
      if (pending) changes.push(deleteChange(chapter, pending, cursor));
      cursor++;
    }

    if (acceptedIndex === undefined) {
      changes.push(insertChange(chapter, block, index));
      return;
    }

    const previous = accepted.body[acceptedIndex];
    if (previous && !matches(previous, block)) {
      changes.push(replaceChange(chapter, previous, block, index));
    } else if ((previous?.text ?? '') !== (block.text ?? '')) {
      changes.push({
        id: `${chapter.id}:${key}`,
        kind: 'text',
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        blockId: key,
        blockIndex: index,
        before: previous?.text ?? '',
        after: block.text ?? '',
        beforeHtml: previous?.html,
        afterHtml: block.html,
        block,
      });
    }
    cursor = Math.max(cursor, acceptedIndex + 1);
  });

  while (cursor < accepted.body.length) {
    const pending = accepted.body[cursor];
    if (pending) changes.push(deleteChange(chapter, pending, cursor));
    cursor++;
  }

  return changes;
}

function insertChange(chapter: Chapter, block: Block, index: number): ReviewChange {
  return {
    id: `${chapter.id}:${blockKey(chapter.id, block, index)}:insert`,
    kind: 'block-insert',
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    blockId: blockKey(chapter.id, block, index),
    blockIndex: index,
    before: '',
    after: block.text ?? '',
    afterHtml: block.html,
    block,
  };
}

function deleteChange(chapter: Chapter, block: Block, index: number): ReviewChange {
  return {
    id: `${chapter.id}:${blockKey(chapter.id, block, index)}:delete`,
    kind: 'block-delete',
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    blockId: blockKey(chapter.id, block, index),
    blockIndex: index,
    before: block.text ?? '',
    after: '',
    beforeHtml: block.html,
    block,
    acceptedBlock: block,
  };
}

function replaceChange(chapter: Chapter, previous: Block, block: Block, index: number): ReviewChange {
  return {
    id: `${chapter.id}:${blockKey(chapter.id, block, index)}:replace`,
    kind: 'block-replace',
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    blockId: blockKey(chapter.id, block, index),
    blockIndex: index,
    before: previous.text ?? '',
    after: block.text ?? '',
    beforeHtml: previous.html,
    afterHtml: block.html,
    block,
    acceptedBlock: previous,
  };
}

/**
 * Reconstruye el estado aceptado de un capítulo aplicando solo los cambios indicados.
 * Aceptar un cambio equivale a rebasar el capítulo con ese cambio incluido; así el
 * resto de cambios pendientes sigue pendiente y no se acepta nada de más.
 */
export function rebaseChapter(
  chapter: Chapter,
  accepted: Chapter | undefined,
  applied: (changeKey: string) => boolean,
): Chapter {
  if (!accepted) {
    const body = chapter.body.filter((block, index) =>
      has(applied, chapter.id, blockKey(chapter.id, block, index), 'insert'));
    return { ...chapter, body: body.map((block) => ({ ...block })) };
  }

  const acceptedByKey = new Map<string, Block>();
  accepted.body.forEach((block, index) => acceptedByKey.set(blockKey(chapter.id, block, index), block));
  const liveKeys = new Set<string>();
  const body: Block[] = [];

  chapter.body.forEach((block, index) => {
    const key = blockKey(chapter.id, block, index);
    liveKeys.add(key);
    const previous = acceptedByKey.get(key);
    if (has(applied, chapter.id, key, 'insert')) {
      body.push({ ...block });
    } else if (!previous) {
      // Inserción todavía no aceptada: no entra en el estado aceptado.
    } else if (has(applied, chapter.id, key, 'delete')) {
      // Eliminación aceptada: el bloque sale del estado aceptado.
    } else if (has(applied, chapter.id, key, 'replace') || has(applied, chapter.id, key, 'text')) {
      body.push({ ...block });
    } else {
      body.push({ ...previous });
    }
  });

  accepted.body.forEach((block, index) => {
    const key = blockKey(accepted.id, block, index);
    if (liveKeys.has(key)) return;
    if (has(applied, chapter.id, key, 'delete')) return; // eliminación aceptada
    body.push({ ...block });
  });

  return {
    ...chapter,
    body,
    title: applied(`${chapter.id}:title:title`) ? chapter.title : accepted.title,
  };
}

/** El predicado recibe claves con sufijo de tipo: `blk-1`, `blk-1:insert`, etc. */
function has(applied: (key: string) => boolean, chapterId: string, key: string, kind: string): boolean {
  return applied(`${chapterId}:${key}:${kind}`);
}

export function changeKey(change: ReviewChange): string {
  const suffix = change.kind === 'block-insert' ? 'insert'
    : change.kind === 'block-delete' ? 'delete'
    : change.kind === 'block-replace' ? 'replace'
    : change.kind === 'text' ? 'text'
    : 'title';
  return `${change.chapterId}:${change.blockId}:${suffix}`;
}

/** Cambios agrupados por capítulo, en el orden del manuscrito. */
export function groupChanges(changes: ReviewChange[], chapters: Chapter[]): { chapter: Chapter; changes: ReviewChange[] }[] {
  return chapters
    .map((chapter) => ({ chapter, changes: changes.filter((change) => change.chapterId === chapter.id) }))
    .filter((entry) => entry.changes.length > 0);
}

export function pendingChanges(review: ReviewState | null | undefined, chapters: Chapter[]): ReviewChange[] {
  if (!review || review.mode !== 'track' || !review.baseline) return [];
  return computeReviewChanges(chapters, review.baseline);
}

/**
 * Devuelve los capítulos con las marcas ya aplicadas al HTML de cada bloque, incluidas
 * las propuestas de eliminación (que no existen en el manuscrito actual). Se usa para
 * exportar con marcas: los exportadores reciben HTML marcado y no necesitan conocer el
 * estado de revisión.
 */
export function withReviewMarks(chapters: Chapter[], review: ReviewState | null | undefined): Chapter[] {
  if (!review || review.mode !== 'track' || !review.baseline) return chapters;
  const changes = computeReviewChanges(chapters, review.baseline);
  if (!changes.length) return chapters;
  const byKey = new Map(changes.map((change) => [`${change.chapterId}:${change.blockId}`, change]));
  const accepted = new Map(review.baseline.map((chapter) => [chapter.id, chapter]));

  const merged = chapters.map((chapter) => mergeChapter(chapter, accepted.get(chapter.id), byKey));
  const liveIds = new Set(chapters.map((chapter) => chapter.id));
  for (const chapter of review.baseline) {
    if (!liveIds.has(chapter.id)) merged.push(mergeChapter(chapter, chapter, byKey, true));
  }
  return merged;
}

function mergeChapter(
  chapter: Chapter,
  accepted: Chapter | undefined,
  changes: Map<string, ReviewChange>,
  allDeleted = false,
): Chapter {
  if (!accepted) {
    const body = chapter.body.map((block, index) => {
      const change = changes.get(`${chapter.id}:${blockKey(chapter.id, block, index)}`);
      return change && change.kind === 'block-insert'
        ? markedBlock(block, 'ins')
        : { ...block };
    });
    return { ...chapter, body };
  }

  const acceptedIndexById = new Map<string, number>();
  accepted.body.forEach((block, index) => acceptedIndexById.set(blockKey(chapter.id, block, index), index));
  const body: Block[] = [];
  let cursor = 0;

  chapter.body.forEach((block, index) => {
    const key = blockKey(chapter.id, block, index);
    const acceptedIndex = acceptedIndexById.get(key);
    const limit = acceptedIndex ?? cursor;
    while (cursor < limit) {
      body.push(markedBlock(accepted.body[cursor], 'del'));
      cursor++;
    }
    const change = changes.get(`${chapter.id}:${key}`);
    if (change?.kind === 'block-insert') {
      body.push(markedBlock(block, 'ins'));
    } else if (change && (change.kind === 'text' || change.kind === 'block-replace')) {
      body.push(markedBlock(block, 'change', change));
    } else if (allDeleted) {
      body.push(markedBlock(block, 'del'));
    } else {
      body.push({ ...block });
    }
    if (acceptedIndex !== undefined) cursor = Math.max(cursor, acceptedIndex + 1);
  });

  while (cursor < accepted.body.length) {
    body.push(markedBlock(accepted.body[cursor], 'del'));
    cursor++;
  }

  return { ...chapter, body };
}

function markedBlock(block: Block, kind: 'ins' | 'del' | 'change', change?: ReviewChange): Block {
  // La base de las marcas es el HTML aceptado: el HTML actual ya contiene el texto
  // propuesto, así que compararlo consigo mismo no mostraría ninguna diferencia.
  if (kind === 'change' && change) {
    return { ...block, html: renderReviewHtml(change.beforeHtml, change.before, change.after) };
  }
  return { ...block, html: markWholeBlock(block.html, block.text ?? '', kind === 'ins' ? 'ins' : 'del') };
}
