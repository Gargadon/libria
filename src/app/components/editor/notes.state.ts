import { inject, computed, signal, Injectable } from '@angular/core';
import { BookStore } from '../../store/book.store';

import { NoteRole, NoteStatus } from '../../models/book.models';

@Injectable()
export class EditorNotesState {
  readonly store = inject(BookStore);

  readonly blockNotes = computed(() => {
    const notes = this.store.activeNotes();
    const map = new Map<number, number>();
    for (const n of notes) {
      map.set(n.blockIndex, (map.get(n.blockIndex) || 0) + 1);
    }
    return map;
  });

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
      this.noteContent,
    );
    this.closeNoteDialog();
  }

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
      unresolved: '○',
      resolved: '●',
      'not-applicable': '×',
    }[status];
  }

  statusTitle(status: NoteStatus): string {
    return {
      unresolved: 'Pendiente',
      resolved: 'Resuelto',
      'not-applicable': 'No aplica',
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
}
