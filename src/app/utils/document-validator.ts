import { LIBRIA_SCHEMA_VERSION, LibriaDocument } from '../models/book.models';
import { createId } from './ids';

/**
 * Valida la integridad estructural de un documento .libria.
 * Retorna true si es válido, o lanza un error descriptivo en caso de fallar.
 */
export function validateLibriaDocument(doc: any): doc is LibriaDocument {
  if (!doc || typeof doc !== 'object') {
    throw new Error('El archivo no contiene un objeto JSON válido.');
  }

  if (typeof doc.libriaVersion !== 'string') {
    throw new Error('La versión del formato ("libriaVersion") es inválida o no está presente.');
  }

  if (doc.schemaVersion !== undefined) {
    if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) {
      throw new Error('La versión de esquema ("schemaVersion") es inválida.');
    }
    if (doc.schemaVersion > LIBRIA_SCHEMA_VERSION) {
      throw new Error(
        `El documento usa el esquema ${doc.schemaVersion} y esta versión de Libria admite hasta el ${LIBRIA_SCHEMA_VERSION}. Actualiza la aplicación para abrirlo.`,
      );
    }
  }
  if (doc.revision !== undefined && (!Number.isInteger(doc.revision) || doc.revision < 0)) {
    throw new Error('La revisión del documento es inválida.');
  }
  if (doc.modifiedAt !== undefined && typeof doc.modifiedAt !== 'string') {
    throw new Error('La fecha de modificación del documento es inválida.');
  }
  if (doc.modifiedBy !== undefined && typeof doc.modifiedBy !== 'string') {
    throw new Error('El autor de la última modificación del documento es inválido.');
  }

  if (doc.review !== undefined && doc.review !== null) {
    const review = doc.review;
    if (typeof review !== 'object' || Array.isArray(review)) {
      throw new Error('El estado de revisión del documento es inválido.');
    }
    if (review.mode !== undefined && !['off', 'track'].includes(review.mode)) {
      throw new Error('El modo de revisión del documento es inválido.');
    }
    if (review.round !== undefined && review.round !== null) {
      if (typeof review.round !== 'object' || typeof review.round.author !== 'string' || typeof review.round.startedAt !== 'string') {
        throw new Error('La ronda de revisión del documento es inválida.');
      }
    }
    if (review.baseline !== undefined && review.baseline !== null) {
      if (!Array.isArray(review.baseline)) {
        throw new Error('El estado aceptado de la revisión debe ser una lista de capítulos.');
      }
      for (const chapter of review.baseline) {
        if (!chapter || typeof chapter !== 'object' || typeof chapter.id !== 'string' || !Array.isArray(chapter.body)) {
          throw new Error('El estado aceptado de la revisión contiene un capítulo inválido.');
        }
      }
    }
  }

  if (!doc.metadata || typeof doc.metadata !== 'object') {
    throw new Error('Los metadatos ("metadata") del libro son inválidos o no están presentes.');
  }

  if (typeof doc.metadata.title !== 'string') {
    throw new Error('El título del libro en "metadata.title" es inválido o no está presente.');
  }

  if (typeof doc.metadata.author !== 'string') {
    throw new Error('El autor del libro en "metadata.author" es inválido o no está presente.');
  }

  if (typeof doc.metadata.paperSize !== 'string') {
    throw new Error('El tamaño de papel en "metadata.paperSize" es inválido o no está presente.');
  }
  if (!['5x8', '6x9', 'A5', 'A4', 'A6', 'Letter'].includes(doc.metadata.paperSize)) {
    throw new Error(`El tamaño de papel "${doc.metadata.paperSize}" no es compatible.`);
  }

  if (!doc.preferences || typeof doc.preferences !== 'object') {
    throw new Error('Las preferencias de diseño ("preferences") son inválidas o no están presentes.');
  }
  if (Array.isArray(doc.preferences)) {
    throw new Error('Las preferencias de diseño deben ser un objeto.');
  }
  for (const key of ['firstParagraphSmallCaps', 'hideFirstPageHeaderFooter']) {
    if (doc.preferences[key] !== undefined && typeof doc.preferences[key] !== 'boolean') {
      throw new Error(`La preferencia "${key}" debe ser un booleano.`);
    }
  }
  if (doc.session !== undefined && (!doc.session || typeof doc.session !== 'object' || Array.isArray(doc.session))) {
    throw new Error('La sesión del documento es inválida.');
  }

  if (!Array.isArray(doc.chapters)) {
    throw new Error('La sección de capítulos ("chapters") debe ser una lista/arreglo.');
  }
  if (doc.chapters.length > 10000) {
    throw new Error('El documento contiene demasiados capítulos.');
  }

  const chapterIds = new Set<string>();

  // Validación básica de cada capítulo
  for (let i = 0; i < doc.chapters.length; i++) {
    const ch = doc.chapters[i];
    if (!ch || typeof ch !== 'object') {
      throw new Error(`El capítulo en el índice ${i} es inválido.`);
    }
    if (typeof ch.id !== 'string') {
      throw new Error(`El capítulo en el índice ${i} no tiene un identificador ("id") válido.`);
    }
    if (chapterIds.has(ch.id)) {
      throw new Error(`El identificador de capítulo "${ch.id}" está repetido.`);
    }
    chapterIds.add(ch.id);
    const blockIds = new Set<string>();
    if (typeof ch.title !== 'string') {
      throw new Error(`El capítulo en el índice ${i} ("${ch.id}") no tiene un título ("title") válido.`);
    }
    if (!Array.isArray(ch.body)) {
      throw new Error(`El cuerpo ("body") del capítulo "${ch.title || ch.id}" no es un arreglo válido.`);
    }
    if (ch.body.length > 100000) {
      throw new Error(`El capítulo "${ch.id}" contiene demasiados bloques.`);
    }
    if (ch.kind !== undefined && !['front', 'chapter', 'back'].includes(ch.kind)) {
      throw new Error(`El tipo del capítulo "${ch.id}" no es válido.`);
    }
    for (let j = 0; j < ch.body.length; j++) {
      const block = ch.body[j];
      if (!block || typeof block !== 'object' || typeof block.type !== 'string') {
        throw new Error(`El bloque ${j} del capítulo "${ch.id}" es inválido.`);
      }
      if (block.id !== undefined) {
        if (typeof block.id !== 'string' || !block.id || block.id.length > 200) {
          throw new Error(`El identificador del bloque ${j} del capítulo "${ch.id}" es inválido.`);
        }
        if (blockIds.has(block.id)) {
          throw new Error(`El identificador de bloque "${block.id}" está repetido en el capítulo "${ch.id}".`);
        }
        blockIds.add(block.id);
      }
      if (block.text !== undefined && typeof block.text !== 'string') {
        throw new Error(`El texto del bloque ${j} del capítulo "${ch.id}" es inválido.`);
      }
      if (block.html !== undefined && typeof block.html !== 'string') {
        throw new Error(`El HTML del bloque ${j} del capítulo "${ch.id}" es inválido.`);
      }
    }
  }

  if (doc.assets !== undefined) {
    if (!doc.assets || typeof doc.assets !== 'object' || Array.isArray(doc.assets)) {
      throw new Error('Los recursos del documento son inválidos.');
    }
    for (const [key, value] of Object.entries(doc.assets)) {
      if (!key || typeof value !== 'string' || value.length > 100 * 1024 * 1024) {
        throw new Error(`El recurso "${key}" es inválido o demasiado grande.`);
      }
    }
  }

  return true;
}

/** Normalize documents produced by older Libria releases before validation. */
export function migrateLibriaDocument(input: unknown): LibriaDocument {
  if (!input || typeof input !== 'object') return input as LibriaDocument;
  const source = input as Record<string, any>;
  const preferences = { ...(source['preferences'] || {}) };
  // Preserve the implicit appearance of documents saved before these controls existed.
  preferences.firstParagraphSmallCaps ??= true;
  preferences.hideFirstPageHeaderFooter ??= true;

  if (preferences.smartDashes === undefined && (preferences.emDash !== undefined || preferences.enDash !== undefined)) {
    preferences.smartDashes = Boolean(preferences.emDash ?? preferences.enDash);
  }
  if (preferences.smartEllipsis === undefined && preferences.ellipsis !== undefined) {
    preferences.smartEllipsis = Boolean(preferences.ellipsis);
  }
  if (preferences.smartOpeningSigns === undefined && preferences.openingSigns !== undefined) {
    preferences.smartOpeningSigns = Boolean(preferences.openingSigns);
  }

  const metadata = { ...(source['metadata'] || {}) };
  metadata.authors = Array.isArray(metadata.authors) ? metadata.authors : [metadata.author || ''];
  metadata.editors = Array.isArray(metadata.editors) ? metadata.editors : [];
  metadata.lang = metadata.lang || 'es-MX';

  return {
    ...source,
    // Los documentos anteriores no declaran esquema; se tratan como versión 1.
    schemaVersion: Number.isInteger(source['schemaVersion']) && source['schemaVersion'] > 0
      ? source['schemaVersion']
      : 1,
    metadata,
    preferences,
    session: { ...(source['session'] || {}) },
    chapters: Array.isArray(source['chapters'])
      ? source['chapters'].map((chapter: any) => withBlockIds(chapter))
      : [],
    notes: Array.isArray(source['notes']) ? source['notes'] : [],
    assets: source['assets'] && typeof source['assets'] === 'object' ? source['assets'] : {},
    writingGoals: source['writingGoals'] || undefined,
    characters: Array.isArray(source['characters']) ? source['characters'] : [],
    locations: Array.isArray(source['locations']) ? source['locations'] : [],
    review: normalizeReview(source['review']),
  } as LibriaDocument;
}

/** Normaliza la ronda de revisión y garantiza anclas en el estado aceptado. */
function normalizeReview(review: any) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return null;
  const baseline = Array.isArray(review.baseline)
    ? review.baseline.map((chapter: any) => withBlockIds(chapter))
    : null;
  return {
    ...review,
    mode: review.mode === 'track' ? 'track' : 'off',
    round: review.round ?? null,
    baseline,
  };
}

/**
 * Asigna un identificador estable a cada bloque que no lo tenga. Es una migración
 * perezosa: no se escribe en disco hasta el siguiente guardado.
 */
export function withBlockIds<T extends { body?: unknown }>(chapter: T): T {
  const body = (chapter as any)?.body;
  if (!Array.isArray(body)) return chapter;
  let changed = false;
  const next = body.map((block: any) => {
    if (!block || typeof block !== 'object' || typeof block.id === 'string') return block;
    changed = true;
    return { ...block, id: createId('blk') };
  });
  return changed ? ({ ...chapter, body: next } as T) : chapter;
}
