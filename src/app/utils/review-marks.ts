/**
 * Motor de marcas de revisión.
 *
 * Las marcas no se guardan en el documento: se derivan comparando el texto aceptado
 * con el propuesto. Así el contenido canónico (`Block.text`) sigue siendo el que se
 * edita, se busca y se cuenta, y ninguna edición posterior destruye las marcas.
 */

export type DiffOp = { op: 'equal' | 'insert' | 'delete'; text: string };

const TOKEN = /\s+|[^\s]+/g;
/** Por encima de este producto de tokens se usa un diff de prefijo/sufijo. */
const LCS_BUDGET = 4_000_000;

const tokensOf = (value: string): string[] => value.match(TOKEN) ?? [];

/** Diferencia palabra a palabra; agrupa los cambios como lo hace un revisor. */
export function diffWords(before: string, after: string): DiffOp[] {
  if (before === after) return before ? [{ op: 'equal', text: before }] : [];
  const a = tokensOf(before);
  const b = tokensOf(after);
  if (a.length * b.length > LCS_BUDGET) return prefixSuffixDiff(a, b);

  const rows = a.length, cols = b.length;
  const table: Uint32Array[] = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      table[i][j] = a[i] === b[j]
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const ops: DiffOp[] = [];
  const push = (op: DiffOp['op'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.op === op) last.text += text;
    else ops.push({ op, text });
  };
  let i = 0, j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) { push('equal', a[i]); i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) { push('delete', a[i]); i++; }
    else { push('insert', b[j]); j++; }
  }
  while (i < rows) { push('delete', a[i]); i++; }
  while (j < cols) { push('insert', b[j]); j++; }
  return ops;
}

function prefixSuffixDiff(a: string[], b: string[]): DiffOp[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - suffix - 1] === b[b.length - suffix - 1]
  ) suffix++;
  const ops: DiffOp[] = [];
  if (prefix) ops.push({ op: 'equal', text: a.slice(0, prefix).join('') });
  const removed = a.slice(prefix, a.length - suffix).join('');
  const added = b.slice(prefix, b.length - suffix).join('');
  if (removed) ops.push({ op: 'delete', text: removed });
  if (added) ops.push({ op: 'insert', text: added });
  if (suffix) ops.push({ op: 'equal', text: a.slice(a.length - suffix).join('') });
  return ops;
}

const isHigh = (code: number) => code >= 0xd800 && code <= 0xdbff;
const isLow = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** Evita cortar pares sustitutos (emoji) al marcar por unidades de código. */
function keepPairs<T>(marks: T[], text: string): T[] {
  const next = [...marks];
  for (let k = 1; k < next.length; k++) {
    if (isHigh(text.charCodeAt(k - 1)) && isLow(text.charCodeAt(k))) next[k] = next[k - 1];
  }
  return next;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function container(): HTMLElement {
  return document.createElement('div');
}

function parse(html: string): HTMLElement {
  const host = container();
  host.innerHTML = html;
  return host;
}

/** Texto visible de un fragmento HTML (lo que el lector ve, sin etiquetas). */
export function reviewText(html: string | undefined): string {
  if (!html) return '';
  return parse(html).textContent ?? '';
}

function marked(kind: 'ins' | 'del', value: string): HTMLElement {
  const element = document.createElement(kind);
  element.className = kind === 'ins' ? 'rev-ins' : 'rev-del';
  // Estilo en línea para que las marcas se vean igual en la vista de revisión, la
  // previsualización, EPUB y ODT sin depender de una hoja de estilos externa.
  element.setAttribute(
    'style',
    kind === 'ins'
      ? 'color:#1a7f4b;text-decoration:underline'
      : 'color:#a33232;text-decoration:line-through',
  );
  element.textContent = value;
  return element;
}

function textNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  return nodes;
}

/**
 * Marca un bloque completo como insertado o suprimido. Se usa para los cambios de
 * estructura: un párrafo añadido o eliminado entero.
 */
export function markWholeBlock(html: string | undefined, text: string, kind: 'ins' | 'del'): string {
  const source = parse(html ? html : escapeHtml(text));
  for (const node of textNodes(source)) {
    const value = node.textContent ?? '';
    if (!value) continue;
    node.replaceWith(marked(kind, value));
  }
  return source.innerHTML;
}

/**
 * Superpone marcas sobre el HTML de un bloque: lo que falta respecto de `after` se
 * marca como suprimido y lo que sobra como insertado. El formato existente se
 * conserva porque los segmentos se insertan como hermanos del mismo nodo de texto.
 */
export function renderReviewHtml(html: string | undefined, before: string, after: string): string {
  const visible = html ? reviewText(html) : before;
  if (visible === after) return html ?? escapeHtml(before);
  const ops = diffWords(visible, after);

  // Coordenadas sobre el texto visible: estado por carácter y puntos de inserción.
  const marks: ('equal' | 'delete')[] = [];
  const insertions = new Map<number, string>();
  let position = 0;
  for (const op of ops) {
    if (op.op === 'equal') {
      for (let k = 0; k < op.text.length; k++) marks.push('equal');
      position += op.text.length;
    } else if (op.op === 'delete') {
      for (let k = 0; k < op.text.length; k++) marks.push('delete');
      position += op.text.length;
    } else {
      insertions.set(position, (insertions.get(position) ?? '') + op.text);
    }
  }
  const stable = keepPairs(marks, visible);

  const root = parse(html ? html : escapeHtml(visible));

  // Recorre los nodos en orden, acumulando desplazamientos sobre el texto visible.
  const nodes: { node: Text; from: number; to: number }[] = [];
  let offset = 0;
  for (const node of textNodes(root)) {
    const length = (node.textContent ?? '').length;
    nodes.push({ node, from: offset, to: offset + length });
    offset += length;
  }

  for (const { node, from, to } of nodes) {
    const text = node.textContent ?? '';
    if (!text.length) continue;
    const pieces: [('equal' | 'insert' | 'delete'), string][] = [];
    const push = (kind: 'equal' | 'insert' | 'delete', value: string) => {
      if (!value) return;
      const last = pieces[pieces.length - 1];
      if (last && last[0] === kind) last[1] += value;
      else pieces.push([kind, value]);
    };
    for (let k = from; k < to; k++) {
      const inserted = insertions.get(k);
      if (inserted) push('insert', inserted);
      push(stable[k] === 'delete' ? 'delete' : 'equal', text[k - from]);
    }
    if (to === offset) {
      const tail = insertions.get(to);
      if (tail) push('insert', tail);
    }

    const parent = node.parentNode;
    if (!parent) continue;
    for (const [kind, value] of pieces) {
      parent.insertBefore(kind === 'equal' ? document.createTextNode(value) : marked(kind === 'insert' ? 'ins' : 'del', value), node);
    }
    parent.removeChild(node);
  }

  return root.innerHTML;
}

/** Acepta todo: descarta lo suprimido y conserva lo insertado. */
export function acceptMarkedHtml(html: string): string {
  const root = parse(html);
  for (const element of [...root.querySelectorAll('del')]) element.remove();
  for (const element of [...root.querySelectorAll('ins')]) element.replaceWith(...element.childNodes);
  return root.innerHTML;
}

/** Rechaza todo: descarta lo insertado y conserva lo suprimido. */
export function rejectMarkedHtml(html: string): string {
  const root = parse(html);
  for (const element of [...root.querySelectorAll('ins')]) element.remove();
  for (const element of [...root.querySelectorAll('del')]) element.replaceWith(...element.childNodes);
  return root.innerHTML;
}

export function hasMarks(html: string | undefined): boolean {
  return !!html && /<(ins|del)[\s>]/.test(html);
}
