import { Component, inject, signal, computed, input, output, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
import { NoteRole, NoteStatus } from '../../models/book.models';

@Component({
  selector: 'app-notes-chat-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="ncm-backdrop" (click)="close.emit()">
      <div class="ncm" (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="ncm__head">
          <div class="ncm__head-left">
            <span class="material-symbols-outlined ncm__head-icon">chat_bubble</span>
            <div>
              <div class="ncm__title">{{ 'notes.title' | translate }}</div>
              <div class="ncm__sub">{{ 'notes.paragraph' | translate:{ index: blockIndex() + 1 } }}</div>
            </div>
          </div>
          <button class="ncm__x" (click)="close.emit()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Thread -->
        <div class="ncm__thread" #thread>
          @if (blockNotes().length === 0) {
            <div class="ncm__empty">
              <span class="material-symbols-outlined ncm__empty-icon">chat_bubble_outline</span>
              <p>{{ 'notes.empty' | translate }}</p>
            </div>
          }

          @for (note of blockNotes(); track note.id) {
            <div class="ncm__note" [class]="'ncm__note--' + note.role"
                 [class.ncm__note--resolved]="note.status === 'resolved'"
                 [class.ncm__note--na]="note.status === 'not-applicable'">

              <!-- Note header -->
              <div class="ncm__note-head">
                <span class="ncm__badge" [class]="'ncm__badge--' + note.role">
                  {{ roleLabel(note.role) }}
                </span>
                <span class="ncm__author">{{ note.authorName }}</span>
                <span class="ncm__date">· {{ note.date }}</span>
                <div class="ncm__note-actions">
                  <button class="ncm__status-btn" (click)="toggleStatus(note)"
                          [title]="statusTitle(note.status)">
                    <span class="material-symbols-outlined">{{ statusIcon(note.status) }}</span>
                  </button>
                  <button class="ncm__del-btn" (click)="store.deleteNote(note.id)" [attr.title]="'notes.delete' | translate">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>

              <!-- Note body -->
              <div class="ncm__bubble">{{ note.content }}</div>

              <!-- Replies -->
              @if (note.replies.length > 0) {
                <div class="ncm__replies">
                  @for (r of note.replies; track r.id) {
                    <div class="ncm__reply">
                      <div class="ncm__reply-head">
                        <span class="ncm__badge ncm__badge--sm" [class]="'ncm__badge--' + r.role">
                          {{ roleLabel(r.role) }}
                        </span>
                        <span class="ncm__author">{{ r.authorName }}</span>
                        <span class="ncm__date">· {{ r.date }}</span>
                      </div>
                      <div class="ncm__reply-bubble">{{ r.content }}</div>
                    </div>
                  }
                </div>
              }

              <!-- Reply input -->
              @if (replyingTo() === note.id) {
                <div class="ncm__reply-form">
                  <textarea class="ncm__reply-input" [(ngModel)]="replyContent"
                            [attr.placeholder]="'notes.replyPlaceholder' | translate" rows="2"
                            (keydown.enter)="$any($event).shiftKey ? null : saveReply(note.id, $any($event))">
                  </textarea>
                  <div class="ncm__reply-row">
                    <button class="ncm__cancel-btn" (click)="replyingTo.set('')">{{ 'notes.cancel' | translate }}</button>
                    <button class="ncm__send-btn ncm__send-btn--sm"
                            [disabled]="!replyContent.trim()"
                            (click)="saveReply(note.id)">
                      <span class="material-symbols-outlined">send</span>
                    </button>
                  </div>
                </div>
              } @else {
                <button class="ncm__reply-btn" (click)="replyingTo.set(note.id)">
                  <span class="material-symbols-outlined">reply</span> {{ 'notes.reply' | translate }}
                </button>
              }

            </div>
          }
        </div>

        <!-- New note composer -->
        <div class="ncm__composer">
          <div class="ncm__composer-meta">
            <input class="ncm__input-name" [ngModel]="authorName()" (ngModelChange)="authorName.set($event)"
                   [attr.placeholder]="'notes.namePlaceholder' | translate" autocomplete="off">
            <select class="ncm__select-role" [ngModel]="authorRole()" (ngModelChange)="authorRole.set($event)">
              <option value="author">{{ 'notes.roleAuthor' | translate }}</option>
              <option value="editor">{{ 'notes.roleEditor' | translate }}</option>
              <option value="corrector">{{ 'notes.roleCorrector' | translate }}</option>
              <option value="publisher">{{ 'notes.rolePublisher' | translate }}</option>
            </select>
          </div>
          <div class="ncm__composer-body">
            <textarea class="ncm__textarea" [ngModel]="noteContent()" (ngModelChange)="noteContent.set($event)"
                      [attr.placeholder]="'notes.notePlaceholder' | translate" rows="3"
                      (keydown.enter)="$any($event).shiftKey ? null : sendNote($any($event))">
            </textarea>
            <button class="ncm__send-btn" [disabled]="!canSend()" (click)="sendNote()">
              <span class="material-symbols-outlined">send</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .ncm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(26, 22, 18, .45);
      backdrop-filter: blur(4px);
      display: grid;
      place-items: center;
      z-index: 3000;
      animation: ncmFade .15s ease;
    }

    @keyframes ncmFade {
      from { opacity: 0 }
      to   { opacity: 1 }
    }

    .ncm {
      width: 440px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 16px;
      box-shadow: 0 32px 64px -16px rgba(26,22,18,.4), 0 0 0 1px rgba(26,22,18,.08);
      animation: ncmUp .2s cubic-bezier(.22,1,.36,1);
      overflow: hidden;
    }

    @keyframes ncmUp {
      from { transform: translateY(10px); opacity: 0 }
      to   { transform: translateY(0);    opacity: 1 }
    }

    /* Head */
    .ncm__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 18px 14px;
      border-bottom: 1px solid var(--rule-soft);
      flex-shrink: 0;
    }

    .ncm__head-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ncm__head-icon {
      font-size: 20px;
      color: var(--terra);
    }

    .ncm__title {
      font-family: var(--display);
      font-size: 15px;
      color: var(--ink);
      line-height: 1.1;
    }

    .ncm__sub {
      font-size: 11px;
      color: var(--ink-mute);
      letter-spacing: .04em;
    }

    .ncm__x {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      color: var(--ink-mute);
      background: none;
      border: none;
      cursor: pointer;
    }

    .ncm__x:hover {
      background: var(--paper-2);
      color: var(--ink);
    }

    .ncm__x .material-symbols-outlined { font-size: 18px; }

    /* Thread */
    .ncm__thread {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scrollbar-width: thin;
      scrollbar-color: var(--rule) transparent;
    }

    .ncm__thread::-webkit-scrollbar { width: 4px; }
    .ncm__thread::-webkit-scrollbar-thumb { background: var(--rule); border-radius: 4px; }

    /* Empty state */
    .ncm__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 32px 0;
      color: var(--ink-mute);
      text-align: center;
    }

    .ncm__empty-icon {
      font-size: 32px;
      opacity: .4;
    }

    .ncm__empty p {
      font-size: 13px;
      line-height: 1.5;
      margin: 0;
    }

    /* Note */
    .ncm__note {
      border-radius: 10px;
      padding: 12px;
      border-left: 3px solid var(--terra);
      background: rgba(168,98,61,.06);
      transition: opacity .2s;
    }

    .ncm__note--editor   { border-left-color: var(--sage);     background: rgba(90,107,74,.06); }
    .ncm__note--corrector { border-left-color: var(--gold);    background: rgba(176,136,56,.06); }
    .ncm__note--publisher { border-left-color: var(--ink-soft); background: rgba(90,81,71,.06); }

    .ncm__note--resolved { opacity: .5; filter: grayscale(.5); }
    .ncm__note--na       { opacity: .5; font-style: italic; }

    .ncm__note-head {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
    }

    .ncm__badge {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: .1em;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      background: var(--terra);
      color: #fff;
    }

    .ncm__badge--sm { font-size: 8px; padding: 1px 5px; }
    .ncm__badge--editor    { background: var(--sage); }
    .ncm__badge--corrector { background: var(--gold); }
    .ncm__badge--publisher { background: var(--ink-soft); }

    .ncm__author {
      font-size: 12px;
      font-weight: 600;
      color: var(--ink);
    }

    .ncm__date {
      font-size: 11px;
      color: var(--ink-mute);
    }

    .ncm__note-actions {
      margin-left: auto;
      display: flex;
      gap: 2px;
    }

    .ncm__status-btn,
    .ncm__del-btn {
      width: 24px;
      height: 24px;
      border-radius: 5px;
      display: grid;
      place-items: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--ink-mute);
    }

    .ncm__status-btn:hover { background: var(--paper-2); color: var(--ink); }
    .ncm__del-btn:hover    { background: rgba(168,98,61,.1); color: var(--terra); }

    .ncm__status-btn .material-symbols-outlined,
    .ncm__del-btn .material-symbols-outlined { font-size: 15px; }

    .ncm__bubble {
      font-size: 13px;
      line-height: 1.55;
      color: var(--ink-2);
      font-family: var(--ui);
    }

    /* Replies */
    .ncm__replies {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid rgba(26,22,18,.06);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .ncm__reply {
      padding-left: 12px;
      border-left: 2px solid var(--rule-soft);
    }

    .ncm__reply-head {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-bottom: 4px;
    }

    .ncm__reply-bubble {
      font-size: 12px;
      line-height: 1.45;
      color: var(--ink-soft);
    }

    .ncm__reply-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 11px;
      color: var(--ink-mute);
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--ui);
      padding: 2px 0;
    }

    .ncm__reply-btn .material-symbols-outlined { font-size: 14px; }
    .ncm__reply-btn:hover { color: var(--terra); }

    .ncm__reply-form {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .ncm__reply-input {
      width: 100%;
      font-size: 12px;
      padding: 7px 10px;
      border: 1px solid var(--rule-soft);
      border-radius: 8px;
      background: var(--paper);
      font-family: var(--ui);
      resize: none;
      color: var(--ink);
    }

    .ncm__reply-input:focus {
      outline: none;
      border-color: var(--terra);
    }

    .ncm__reply-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 6px;
    }

    .ncm__cancel-btn {
      font-size: 11px;
      color: var(--ink-mute);
      background: none;
      border: none;
      cursor: pointer;
      font-family: var(--ui);
    }

    .ncm__cancel-btn:hover { color: var(--ink); }

    /* Composer */
    .ncm__composer {
      border-top: 1px solid var(--rule-soft);
      padding: 14px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
      background: var(--paper-2);
    }

    .ncm__composer-meta {
      display: flex;
      gap: 8px;
    }

    .ncm__input-name {
      flex: 1;
      font-size: 12px;
      padding: 6px 10px;
      border: 1px solid var(--rule-soft);
      border-radius: 7px;
      background: var(--paper);
      font-family: var(--ui);
      color: var(--ink);
    }

    .ncm__input-name:focus {
      outline: none;
      border-color: var(--terra);
    }

    .ncm__select-role {
      font-size: 12px;
      padding: 6px 8px;
      border: 1px solid var(--rule-soft);
      border-radius: 7px;
      background: var(--paper);
      font-family: var(--ui);
      color: var(--ink);
      cursor: pointer;
    }

    .ncm__select-role:focus {
      outline: none;
      border-color: var(--terra);
    }

    .ncm__composer-body {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }

    .ncm__textarea {
      flex: 1;
      font-size: 13px;
      padding: 9px 12px;
      border: 1px solid var(--rule-soft);
      border-radius: 8px;
      background: var(--paper);
      font-family: var(--ui);
      resize: none;
      color: var(--ink);
      line-height: 1.5;
    }

    .ncm__textarea:focus {
      outline: none;
      border-color: var(--terra);
      box-shadow: 0 0 0 3px rgba(168,98,61,.1);
    }

    .ncm__send-btn {
      width: 38px;
      height: 38px;
      border-radius: 9px;
      background: var(--terra);
      color: #fff;
      border: none;
      cursor: pointer;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      transition: background .15s;
    }

    .ncm__send-btn:hover:not(:disabled) { background: var(--terra-2); }
    .ncm__send-btn:disabled { opacity: .4; cursor: default; }
    .ncm__send-btn .material-symbols-outlined { font-size: 18px; }

    .ncm__send-btn--sm {
      width: 30px;
      height: 30px;
      border-radius: 7px;
    }

    .ncm__send-btn--sm .material-symbols-outlined { font-size: 15px; }
  `]
})
export class NotesChatModalComponent implements OnInit {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);
  readonly translate = inject(TranslateService);

  blockIndex = input.required<number>();
  chapterId  = input.required<string>();
  close      = output<void>();

  authorName = signal('');
  authorRole = signal<NoteRole>('author');
  noteContent = signal('');

  replyingTo  = signal('');
  replyContent = '';

  blockNotes = computed(() =>
    this.store.activeNotes().filter(n => n.blockIndex === this.blockIndex())
  );

  canSend = computed(() =>
    this.authorName().trim().length > 0 && this.noteContent().trim().length > 0
  );

  ngOnInit() {
    const saved = sessionStorage.getItem('libria_note_author');
    const savedRole = sessionStorage.getItem('libria_note_role');
    if (saved) this.authorName.set(saved);
    if (savedRole) this.authorRole.set(savedRole as NoteRole);
  }

  sendNote(event?: KeyboardEvent) {
    if (event) event.preventDefault();
    if (!this.canSend()) return;
    sessionStorage.setItem('libria_note_author', this.authorName());
    sessionStorage.setItem('libria_note_role', this.authorRole());
    this.store.addNote(this.chapterId(), this.blockIndex(), this.authorRole(), this.authorName(), this.noteContent());
    this.noteContent.set('');
    this.fileService.saveLibriaFile();
  }

  saveReply(noteId: string, event?: KeyboardEvent) {
    if (event) event.preventDefault();
    if (!this.replyContent.trim()) return;
    this.store.addReply(noteId, this.authorRole(), this.authorName() || 'Usuario', this.replyContent);
    this.replyContent = '';
    this.replyingTo.set('');
    this.fileService.saveLibriaFile();
  }

  toggleStatus(note: any) {
    const seq: NoteStatus[] = ['unresolved', 'resolved', 'not-applicable'];
    const next = seq[(seq.indexOf(note.status) + 1) % seq.length];
    this.store.updateNoteStatus(note.id, next);
  }

  statusIcon(status: NoteStatus): string {
    return { unresolved: 'radio_button_unchecked', resolved: 'check_circle', 'not-applicable': 'cancel' }[status];
  }

  statusTitle(status: NoteStatus): string {
    const map: Record<string, string> = {
      unresolved: 'notes.statusUnresolved',
      resolved: 'notes.statusResolved',
      'not-applicable': 'notes.statusNotApplicable'
    };
    return this.translate.instant(map[status] || '');
  }

  roleLabel(role: NoteRole): string {
    const map: Record<string, string> = {
      author: 'notes.roleAuthor',
      editor: 'notes.roleEditor',
      corrector: 'notes.roleCorrector',
      publisher: 'notes.rolePublisher'
    };
    return this.translate.instant(map[role] || '');
  }
}
