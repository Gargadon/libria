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

  if (!doc.preferences || typeof doc.preferences !== 'object') {
    throw new Error('Las preferencias de diseño ("preferences") son inválidas o no están presentes.');
  }

  if (!Array.isArray(doc.chapters)) {
    throw new Error('La sección de capítulos ("chapters") debe ser una lista/arreglo.');
  }

  // Validación básica de cada capítulo
  for (let i = 0; i < doc.chapters.length; i++) {
    const ch = doc.chapters[i];
    if (!ch || typeof ch !== 'object') {
      throw new Error(`El capítulo en el índice ${i} es inválido.`);
    }
    if (typeof ch.id !== 'string') {
      throw new Error(`El capítulo en el índice ${i} no tiene un identificador ("id") válido.`);
    }
    if (typeof ch.title !== 'string') {
      throw new Error(`El capítulo en el índice ${i} ("${ch.id}") no tiene un título ("title") válido.`);
    }
    if (!Array.isArray(ch.body)) {
      throw new Error(`El cuerpo ("body") del capítulo "${ch.title || ch.id}" no es un arreglo válido.`);
    }
  }

  return true;
}
