/** Identificadores estables para capítulos y bloques. */
const fallback = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/**
 * Genera un identificador con prefijo. Los bloques necesitan un ancla que sobreviva
 * a la inserción de otros bloques: los índices posicionales no sirven para el control
 * de cambios ni para los comentarios.
 */
export function createId(prefix: string): string {
  const uuid = (globalThis as any).crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? fallback()}`;
}
