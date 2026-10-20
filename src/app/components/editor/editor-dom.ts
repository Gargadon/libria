/** DOM selection and caret operations, independent of document state and Angular. */
export function contenteditableOf(node: Node): HTMLElement | null {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.parentElement as HTMLElement)?.closest('[contenteditable="true"]') ?? null;
  }
  return (node as HTMLElement).closest('[contenteditable="true"]');
}

export function getEditableBlock(i: number): HTMLElement | null {
  const containers = document.querySelectorAll<HTMLElement>('.ed__block-container');
  return containers[i]?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null;
}

export function placeCursorAt(el: HTMLElement, offset: number): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  let placed = false;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0;
    if (remaining <= len) {
      range.setStart(node, remaining);
      placed = true;
      break;
    }
    remaining -= len;
  }
  if (!placed) {
    range.selectNodeContents(el);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

export function getCaretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const range = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

let sharedSelectionSurface: { element: HTMLElement; previous: string | null } | null = null;

export function getEditorSelectionSurface(): HTMLElement | null {
  return sharedSelectionSurface?.element ?? null;
}

/** Return input ownership to the individual blocks once the shared range is consumed. */
export function restoreEditorSelectionSurface(preserveSelection = false): void {
  const surface = sharedSelectionSurface;
  if (!surface) return;
  const selection = window.getSelection();
  const anchor = selection?.anchorNode;
  const anchorOffset = selection?.anchorOffset ?? 0;
  const focus = selection?.focusNode;
  const focusOffset = selection?.focusOffset ?? 0;
  sharedSelectionSurface = null;
  if (surface.previous === null) surface.element.removeAttribute('contenteditable');
  else surface.element.setAttribute('contenteditable', surface.previous);
  if (preserveSelection && anchor?.isConnected && focus?.isConnected) {
    const editable = contenteditableOf(anchor);
    if (editable && editable === contenteditableOf(focus)) {
      editable.focus({ preventScroll: true });
      selection!.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
    }
  }
}

/** WebKit needs a focused common editing host for both the range and its painting.
 * Keep it until selection collapses or is consumed; toggling it only for the API
 * call leaves getRangeAt(), native highlighting and input ownership inconsistent.
 */
export function setEditorSelection(
  anchor: Node,
  anchorOffset: number,
  focus: Node,
  focusOffset: number,
): void {
  const selection = window.getSelection();
  if (!selection) return;
  const element =
    anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
  const editor = element?.closest<HTMLElement>('.ed__doc');
  const focusElement =
    focus.nodeType === Node.ELEMENT_NODE ? (focus as Element) : focus.parentElement;
  const sharedHost =
    editor &&
    focusElement?.closest('.ed__doc') === editor &&
    contenteditableOf(anchor) !== contenteditableOf(focus)
      ? editor
      : null;
  try {
    if (sharedHost) {
      if (sharedSelectionSurface?.element !== sharedHost) {
        restoreEditorSelectionSurface();
        sharedSelectionSurface = {
          element: sharedHost,
          previous: sharedHost.getAttribute('contenteditable'),
        };
        sharedHost.setAttribute('contenteditable', 'true');
      }
      sharedHost.focus({ preventScroll: true });
    } else if (sharedSelectionSurface) {
      restoreEditorSelectionSurface();
      contenteditableOf(anchor)?.focus({ preventScroll: true });
    }
    selection.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
  } catch (error) {
    restoreEditorSelectionSurface();
    throw error;
  }
}

export function selectAllBlocks(): void {
  const sel = window.getSelection();
  if (!sel) return;
  const anchor = sel.anchorNode ?? document.activeElement;
  if (!anchor) return;
  const range = selectionRegionRange(anchor);
  if (!range) return;
  setEditorSelection(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
}

export function selectionRegionRange(anchor: Node): Range | null {
  const element =
    anchor.nodeType === Node.ELEMENT_NODE ? (anchor as Element) : anchor.parentElement;
  const container = element?.closest('.ed__block-container');
  const doc = container?.closest('.ed__doc');
  if (!container || !doc) return null;
  const containers = Array.from(doc.querySelectorAll('.ed__block-container'));
  const index = containers.indexOf(container);
  const region = container.getAttribute('data-selection-region');
  let first = index;
  let last = index;
  while (first > 0 && containers[first - 1].getAttribute('data-selection-region') === region)
    first--;
  while (
    last + 1 < containers.length &&
    containers[last + 1].getAttribute('data-selection-region') === region
  )
    last++;
  const editables = containers
    .slice(first, last + 1)
    .flatMap((block) => Array.from(block.querySelectorAll('[contenteditable="true"]')));
  if (!editables.length) return null;
  const range = document.createRange();
  range.setStart(editables[0], 0);
  const end = editables[editables.length - 1];
  range.setEnd(end, end.childNodes.length);
  return range;
}

export function constrainSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return;
  const bounds = selectionRegionRange(selection.anchorNode);
  if (!bounds || !bounds.startContainer.isConnected || !selection.focusNode.isConnected) return;
  const side = bounds.comparePoint(selection.focusNode, selection.focusOffset);
  if (side === 0) return;
  setEditorSelection(
    selection.anchorNode,
    selection.anchorOffset,
    side < 0 ? bounds.startContainer : bounds.endContainer,
    side < 0 ? bounds.startOffset : bounds.endOffset,
  );
}

/** Serialize only manuscript content, never the controls between selected blocks. */
export function selectedEditorContent(): { text: string; html: string } | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const start = contenteditableOf(range.startContainer);
  const end = contenteditableOf(range.endContainer);
  const editor = start?.closest('.ed__doc');
  if (!editor || end?.closest('.ed__doc') !== editor) return null;
  const content = document.createElement('div');
  content.append(range.cloneContents());
  content.querySelectorAll('button, select, input, textarea, [data-editor-control]').forEach(el => el.remove());
  content.querySelectorAll('.ed__block-actions, .ed__note-indicator').forEach(el => el.remove());
  // Keep semantic markup without carrying editor styling or editing attributes.
  content.querySelectorAll('*').forEach(el => {
    for (const attribute of Array.from(el.attributes)) {
      if (attribute.name === 'class' || attribute.name === 'contenteditable' ||
          attribute.name === 'spellcheck' || attribute.name.startsWith('data-libria-') ||
          attribute.name === 'data-selection-region' ||
          attribute.name.startsWith('ng-') || attribute.name.startsWith('_ng'))
        el.removeAttribute(attribute.name);
    }
  });
  const html = content.innerHTML;
  content.querySelectorAll('br').forEach(el => el.replaceWith('\n'));
  Array.from(content.querySelectorAll('p, h1, h2, h3, h4, h5, h6, div, blockquote, pre, li, tr, figcaption'))
    .reverse().forEach(el => {
      if (el.textContent && !el.textContent.endsWith('\n')) el.append('\n');
    });
  return { html, text: (content.textContent || '').replace(/\n+$/, '') };
}
