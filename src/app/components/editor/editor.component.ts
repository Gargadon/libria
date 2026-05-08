import { Component, inject, computed, signal } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { CommonModule } from '@angular/common';
import { ContenteditableDirective } from './contenteditable.directive';
import { NoteRole, NoteStatus } from '../../models/book.models';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [CommonModule, ContenteditableDirective, FormsModule],
  host: {
    'style': 'display: flex; flex-direction: column; min-height: 0; flex: 1;'
  },
  template: `
    @if (store.activeChapter(); as chapter) {
      <main class="ed">
        <div class="ed__bar">
          <div class="ed__crumbs">
            <span class="ed__chip">
              {{ chapter.kind === 'front' ? 'Preliminares' : chapter.kind === 'back' ? 'Posliminares' : 'Capítulo ' + (chapter.number || 'Sin número') }}
            </span>
            <span class="ed__sep">›</span>
            <span class="ed__current">{{ chapter.title }}</span>
          </div>
          <div class="ed__tools">
            <button class="ed__t" title="Cursiva" (click)="execCommand('italic')">𝐼</button>
            <button class="ed__t" title="Negrita" (click)="execCommand('bold')"><b>B</b></button>
            <button class="ed__t" title="Subrayado" (click)="execCommand('underline')"><u>U</u></button>
            <span class="ed__tsep"></span>
            <button class="ed__t ed__t--wide" title="Salto de escena" (click)="insertSceneBreak()">✦ ✦ ✦</button>
            <button class="ed__t ed__t--wide" title="Salto de página" (click)="insertPageBreak()">[ Página ]</button>
            <button class="ed__t" title="Cita en bloque" (click)="toggleQuote()">❝</button>
            <span class="ed__tsep"></span>
            <button class="ed__t ed__t--text" title="Marcar como revisado">
              <i class="ed__statusDot" [class]="'ed__statusDot--' + status()"></i> {{ statusLabel() }}
            </button>
          </div>
        </div>

        <div class="ed__paper">
          <div class="ed__sheet">
            <article class="ed__doc" 
              [style.font-family]="store.bookFontFamily()"
              [style.font-size.px]="store.tweaks.fontSize()"
              [style.line-height]="store.tweaks.lineHeight()"
              [style.--p-gap.em]="store.tweaks.paragraphSpacing()"
              [class.ed__doc--indent]="store.tweaks.indentFirstLine()"
              [class.ed__doc--justify]="store.tweaks.justifyText()">
              @for (b of chapter.body; track $index) {                <div class="ed__block-container" [class.ed__block-container--has-note]="hasNote($index)">
                  <div class="ed__block-actions">
                    <button class="ed__block-btn" (click)="addNoteToBlock(chapter.id, $index)" title="Añadir nota">💬</button>
                    <select (change)="onTypeChange(chapter.id, $index, $event)" [value]="b.type">
                      <option value="p">Párrafo</option>
                      <option value="first-p">Capitular</option>
                      <option value="chapter-title">Título Cap</option>
                      <option value="chapter-num">Número Cap</option>
                      <option value="scene-break">Salto Escena</option>
                      <option value="page-break">Salto Página</option>
                      <option value="blockquote">Cita</option>
                    </select>
                  </div>
                  @switch (b.type) {
                    @case ('halftitle') { 
                      <h1 class="bk-halftitle" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></h1> 
                    }
                    @case ('title') { 
                      <h1 class="bk-title" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></h1> 
                    }
                    @case ('subtitle') { 
                      <div class="bk-subtitle" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></div> 
                    }
                    @case ('author') { 
                      <div class="bk-author" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></div> 
                    }
                    @case ('publisher') { 
                      <div class="bk-publisher" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></div> 
                    }
                    @case ('dedication') { 
                      <div class="bk-dedication" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></div> 
                    }
                    @case ('chapter-num') { 
                      <div class="bk-chnum" 
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="store.tweaks.titleFontSize() * 0.8"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></div> 
                    }
                    @case ('chapter-title') { 
                      <h2 class="bk-chtitle" 
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="store.tweaks.titleFontSize()"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></h2> 
                    }                    @case ('h1') { 
                      <h2 class="bk-h1" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></h2> 
                    }
                    @case ('first-p') { 
                      <p class="bk-first" [class.has-dropcap]="store.tweaks.dropCap()">
                        <span contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="(b.drop && !b.text?.startsWith(b.drop) ? b.drop : '') + (b.text || '')" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" style="outline: none;"></span>
                      </p> 
                    }
                    @case ('p') { 
                      <p class="bk-p" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></p> 
                    }
                    @case ('blockquote') { 
                      <blockquote class="bk-quote" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.tweaks.spellcheckLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></blockquote> 
                    }
                    @case ('scene-break') { <div class="bk-break">✦  ✦  ✦</div> }
                    @case ('page-break') { <div class="bk-page-break"><span>Salto de página</span></div> }
                  }
                </div>
              }
              <div class="ed__end">— fin del fragmento —</div>
            </article>

            <div class="ed__marg ed__marg--r">
              <div class="mg mg--right">
                <div class="mg__kind">Marginalia</div>
                @if (store.activeNotes().length === 0) {
                  <div class="mg__hint">Añade notas a los párrafos usando el icono de burbuja que aparece al pasar el ratón.</div>
                } @else {
                  @for (n of store.activeNotes(); track n.id) {
                    <div class="note" [class]="'note--' + n.role" [class.note--resolved]="n.status === 'resolved'" [class.note--na]="n.status === 'not-applicable'">
                      <div class="note__head">
                        <span class="note__role">{{ n.role === 'author' ? 'Autor' : n.role === 'editor' ? 'Editor' : n.role === 'corrector' ? 'Corrector' : 'Publicador' }}</span>
                        <div class="note__actions">
                          <button class="note__status-btn" (click)="toggleStatus(n)" [title]="statusTitle(n.status)">
                            {{ statusIcon(n.status) }}
                          </button>
                          <button class="note__del" (click)="store.deleteNote(n.id)" title="Eliminar nota">×</button>
                        </div>
                      </div>
                      <div class="note__b">{{ n.content }}</div>
                      <div class="note__by">— {{ n.authorName }} · {{ n.date }}</div>

                      @if (n.replies.length > 0) {
                        <div class="note__replies">
                          @for (r of n.replies; track r.id) {
                            <div class="reply">
                              <div class="reply__b">{{ r.content }}</div>
                              <div class="reply__by">{{ r.authorName }} ({{ r.role }}) · {{ r.date }}</div>
                            </div>
                          }
                        </div>
                      }

                      <div class="note__reply-box">
                        @if (replyTargetId() === n.id) {
                          <textarea [(ngModel)]="replyContent" placeholder="Escribe tu respuesta..." rows="2"></textarea>
                          <div class="note__reply-actions">
                            <button class="btn btn--xs" (click)="replyTargetId.set('')">Cancelar</button>
                            <button class="btn btn--xs btn--primary" (click)="saveReply(n.id)">Responder</button>
                          </div>
                        } @else {
                          <button class="note__reply-btn" (click)="startReply(n.id)">Responder...</button>
                        }
                      </div>
                    </div>
                  }
                }
              </div>
            </div>
          </div>
        </div>

        <div class="ed__statbar">
          <span style="color: var(--terra); font-weight: 500">{{ statusLabel() }}</span>
          <span class="ed__dot2"></span>
          <span>Tiempo de lectura: <b>{{ chapter.readMin }} min</b></span>
          <span class="ed__dot2"></span>
          <span>{{ (chapter.words || 0).toLocaleString('es-ES') }} palabras en este elemento</span>
          <span class="ed__dot2"></span>
          <span>autoguardado activo</span>
          <span style="flex: 1"></span>
          <span>Maquetación · Libria 2.4</span>
        </div>
      </main>
    }

    @if (showNoteDialog()) {
      <div class="note-dialog-backdrop" (click)="closeNoteDialog()">
        <div class="note-dialog" (click)="$event.stopPropagation()">
          <h3>Nueva Marginalia</h3>
          <p>Añadiendo nota al párrafo {{ (noteTargetIndex() || 0) + 1 }}</p>
          
          <div class="form-group">
            <label>Tu nombre</label>
            <input type="text" [(ngModel)]="noteAuthor" placeholder="Ej: Marina Cifuentes">
          </div>

          <div class="form-group">
            <label>Rol</label>
            <select [(ngModel)]="noteRole">
              <option value="author">Autor</option>
              <option value="editor">Editor</option>
              <option value="corrector">Corrector</option>
              <option value="publisher">Publicador</option>
            </select>
          </div>

          <div class="form-group">
            <label>Contenido</label>
            <textarea [(ngModel)]="noteContent" rows="4" placeholder="Escribe aquí tu anotación..."></textarea>
          </div>

          <div class="note-dialog__actions">
            <button class="btn" (click)="closeNoteDialog()">Cancelar</button>
            <button class="btn btn--primary" (click)="saveNote()">Guardar nota</button>
          </div>
        </div>
      </div>
    }
  `
})
export class EditorComponent {
  readonly store = inject(BookStore);

  readonly status = computed(() => {
    const chapter = this.store.activeChapter();
    return chapter?.status || (chapter?.kind === 'chapter' ? 'ok' : 'front');
  });

  readonly statusLabel = computed(() => {
    const s = this.status();
    return { 
      ok: "Revisado", 
      draft: "Borrador", 
      outline: "Esbozo", 
      front: "Preliminar", 
      back: "Posliminar" 
    }[s!] || "";
  });

  hasNote(blockIndex: number): boolean {
    return this.store.activeNotes().some(n => n.blockIndex === blockIndex);
  }

  // --- Note Dialog ---
  showNoteDialog = signal(false);
  noteTargetChapterId = signal('');
  noteTargetIndex = signal<number | null>(null);
  noteAuthor = '';
  noteRole: NoteRole = 'author';
  noteContent = '';

  addNoteToBlock(chapterId: string, blockIndex: number) {
    this.noteTargetChapterId.set(chapterId);
    this.noteTargetIndex.set(blockIndex);
    this.showNoteDialog.set(true);
  }

  closeNoteDialog() {
    this.showNoteDialog.set(false);
    this.noteContent = '';
  }

  saveNote() {
    if (!this.noteContent.trim() || !this.noteAuthor.trim()) return;
    this.store.addNote(
      this.noteTargetChapterId(),
      this.noteTargetIndex()!,
      this.noteRole,
      this.noteAuthor,
      this.noteContent
    );
    this.closeNoteDialog();
  }

  // --- Note Status & Replies ---
  replyTargetId = signal('');
  replyContent = '';

  toggleStatus(note: any) {
    const sequence: NoteStatus[] = ['unresolved', 'resolved', 'not-applicable'];
    const currentIndex = sequence.indexOf(note.status);
    const nextStatus = sequence[(currentIndex + 1) % sequence.length];
    this.store.updateNoteStatus(note.id, nextStatus);
  }

  statusIcon(status: NoteStatus): string {
    return { 
      'unresolved': '○', 
      'resolved': '●', 
      'not-applicable': '×' 
    }[status];
  }

  statusTitle(status: NoteStatus): string {
    return { 
      'unresolved': 'Pendiente', 
      'resolved': 'Resuelto', 
      'not-applicable': 'No aplica' 
    }[status];
  }

  startReply(noteId: string) {
    this.replyTargetId.set(noteId);
    this.replyContent = '';
  }

  saveReply(noteId: string) {
    if (!this.replyContent.trim()) return;
    // We'll reuse the noteAuthor and noteRole from the last session or set defaults
    const author = this.noteAuthor || 'Usuario';
    const role = this.noteRole || 'author';
    this.store.addReply(noteId, role, author, this.replyContent);
    this.replyTargetId.set('');
    this.replyContent = '';
  }


  lastFocusedIndex = -1;
  /** Prevents onInput from firing during programmatic splits/merges */
  private _suppressInput = false;
  private _inputTimeout: any;

  onFocus(index: number) {
    this.lastFocusedIndex = index;
  }

  onInput(chapterId: string, blockIndex: number, event: Event) {
    if (this._suppressInput) return;
    const element = event.target as HTMLElement;
    const text = element.innerText.replace(/\n$/, '');
    const html = element.innerHTML;
    
    if (!this._inputTimeout) {
      this.store.saveSnapshot();
    }
    clearTimeout(this._inputTimeout);
    this._inputTimeout = setTimeout(() => {
      this._inputTimeout = null;
    }, 1000);

    this.store.updateChapterBlock(chapterId, blockIndex, text, html);
  }

  // ─── Key handler ────────────────────────────────────────────────────────────

  onKeyDown(chapterId: string, blockIndex: number, event: KeyboardEvent) {
    if (this._suppressInput) {
      event.preventDefault();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) {
        this.store.redo();
      } else {
        this.store.undo();
      }
      this._focusAfterHistory();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.store.redo();
      this._focusAfterHistory();
      return;
    }

    const el = event.target as HTMLElement;

    switch (event.key) {

      // ── Enter: split block ────────────────────────────────────────────────
      case 'Enter': {
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
        const textAfter  = currentText.substring(cursor);

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
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;
        if (this._getCaretOffset(el) !== 0 || blockIndex <= 0) return;

        event.preventDefault();
        this.store.saveSnapshot();
        const chapter = this.store.chapters().find(c => c.id === chapterId);
        const prevData = chapter?.body[blockIndex - 1];

        if (prevData?.type === 'scene-break') {
          // Delete the scene-break instead of merging into it
          this._suppressInput = true;
          this.store.deleteBlock(chapterId, blockIndex - 1);
          setTimeout(() => {
            this._suppressInput = false;
            // After deletion, current block is now at blockIndex - 1
            const cur = this._getEditableBlock(blockIndex - 1);
            if (cur) { cur.focus(); this._placeCursorAt(cur, 0); }
          }, 16);
        } else {
          const prevText    = prevData?.text ?? '';
          const curText     = chapter?.body[blockIndex]?.text ?? '';
          const mergedText  = prevText + curText;

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
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const textLen = el.textContent?.length ?? 0;
        if (this._getCaretOffset(el) < textLen) return; // not at end

        const chapter  = this.store.chapters().find(c => c.id === chapterId);
        const nextData = chapter?.body[blockIndex + 1];
        if (!nextData) return;

        event.preventDefault();
        this.store.saveSnapshot();

        if (nextData.type === 'scene-break') {
          // Delete the scene-break
          this._suppressInput = true;
          this.store.deleteBlock(chapterId, blockIndex + 1);
          setTimeout(() => {
            this._suppressInput = false;
            const cur = this._getEditableBlock(blockIndex);
            if (cur) { cur.focus(); this._placeCursorAt(cur, textLen); }
          }, 16);
        } else {
          const curText    = el.innerText.replace(/\n$/, '');
          const nextText   = nextData.text ?? '';
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

  // ─── DOM helpers ────────────────────────────────────────────────────────────

  /**
   * Returns the contenteditable element for the block at store index `i`.
   * Uses the container position so scene-breaks don't shift the index.
   */
  private _getEditableBlock(i: number): HTMLElement | null {
    const containers = document.querySelectorAll<HTMLElement>('.ed__block-container');
    return containers[i]?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null;
  }

  /** Returns the store index of the nearest editable block before `fromIndex`. */
  private _prevEditableIndex(fromIndex: number): number {
    const body = this.store.activeChapter()?.body ?? [];
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (body[i].type !== 'scene-break') return i;
    }
    return -1;
  }

  /** Returns the store index of the nearest editable block after `fromIndex`. */
  private _nextEditableIndex(fromIndex: number): number {
    const body = this.store.activeChapter()?.body ?? [];
    for (let i = fromIndex + 1; i < body.length; i++) {
      if (body[i].type !== 'scene-break') return i;
    }
    return -1;
  }

  /** Places the caret at a character offset within a contenteditable element. */
  private _placeCursorAt(el: HTMLElement, offset: number): void {
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
    if (!placed) { range.selectNodeContents(el); range.collapse(false); }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Returns the caret offset (in characters) from the start of the element. */
  private _getCaretOffset(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  // ─── Other handlers ─────────────────────────────────────────────────────────

  onTypeChange(chapterId: string, blockIndex: number, event: Event) {
    this.store.saveSnapshot();
    const select = event.target as HTMLSelectElement;
    this.store.setBlockType(chapterId, blockIndex, select.value);
  }

  insertSceneBreak() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this.lastFocusedIndex >= 0
      ? this.lastFocusedIndex
      : this.store.activeChapter()!.body.length - 1;
    this.store.insertBlock(chapterId, index, 'scene-break');
    this.store.insertBlock(chapterId, index + 1, 'p', '');
  }

  insertPageBreak() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this.lastFocusedIndex >= 0
      ? this.lastFocusedIndex
      : this.store.activeChapter()!.body.length - 1;
    this.store.insertBlock(chapterId, index, 'page-break');
    this.store.insertBlock(chapterId, index + 1, 'p', '');
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

  private _focusAfterHistory() {
    setTimeout(() => {
      let idx = this.lastFocusedIndex;
      if (idx < 0) idx = 0;
      const el = this._getEditableBlock(idx) || this._getEditableBlock(0);
      if (el) {
        el.focus();
        this._placeCursorAt(el, el.textContent?.length || 0);
      }
    }, 50);
  }
}

