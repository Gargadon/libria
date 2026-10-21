import {
  contenteditableOf,
  getEditableBlock,
  placeCursorAt,
  getCaretOffset,
  constrainSelection,
  selectAllBlocks,
  selectedEditorContent,
  setEditorSelection,
  selectionRegionRange,
  getEditorSelectionSurface,
  restoreEditorSelectionSurface,
} from './editor-dom';
import { EditorTableService } from './tables.service';
import { EditorImageService } from './images.service';
import { EditorFootnoteService } from './footnotes.service';
import { EditorNotesState } from './notes.state';
import { EditorSpellingComponent, SpellingCorrection } from './editor-spelling.component';
import {
  Component,
  inject,
  computed,
  signal,
  HostListener,
  effect,
  ChangeDetectionStrategy,
  OnDestroy,
} from '@angular/core';
import { BookStore } from '../../store/book.store';
import { AssetService } from '../../services/asset.service';
import { FileService } from '../../services/file.service';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ContenteditableDirective } from './contenteditable.directive';
import { TableContentDirective } from './table-content.directive';
import { EditorPositionService } from '../../services/editor-position.service';
import { Block, sortFootnotesByPosition } from '../../models/book.models';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { NotesChatModalComponent } from '../notes/notes-chat-modal.component';
import {
  sceneBreakGlyph as sbGlyph,
  imageTransform as imgTransform,
  ptToPx,
} from '../../utils/block-maps';

@Component({
  selector: 'app-editor',
  providers: [EditorTableService, EditorImageService, EditorFootnoteService, EditorNotesState],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    TranslateModule,
    ContenteditableDirective,
    TableContentDirective,
    FormsModule,
    NotesChatModalComponent,
    EditorSpellingComponent,
  ],
  host: {
    style: 'display: flex; flex-direction: column; min-height: 0; flex: 1;',
  },
  templateUrl: './editor.component.html',
})
export class EditorComponent implements OnDestroy {
  applySpellingCorrection(item: SpellingCorrection) {
    this._flushPendingInput();
    const chapter = this.store.activeChapter();
    const container = item.element.closest('.ed__block-container');
    const index = Array.from(document.querySelectorAll('.ed__block-container')).indexOf(container!);
    if (!chapter || index < 0 || !item.element.isConnected || item.range.toString() !== item.word) return;
    this.store.saveSnapshot();
    item.element.focus();
    item.range.deleteContents();
    const replacement = document.createTextNode(item.replacement);
    item.range.insertNode(replacement);
    item.range.setStartAfter(replacement);
    item.range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(item.range);
    this.store.updateChapterBlock(chapter.id, index,
      item.element.innerText.replace(/\n$/, ''), item.element.innerHTML);
  }
  readonly tables = inject(EditorTableService);
  readonly images = inject(EditorImageService);
  readonly footnotes = inject(EditorFootnoteService);
  readonly notes = inject(EditorNotesState);
  readonly store = inject(BookStore);
  readonly shortcutModifier = (window.desktopAPI?.platform === 'darwin' ||
    (!window.desktopAPI && /Mac|iPhone|iPad/.test(navigator.platform))) ? 'Cmd' : 'Ctrl';
  readonly fileService = inject(FileService);
  readonly assetService = inject(AssetService);
  readonly translate = inject(TranslateService);

  private readonly _focusBlockWatch = effect(() => {
    const blockIndex = this.store.ui.focusBlockIndex();
    if (blockIndex === null) return;
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    setTimeout(() => {
      const el = this._getEditableBlock(blockIndex);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        this.lastFocusedIndex = blockIndex;
        this.focusedBlockIndex.set(blockIndex);
      }
      this.store.clearFocusBlock();
    }, 100);
  });

  readonly environment = environment;
  readonly sortFootnotesByPosition = sortFootnotesByPosition;

  ptToPx(pt: number): number {
    return (pt * 96) / 72;
  }
  sceneBreakGlyph(t: string): string {
    return sbGlyph(t);
  }
  imageTransform(b: Block): string {
    return imgTransform(b);
  }

  readonly tocChapters = computed(() =>
    this.store.chapters().filter((c) => c.templateId !== 'toc'),
  );

  readonly currentLang = computed(() => {
    const lang = this.store.personalConfig().language;
    const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', it: 'it-IT' };
    return localeMap[lang] || 'es-ES';
  });

  readonly status = computed(() => {
    const chapter = this.store.activeChapter();
    const status = chapter?.status;
    return status === 'ok' || status === 'draft' || status === 'outline' ? status : 'draft';
  });

  readonly statusLabel = computed(() => {
    const s = this.status();
    const map: Record<string, string> = {
      ok: 'editor.statusOk',
      draft: 'editor.statusDraft',
      outline: 'editor.statusOutline',
      front: 'editor.statusFront',
      back: 'editor.statusBack',
    };
    return this.translate.instant(map[s!] || '');
  });

  // --- Note Dialog ---

  // --- Note Status & Replies ---

  lastFocusedIndex = -1;
  private _savedCaretOffset = 0;
  readonly focusedBlockIndex = signal(-1);
  private readonly editorPosition = inject(EditorPositionService);
  readonly selectionToolbar = signal<{ top: number; left: number } | null>(null);
  private _savedSelection: Range | null = null;
  /** Prevents onInput from firing during programmatic splits/merges */
  private _suppressInput = false;
  private _inputTimeout: any;
  private _storeUpdateTimeout: any;
  private _pendingStoreUpdate: (() => void) | null = null;

  // ─── Drag selection across blocks ────────────────────────────────────────────
  private _anchorCaret: { node: Node; offset: number } | null = null;

  readonly activeBlockType = computed(() => {
    const chapter = this.store.activeChapter();
    const idx = this.focusedBlockIndex();
    if (!chapter || idx < 0 || idx >= chapter.body.length) return null;
    return chapter.body[idx].type;
  });

  onFocus(index: number) {
    this._flushPendingInput();
    this.editorPosition.position.set({
      chapterId: this.store.activeChapterId(),
      blockIndex: index,
    });
    this.lastFocusedIndex = index;
    this.focusedBlockIndex.set(index);
  }

  @HostListener('document:selectionchange')
  onDocumentSelectionChange() {
    const current = window.getSelection();
    const surface = getEditorSelectionSurface();
    if (
      surface &&
      (!current?.anchorNode ||
        !current.focusNode ||
        current.isCollapsed ||
        !surface.contains(current.anchorNode) ||
        !surface.contains(current.focusNode) ||
        contenteditableOf(current.anchorNode) === contenteditableOf(current.focusNode))
    ) {
      restoreEditorSelectionSurface(true);
    }
    this._constrainSelection();
    if (this._anchorCaret) {
      this.selectionToolbar.set(null);
      return;
    }
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      this.selectionToolbar.set(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const container =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? (range.commonAncestorContainer as Element)
        : range.commonAncestorContainer.parentElement;
    if (!container?.closest('.ed__doc') || !range.toString().trim()) {
      this.selectionToolbar.set(null);
      return;
    }

    this._savedSelection = range.cloneRange();
    const rect = range.getBoundingClientRect();
    const toolbarWidth = 184;
    const left = Math.max(
      8,
      Math.min(window.innerWidth - toolbarWidth - 8, rect.left + rect.width / 2 - toolbarWidth / 2),
    );
    const top = rect.top >= 54 ? rect.top - 46 : rect.bottom + 8;
    this.selectionToolbar.set({ top, left });
  }

  applyInlineFormat(command: 'bold' | 'italic' | 'underline' | 'removeFormat') {
    if (!this._savedSelection) return;
    const selection = window.getSelection();
    if (!selection) return;

    this._flushPendingInput();
    const saved = this._savedSelection;
    const surface = getEditorSelectionSurface();
    const chapter = this.store.activeChapter();
    const affected =
      surface && chapter
        ? Array.from(surface.querySelectorAll<HTMLElement>('.ed__block-container'))
            .map((block, index) => ({
              index,
              element: block.querySelector<HTMLElement>('[contenteditable="true"]'),
            }))
            .filter((item) => item.element && saved.intersectsNode(item.element))
        : [];
    const editable = contenteditableOf(saved.startContainer);
    if (!editable) return;
    (surface ?? editable).focus({ preventScroll: true });
    setEditorSelection(
      saved.startContainer,
      saved.startOffset,
      saved.endContainer,
      saved.endOffset,
    );
    this.store.saveSnapshot();
    document.execCommand(command, false);
    if (surface && chapter) {
      for (const item of affected)
        this.store.updateChapterBlock(
          chapter.id,
          item.index,
          item.element!.innerText.replace(/\n$/, ''),
          item.element!.innerHTML,
        );
    } else editable.dispatchEvent(new Event('input', { bubbles: true }));
    this.selectionToolbar.set(null);
    this._savedSelection = null;
  }

  onPaste(chapterId: string, blockIndex: number, event: ClipboardEvent) {
    this._flushPendingInput();
    const pastedText = event.clipboardData?.getData('text/plain');
    if (pastedText && this._replaceCrossBlockSelection(pastedText)) {
      event.preventDefault();
      return;
    }
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    if (chapter.body[blockIndex] && this._nativeBlocks.has(chapter.body[blockIndex].type)) return;

    const items = event.clipboardData?.items;
    if (items && this.images.pasteImages(chapterId, items, () => this.lastFocusedIndex)) {
      event.preventDefault();
      return;
    }

    const text = event.clipboardData?.getData('text/plain');
    if (!text || !text.includes('\n')) return; // Let default behavior handle single lines

    event.preventDefault();
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    if (lines.length === 0) return;

    this.store.saveSnapshot();
    const el = event.target as HTMLElement;
    const currentText = el.innerText.replace(/\n$/, '');
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.startContainer, range.startOffset);
    const cursor = preRange.toString().length;

    const textBefore = currentText.substring(0, cursor);
    const textAfter = currentText.substring(cursor);

    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    const middleLines = lines.slice(1, lines.length - 1);

    // 1. Update current block with textBefore + firstLine
    const updatedFirstText = textBefore + firstLine;
    this.store.updateChapterBlock(chapterId, blockIndex, updatedFirstText);
    el.textContent = updatedFirstText;

    this._suppressInput = true;
    let currentIdx = blockIndex;

    // 2. Insert middle lines as new 'p' blocks
    for (const line of middleLines) {
      this.store.insertBlock(chapterId, currentIdx, 'p', line);
      currentIdx++;
    }

    // 3. Insert last line + textAfter as the final new block
    const finalLastText = lastLine + textAfter;
    this.store.insertBlock(chapterId, currentIdx, 'p', finalLastText);
    currentIdx++;

    setTimeout(() => {
      this._suppressInput = false;
      const lastEl = this._getEditableBlock(currentIdx);
      if (lastEl) {
        lastEl.focus();
        this._placeCursorAt(lastEl, lastLine.length);
      }
    }, 50);
  }

  onInput(chapterId: string, blockIndex: number, event: Event) {
    if (this._suppressInput) return;
    const element = event.target as HTMLElement;

    if (!this._inputTimeout) {
      this.store.saveSnapshot();
    }
    clearTimeout(this._inputTimeout);
    this._inputTimeout = setTimeout(() => {
      this._inputTimeout = null;
    }, 1000);

    clearTimeout(this._storeUpdateTimeout);
    // Capture before a split/merge can clear or reuse this DOM element.
    const text = element.innerText.replace(/\n$/, '');
    const html = element.innerHTML;
    this._pendingStoreUpdate = () => {
      this.store.updateChapterBlock(chapterId, blockIndex, text, html);
    };
    this._storeUpdateTimeout = setTimeout(() => this._flushPendingInput(), 200);
  }

  private _flushPendingInput() {
    clearTimeout(this._storeUpdateTimeout);
    this._storeUpdateTimeout = null;
    const update = this._pendingStoreUpdate;
    this._pendingStoreUpdate = null;
    update?.();
  }

  // ─── Mouse handlers for cross-block drag selection ─────────────────────────

  @HostListener('click', ['$event'])
  onEditorClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const sup = target.closest('.fn-ref') as HTMLElement | null;
    if (sup) {
      event.preventDefault();
      const panel = document.querySelector('.ed__fnpanel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  @HostListener('document:mousedown', ['$event'])
  onEditorMouseDown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (target.closest('.ed__selection-toolbar')) return;
    this._anchorCaret = null;
    restoreEditorSelectionSurface();
    if (event.button !== 0 || event.detail > 1) return;
    const editor = target.closest('.ed__doc');
    if (!editor || target.closest('button, input, textarea, select')) return;
    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (!range) return;
    const editable = contenteditableOf(range.startContainer);
    if (!editable || !editor.contains(editable)) return;

    const selection = window.getSelection();
    const anchor =
      event.shiftKey && selection?.anchorNode && editor.contains(selection.anchorNode)
        ? { node: selection.anchorNode, offset: selection.anchorOffset }
        : { node: range.startContainer, offset: range.startOffset };

    // WebKit's native drag would clamp the range back to the initial paragraph
    // on mouseup. Own the gesture from mousedown, not just its intermediate range.
    event.preventDefault();
    editable.focus({ preventScroll: true });
    this._anchorCaret = anchor;
    this.selectionToolbar.set(null);
    this.updateDragSelection(event.clientX, event.clientY, range);
  }

  @HostListener('document:mousemove', ['$event'])
  onEditorMouseMove(event: MouseEvent) {
    if (!this._anchorCaret) return;
    if (event.buttons !== 1) {
      this._anchorCaret = null;
      return;
    }
    event.preventDefault();
    this.updateDragSelection(event.clientX, event.clientY);
  }

  private updateDragSelection(clientX: number, clientY: number, caret?: Range) {
    const anchor = this._anchorCaret;
    if (!anchor || !anchor.node.isConnected) return;
    const range = caret ?? document.caretRangeFromPoint(clientX, clientY);
    if (!range) return;
    let node = range.startContainer;
    let offset = range.startOffset;
    const bounds = selectionRegionRange(anchor.node);
    if (bounds) {
      const side = bounds.comparePoint(node, offset);
      if (side !== 0) {
        node = side < 0 ? bounds.startContainer : bounds.endContainer;
        offset = side < 0 ? bounds.startOffset : bounds.endOffset;
      }
    }
    setEditorSelection(anchor.node, anchor.offset, node, offset);
  }

  @HostListener('document:mouseup', ['$event'])
  onEditorMouseUp(event: MouseEvent) {
    if (!this._anchorCaret || event.button !== 0) return;
    event.preventDefault();
    // Commit the release position synchronously; no queued frame can be lost.
    this.updateDragSelection(event.clientX, event.clientY);
    this._anchorCaret = null;
    this.onDocumentSelectionChange();
  }

  @HostListener('window:blur')
  onEditorWindowBlur() {
    this._anchorCaret = null;
  }

  @HostListener('keydown', ['$event'])
  onEditorKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || this.handleFormattingShortcut(event)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      selectAllBlocks();
      return;
    }
    if (event.target === getEditorSelectionSurface() && !event.defaultPrevented) {
      const selection = window.getSelection();
      const editable = selection?.anchorNode ? contenteditableOf(selection.anchorNode) : null;
      const chapter = this.store.activeChapter();
      const container = editable?.closest('.ed__block-container');
      const index = Array.from(document.querySelectorAll('.ed__block-container')).indexOf(
        container!,
      );
      const isHistory =
        (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase());
      const isEdit =
        ['Backspace', 'Delete', 'Enter'].includes(event.key) ||
        (!event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.isComposing &&
          Array.from(event.key).length === 1);
      if (chapter && editable && index >= 0 && (isHistory || isEdit))
        this.onKeyDown(chapter.id, index, event, editable);
    }
  }

  private handleFormattingShortcut(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing || event.altKey ||
        !(event.ctrlKey || event.metaKey)) return false;
    const target = event.target;
    if (!(target instanceof HTMLElement) ||
        (!target.closest('[contenteditable="true"]') && target !== getEditorSelectionSurface()) ||
        target.closest('input, textarea, select, button')) return false;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return false;
    const range = selection.getRangeAt(0);
    const editable = contenteditableOf(range.startContainer);
    const editor = editable?.closest('.ed__doc');
    if (!editor || contenteditableOf(range.endContainer)?.closest('.ed__doc') !== editor) return false;
    const key = event.key.toLowerCase();
    const inline = !event.shiftKey
      ? ({ b: 'bold', i: 'italic', u: 'underline', '\\': 'removeFormat' } as const)[key as 'b' | 'i' | 'u' | '\\']
      : undefined;
    let action: (() => void) | undefined;
    if (inline) action = () => {
      this._savedSelection = range.cloneRange();
      this.applyInlineFormat(inline);
    };
    else if (key === 'enter') action = () => event.shiftKey ? this.insertSceneBreak() : this.insertPageBreak();
    else if (event.shiftKey) {
      const digit = event.code || `Digit${key}`;
      action = ({ Digit7: () => this.insertOrderedList(), Digit8: () => this.insertUnorderedList(),
        Digit9: () => this.toggleQuote() } as Record<string, () => void>)[digit];
    }
    if (!action) return false;
    event.preventDefault();
    this._flushPendingInput();
    const container = editable!.closest('.ed__block-container');
    this.lastFocusedIndex = Array.from(editor.querySelectorAll('.ed__block-container')).indexOf(container!);
    action();
    return true;
  }

  @HostListener('copy', ['$event'])
  onEditorCopy(event: ClipboardEvent) {
    if (!event.clipboardData) return;
    const content = selectedEditorContent();
    if (!content) return;
    event.clipboardData.setData('text/plain', content.text);
    event.clipboardData.setData('text/html', content.html);
    event.preventDefault();
  }

  @HostListener('paste', ['$event'])
  onSelectionSurfacePaste(event: ClipboardEvent) {
    if (event.target !== getEditorSelectionSurface()) return;
    const selection = window.getSelection();
    const editable = selection?.anchorNode ? contenteditableOf(selection.anchorNode) : null;
    const container = editable?.closest('.ed__block-container');
    const index = Array.from(document.querySelectorAll('.ed__block-container')).indexOf(container!);
    if (index >= 0) this.onPaste(this.store.activeChapterId(), index, event);
  }

  @HostListener('compositionstart', ['$event'])
  onSelectionSurfaceComposition(event: CompositionEvent) {
    if (event.target === getEditorSelectionSurface()) this._replaceCrossBlockSelection('');
  }

  // ─── Key handler ────────────────────────────────────────────────────────────

  private _nativeBlocks = new Set(['list-ordered', 'list-unordered', 'table']);

  @HostListener('beforeinput', ['$event'])
  onBeforeInput(event: InputEvent) {
    if (!event.cancelable || event.isComposing) return;
    const replacement = event.inputType.startsWith('delete')
      ? ''
      : event.inputType === 'insertText'
        ? event.data
        : ['insertParagraph', 'insertLineBreak'].includes(event.inputType)
          ? '\n'
          : null;
    if (replacement !== null && this._replaceCrossBlockSelection(replacement)) {
      event.preventDefault();
    }
  }

  private _replaceCrossBlockSelection(replacement: string): boolean {
    this._constrainSelection();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    const start = contenteditableOf(range.startContainer);
    const end = contenteditableOf(range.endContainer);
    if (!start || !end || start === end) return false;
    const containers = Array.from(document.querySelectorAll('.ed__block-container'));
    const first = containers.indexOf(start.closest('.ed__block-container')!);
    const last = containers.indexOf(end.closest('.ed__block-container')!);
    const chapter = this.store.activeChapter();
    if (!chapter || first < 0 || last <= first || last >= chapter.body.length) return false;
    // Only the primary editable of a block belongs to the paragraph selection.
    if (this._getEditableBlock(first) !== start || this._getEditableBlock(last) !== end)
      return false;

    const prefix = range.cloneRange();
    prefix.selectNodeContents(start);
    prefix.setEnd(range.startContainer, range.startOffset);
    const suffix = range.cloneRange();
    suffix.selectNodeContents(end);
    suffix.setStart(range.endContainer, range.endOffset);
    const before = document.createElement('div');
    before.append(prefix.cloneContents());
    const after = document.createElement('div');
    after.append(suffix.cloneContents());
    const offset = before.textContent!.length;
    const lines = replacement.replace(/\r\n?/g, '\n').split('\n');
    const parts = lines.map((line, index) => {
      const part = document.createElement('div');
      if (index === 0) part.innerHTML = before.innerHTML;
      part.append(document.createTextNode(line));
      if (index === lines.length - 1) part.insertAdjacentHTML('beforeend', after.innerHTML);
      return part;
    });

    this._flushPendingInput();
    this.store.saveSnapshot();
    restoreEditorSelectionSurface();
    for (let index = last; index > first; index--) this.store.deleteBlock(chapter.id, index);
    this.store.updateChapterBlock(
      chapter.id,
      first,
      parts[0].textContent ?? '',
      parts[0].innerHTML,
    );
    for (let index = 1; index < parts.length; index++) {
      this.store.insertBlock(
        chapter.id,
        first + index - 1,
        'p',
        parts[index].textContent ?? '',
        parts[index].innerHTML,
      );
    }
    start.innerHTML = parts[0].innerHTML;
    start.focus();
    this._placeCursorAt(start, offset + lines[0].length);
    if (parts.length > 1) {
      setTimeout(() => {
        const target = this._getEditableBlock(first + parts.length - 1);
        if (target) {
          target.focus();
          this._placeCursorAt(target, lines[lines.length - 1].length);
        }
      }, 16);
    }
    return true;
  }

  onKeyDown(
    chapterId: string,
    blockIndex: number,
    event: KeyboardEvent,
    sourceElement?: HTMLElement,
  ) {
    if (this.handleFormattingShortcut(event)) return;
    // Structural edits and history must see the latest text, with no delayed
    // writes left pointing at indices that can change during the operation.
    if (
      ['Backspace', 'Delete', 'Enter'].includes(event.key) ||
      ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))
    ) {
      this._flushPendingInput();
    }
    if (this._suppressInput) {
      event.preventDefault();
      return;
    }

    const replacement = ['Backspace', 'Delete'].includes(event.key)
      ? ''
      : event.key === 'Enter'
        ? '\n'
        : !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            !event.isComposing &&
            Array.from(event.key).length === 1
          ? event.key
          : null;
    if (replacement !== null && this._replaceCrossBlockSelection(replacement)) {
      event.preventDefault();
      return;
    }

    const chapter = this.store.activeChapter();
    const blockType = chapter?.body[blockIndex]?.type;
    const isNative = blockType && this._nativeBlocks.has(blockType);

    if (
      (event.ctrlKey || event.metaKey) &&
      (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')
    ) {
      event.preventDefault();
      const el = sourceElement ?? (event.target as HTMLElement);
      restoreEditorSelectionSurface();
      this._savedCaretOffset = this._getCaretOffset(el);
      el?.blur();
      if (event.key.toLowerCase() === 'y' || event.shiftKey) {
        this.store.redo();
      } else {
        this.store.undo();
      }
      this._focusAfterHistory();
      return;
    }
    const el = sourceElement ?? (event.target as HTMLElement);

    switch (event.key) {
      // ── Quotes: convert " to smart quotes ──────────────────────────────
      case '"': {
        if (!this.store.tweaks.smartQuotes()) return;
        event.preventDefault();
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');
        const prevChar = offset > 0 ? text.charAt(offset - 1) : '';
        const isOpening = offset === 0 || /\s|[([<{¡¿]/.test(prevChar);

        const lang = this.store.domLang();
        const quote = lang === 'es' ? (isOpening ? '«' : '»') : isOpening ? '“' : '”';

        document.execCommand('insertText', false, quote);
        break;
      }

      // ── Apostrophe: convert ' to smart apostrophe ────────────────────────
      case "'": {
        if (!this.store.tweaks.smartQuotes()) return;
        event.preventDefault();
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');
        const prevChar = offset > 0 ? text.charAt(offset - 1) : '';
        const isOpening = offset === 0 || /\s|[([<{¡¿]/.test(prevChar);

        const apostrophe = isOpening ? '‘' : '’';

        document.execCommand('insertText', false, apostrophe);
        break;
      }

      // ── Hyphen: convert -- to — or - at start to — ────────────────────────
      case '-': {
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');

        // 1. Double hyphen to em-dash
        if (this.store.tweaks.smartDashes() && offset > 0 && text.charAt(offset - 1) === '-') {
          event.preventDefault();
          document.execCommand('delete', false);
          document.execCommand('insertText', false, '—');
          return;
        }

        // 2. Hyphen at start of paragraph to em-dash (Spanish dialogue style)
        if (this.store.tweaks.smartDashes() && offset === 0 && this.store.domLang() === 'es') {
          event.preventDefault();
          document.execCommand('insertText', false, '—');
          return;
        }
        break;
      }

      // ── Dot: convert ... to … ───────────────────────────────────────────
      case '.': {
        if (!this.store.tweaks.smartEllipsis()) return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');

        if (offset >= 2 && text.charAt(offset - 1) === '.' && text.charAt(offset - 2) === '.') {
          event.preventDefault();
          document.execCommand('delete', false);
          document.execCommand('delete', false);
          document.execCommand('insertText', false, '…');
        }
        break;
      }

      // ── Opening Signs (Spanish): ?? -> ¿ and !! -> ¡ ────────────────────
      case '?':
      case '!': {
        if (!this.store.tweaks.smartOpeningSigns() || this.store.domLang() !== 'es') return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');

        if (offset > 0 && text.charAt(offset - 1) === event.key) {
          event.preventDefault();
          document.execCommand('delete', false);
          const sign = event.key === '?' ? '¿' : '¡';
          document.execCommand('insertText', false, sign);
        }
        break;
      }

      // ── Enter: split block ────────────────────────────────────────────────
      case 'Enter': {
        if (isNative) return; // browser handles list/table natively
        event.preventDefault();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        this.store.saveSnapshot();

        const range = sel.getRangeAt(0);
        const currentText = el.innerText.replace(/\n$/, '');
        this.store.updateChapterBlock(chapterId, blockIndex, currentText);

        const preRange = document.createRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.startContainer, range.startOffset);
        const cursor = preRange.toString().length;

        const textBefore = currentText.substring(0, cursor);
        const textAfter = currentText.substring(cursor);

        // SYNC DOM MUTATION to prevent race condition before Angular re-renders
        el.textContent = textBefore;

        this._suppressInput = true;
        this.store.splitBlock(chapterId, blockIndex, cursor);

        setTimeout(() => {
          this._suppressInput = false;
          const cur = this._getEditableBlock(blockIndex);
          if (cur && cur.textContent !== textBefore) cur.textContent = textBefore;

          const next = this._getEditableBlock(blockIndex + 1);
          if (next) {
            if (next.textContent !== textAfter) next.textContent = textAfter;
            next.focus();
            this._placeCursorAt(next, 0);
          }
        }, 16);
        break;
      }

      // ── Backspace at start: merge with previous ───────────────────────────
      case 'Backspace': {
        if (isNative) return; // browser handles list/table natively
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;
        if (this._getCaretOffset(el) !== 0 || blockIndex <= 0) return;

        event.preventDefault();
        this.store.saveSnapshot();
        const chapter = this.store.chapters().find((c) => c.id === chapterId);
        const prevData = chapter?.body[blockIndex - 1];

        if (prevData?.type === 'scene-break' || prevData?.type === 'image') {
          // Delete the non-editable block instead of merging into it
          this._suppressInput = true;
          this.store.deleteBlock(chapterId, blockIndex - 1);
          setTimeout(() => {
            this._suppressInput = false;
            // After deletion, current block is now at blockIndex - 1
            const cur = this._getEditableBlock(blockIndex - 1);
            if (cur) {
              cur.focus();
              this._placeCursorAt(cur, 0);
            }
          }, 16);
        } else {
          const prevText = prevData?.text ?? '';
          const curText = chapter?.body[blockIndex]?.text ?? '';
          const mergedText = prevText + curText;

          // SYNC DOM MUTATION to prevent ghosting or rapid double-backspace cascade
          el.textContent = '';

          this._suppressInput = true;
          this.store.mergeWithPrevious(chapterId, blockIndex);

          setTimeout(() => {
            this._suppressInput = false;
            const merged = this._getEditableBlock(blockIndex - 1);
            if (merged) {
              if (merged.textContent !== mergedText) merged.textContent = mergedText;
              merged.focus();
              this._placeCursorAt(merged, prevText.length);
            }
          }, 16);
        }
        break;
      }

      // ── Delete at end: merge with next ────────────────────────────────────
      case 'Delete': {
        if (isNative) return; // browser handles list/table natively
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const textLen = el.textContent?.length ?? 0;
        if (this._getCaretOffset(el) < textLen) return; // not at end

        const chapter = this.store.chapters().find((c) => c.id === chapterId);
        const nextData = chapter?.body[blockIndex + 1];
        if (!nextData) return;

        event.preventDefault();
        this.store.saveSnapshot();

        if (nextData.type === 'scene-break' || nextData.type === 'image') {
          // Delete the non-editable block
          this._suppressInput = true;
          this.store.deleteBlock(chapterId, blockIndex + 1);
          setTimeout(() => {
            this._suppressInput = false;
            const cur = this._getEditableBlock(blockIndex);
            if (cur) {
              cur.focus();
              this._placeCursorAt(cur, textLen);
            }
          }, 16);
        } else {
          const curText = el.innerText.replace(/\n$/, '');
          const nextText = nextData.text ?? '';
          const mergedText = curText + nextText;

          // SYNC DOM MUTATION to prevent cascade if multiple deletes are fired
          el.textContent = mergedText;

          this._suppressInput = true;
          this.store.updateChapterBlock(chapterId, blockIndex, curText);
          this.store.mergeBlockWithNext(chapterId, blockIndex);

          setTimeout(() => {
            this._suppressInput = false;
            const cur = this._getEditableBlock(blockIndex);
            if (cur) {
              if (cur.textContent !== mergedText) cur.textContent = mergedText;
              cur.focus();
              this._placeCursorAt(cur, curText.length);
            }
          }, 16);
        }
        break;
      }

      // ── Arrow Left / Up: jump to previous editable block ─────────────────
      case 'ArrowLeft':
      case 'ArrowUp': {
        if (this._getCaretOffset(el) !== 0) return;
        const prevIdx = this._prevEditableIndex(blockIndex);
        if (prevIdx < 0) return;
        event.preventDefault();
        const prev = this._getEditableBlock(prevIdx);
        if (prev) {
          prev.focus();
          this._placeCursorAt(prev, prev.textContent?.length ?? 0);
        }
        break;
      }

      // ── Arrow Right / Down: jump to next editable block ───────────────────
      case 'ArrowRight':
      case 'ArrowDown': {
        const textLen = el.textContent?.length ?? 0;
        if (this._getCaretOffset(el) < textLen) return;
        const nextIdx = this._nextEditableIndex(blockIndex);
        if (nextIdx < 0) return;
        event.preventDefault();
        const next = this._getEditableBlock(nextIdx);
        if (next) {
          next.focus();
          this._placeCursorAt(next, 0);
        }
        break;
      }
    }
  }

  /** Returns the nearest [contenteditable="true"] ancestor of a node, if any. */

  // ─── DOM helpers ────────────────────────────────────────────────────────────

  /**
   * Returns the contenteditable element for the block at store index `i`.
   * Uses the container position so scene-breaks don't shift the index.
   */
  private _getEditableBlock(index: number) {
    return getEditableBlock(index);
  }

  private readonly _nonEditableTypes = new Set(['scene-break', 'image', 'page-break']);

  /** Returns the store index of the nearest editable block before `fromIndex`. */
  private _prevEditableIndex(fromIndex: number): number {
    const body = this.store.activeChapter()?.body ?? [];
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (!this._nonEditableTypes.has(body[i].type)) return i;
    }
    return -1;
  }

  /** Returns the store index of the nearest editable block after `fromIndex`. */
  private _nextEditableIndex(fromIndex: number): number {
    const body = this.store.activeChapter()?.body ?? [];
    for (let i = fromIndex + 1; i < body.length; i++) {
      if (!this._nonEditableTypes.has(body[i].type)) return i;
    }
    return -1;
  }

  /** Places the caret at a character offset within a contenteditable element. */
  private _placeCursorAt(el: HTMLElement, offset: number) {
    placeCursorAt(el, offset);
  }

  /** Returns the caret offset (in characters) from the start of the element. */
  private _getCaretOffset(el: HTMLElement) {
    return getCaretOffset(el);
  }

  /** Selects all text across every contenteditable block in the chapter. */

  isTitleBlock(type: string): boolean {
    return ['halftitle', 'title', 'subtitle', 'chapter-num', 'chapter-title', 'h1'].includes(type);
  }

  /** The contiguous title or body region containing the selection anchor. */

  private _constrainSelection() {
    constrainSelection();
  }

  // ─── Other handlers ─────────────────────────────────────────────────────────

  onTypeChange(chapterId: string, blockIndex: number, event: Event) {
    this.store.saveSnapshot();
    const select = event.target as HTMLSelectElement;
    this.store.setBlockType(chapterId, blockIndex, select.value);
  }

  private _insertIndex() {
    return this.lastFocusedIndex >= 0
      ? this.lastFocusedIndex
      : this.store.activeChapter()!.body.length - 1;
  }

  insertSceneBreak() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'scene-break');
    this.store.insertBlock(chapterId, index + 1, 'p', '');
  }

  insertPageBreak() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'page-break');
    this.store.insertBlock(chapterId, index + 1, 'p', '');
  }

  insertOrderedList() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'list-ordered', '', '<ol><li></li></ol>');
  }

  insertUnorderedList() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'list-unordered', '', '<ul><li></li></ul>');
  }

  insertTable() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(
      chapterId,
      index,
      'table',
      '',
      '<table><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>',
    );
  }

  onTableInput(chapterId: string, blockIndex: number, event: Event) {
    this.tables.onTableInput(chapterId, blockIndex, event, this._suppressInput);
  }

  execCommand(command: string) {
    document.execCommand(command, false);
  }

  toggleQuote() {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const idx = this.lastFocusedIndex >= 0 ? this.lastFocusedIndex : 0;
    const block = chapter.body[idx];
    if (!block) return;
    const newType = block.type === 'blockquote' ? 'p' : 'blockquote';
    this.store.saveSnapshot();
    this.store.setBlockType(chapter.id, idx, newType);
  }

  onAttributionInput(chapterId: string, blockIndex: number, event: Event) {
    const el = event.target as HTMLElement;
    this.store.updateBlockAttribution(chapterId, blockIndex, el.innerText);
  }

  insertImage() {
    this.images.insertImage(() => this.lastFocusedIndex);
  }

  private _focusAfterHistory() {
    const savedOffset = this._savedCaretOffset;
    setTimeout(() => {
      let idx = this.lastFocusedIndex;
      if (idx < 0) idx = 0;
      const el = this._getEditableBlock(idx) || this._getEditableBlock(0);
      if (el) {
        el.focus();
        this._placeCursorAt(el, Math.min(savedOffset, el.textContent?.length ?? 0));
      }
    }, 50);
  }

  ngOnDestroy() {
    restoreEditorSelectionSurface();
    clearTimeout(this._inputTimeout);
    clearTimeout(this._storeUpdateTimeout);
  }
}
