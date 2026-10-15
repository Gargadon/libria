export interface SpellingRange {
  word: string;
  range: Range;
  element: HTMLElement;
}

/** Build ranges without adding markup to editable text or exported content. */
export function spellingRanges(element: HTMLElement, correct: (word: string) => boolean): SpellingRange[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest('[contenteditable="false"], [data-fn], script, style')
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: { node: Node; start: number; end: number }[] = [];
  let text = '';
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const previous = nodes[nodes.length - 1]?.node;
    if (previous) {
      const gap = document.createRange();
      gap.setStartAfter(previous);
      gap.setEndBefore(node);
      if (previous.parentElement?.closest('p,li,td,th,blockquote') !== node.parentElement?.closest('p,li,td,th,blockquote') ||
          gap.cloneContents().querySelector('br,[contenteditable="false"],[data-fn]')) text += ' ';
    }
    const start = text.length;
    text += node.textContent || '';
    nodes.push({ node, start, end: text.length });
  }
  const result: SpellingRange[] = [];
  for (const match of text.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*/gu)) {
    if (correct(match[0])) continue;
    const start = match.index;
    const end = start + match[0].length;
    const first = nodes.find(entry => entry.start <= start && entry.end > start);
    const last = nodes.find(entry => entry.start < end && entry.end >= end);
    if (!first || !last) continue;
    const range = document.createRange();
    range.setStart(first.node, start - first.start);
    range.setEnd(last.node, end - last.start);
    result.push({ word: match[0], range, element });
  }
  return result;
}

export function spellingAtPoint(items: SpellingRange[], x: number, y: number): SpellingRange | undefined {
  return items.find(item => Array.from(item.range.getClientRects()).some(rect =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom));
}
