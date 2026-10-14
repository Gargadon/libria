import { LibriaDocument } from '../models/book.models';

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
    metadata,
    preferences,
    session: { ...(source['session'] || {}) },
    chapters: Array.isArray(source['chapters']) ? source['chapters'] : [],
    notes: Array.isArray(source['notes']) ? source['notes'] : [],
    assets: source['assets'] && typeof source['assets'] === 'object' ? source['assets'] : {},
    writingGoals: source['writingGoals'] || undefined,
    characters: Array.isArray(source['characters']) ? source['characters'] : [],
    locations: Array.isArray(source['locations']) ? source['locations'] : [],
  } as LibriaDocument;
}
