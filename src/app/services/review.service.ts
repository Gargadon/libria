import { Injectable, computed, inject, signal } from '@angular/core';
import { Block, Chapter, LIBRIA_SCHEMA_VERSION, NoteRole, ReviewRound } from '../models/book.models';
import { BookStore } from '../store/book.store';
import { createId } from '../utils/ids';
import { ReviewChange, changeKey, groupChanges, pendingChanges, rebaseChapter } from '../utils/review-changes';
import { ExportFileService } from './export/export-file.service';

/**
 * Control de cambios editorial.
 *
 * El estado aceptado (`review.baseline`) se guarda con el documento; las marcas se
 * derivan de compararlo con los capítulos actuales. Aceptar un cambio rebasa el estado
 * aceptado con ese cambio; rechazarlo restaura el bloque en el manuscrito.
 */
@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly store = inject(BookStore);
  private readonly files = inject(ExportFileService);

  readonly visible = signal(false);
  readonly busy = signal(false);
  readonly author = signal('');
  readonly role = signal<NoteRole>('corrector');

  readonly round = computed(() => this.store.review()?.round ?? null);
  readonly active = computed(() => !!this.round());
  readonly changes = computed(() => pendingChanges(this.store.review(), this.store.chapters()));
  readonly groups = computed(() => groupChanges(this.changes(), this.store.chapters()));
  readonly count = computed(() => this.changes().length);

  show(): void {
    if (!this.author()) this.author.set(this.store.personalConfig().userName || '');
    this.visible.set(true);
  }

  hide(): void {
    this.visible.set(false);
  }

  start(): void {
    if (!this.store.book() || this.round()) return;
    const author = this.author().trim() || this.store.personalConfig().userName || '—';
    const round: ReviewRound = {
      id: createId('rev'),
      author,
      role: this.role(),
      startedAt: new Date().toISOString(),
      baselineRevision: this.store.documentRevision(),
      schemaVersion: LIBRIA_SCHEMA_VERSION,
    };
    this.store.saveSnapshot();
    this.store.beginReview(round, structuredClone(this.store.chapters()));
  }

  /** Cierra la ronda aceptando todo lo propuesto. */
  finish(): void {
    if (!this.round()) return;
    this.acceptAll();
    this.store.endReview();
  }

  /** Cierra la ronda descartando todo lo propuesto. */
  discard(): void {
    if (!this.round()) return;
    this.rejectAll();
    this.store.endReview();
  }

  accept(change: ReviewChange): void {
    const review = this.store.review();
    if (!review?.baseline) return;
    this.store.saveSnapshot();
    const live = this.liveChapter(change.chapterId);
    const accepted = this.acceptedChapter(change.chapterId);

    if (!live) {
      // El capítulo ya no existe: aceptar la eliminación lo retira del estado aceptado.
      this.store.setReviewBaseline(review.baseline.filter((chapter) => chapter.id !== change.chapterId));
      return;
    }
    if (change.kind === 'chapter-title') {
      this.store.setReviewBaseline(review.baseline.map((chapter) =>
        chapter.id === change.chapterId ? { ...chapter, title: live.title } : chapter));
      return;
    }
    const key = changeKey(change);
    const rebased = rebaseChapter(live, accepted, (candidate) => candidate === key);
    this.store.setReviewBaseline(accepted
      ? review.baseline.map((chapter) => (chapter.id === change.chapterId ? rebased : chapter))
      : [...review.baseline, rebased]);
  }

  reject(change: ReviewChange): void {
    const review = this.store.review();
    const live = this.liveChapter(change.chapterId);
    const accepted = this.acceptedChapter(change.chapterId);
    this.store.saveSnapshot();

    if (!live) {
      if (!accepted) return;
      const position = review?.baseline?.findIndex((chapter) => chapter.id === change.chapterId) ?? -1;
      const chapters = [...this.store.chapters()];
      chapters.splice(Math.min(Math.max(position, 0), chapters.length), 0, structuredClone(accepted));
      this.store.setChapters(chapters);
      return;
    }

    switch (change.kind) {
      case 'chapter-title':
        this.store.updateChapterMeta(change.chapterId, {
          title: change.beforeTitle ?? accepted?.title ?? live.title,
        });
        return;
      case 'text':
        this.store.updateChapterBlock(change.chapterId, change.blockIndex, change.before, change.beforeHtml);
        return;
      case 'block-replace': {
        const previous = accepted?.body.find((block) => block.id === change.blockId) ?? change.acceptedBlock;
        if (previous) this.store.replaceBlock(change.chapterId, change.blockIndex, previous);
        return;
      }
      case 'block-insert':
        this.store.deleteBlock(change.chapterId, change.blockIndex);
        return;
      case 'block-delete': {
        if (!change.block) return;
        const index = this.insertionIndex(live, accepted, change.blockIndex);
        this.store.insertBlockAt(change.chapterId, index, change.block);
        return;
      }
    }
  }

  acceptAll(): void {
    if (!this.round()) return;
    this.store.saveSnapshot();
    this.store.setReviewBaseline(structuredClone(this.store.chapters()));
  }

  rejectAll(): void {
    const baseline = this.store.review()?.baseline;
    if (!baseline) return;
    this.store.saveSnapshot();
    this.store.setChapters(structuredClone(baseline));
  }

  /** Informe en Markdown con los cambios pendientes, por capítulo. */
  report(): string {
    const round = this.round();
    const groups = this.groups();
    const total = this.count();
    const title = this.store.book()?.title ?? 'Documento';
    const lines: string[] = [
      `# Registro de cambios — ${title}`,
      '',
      round
        ? `Ronda de ${round.author} (${round.role}), iniciada el ${new Date(round.startedAt).toLocaleString()}.`
        : 'Sin ronda de revisión abierta.',
      `${total} cambio${total === 1 ? '' : 's'} pendiente${total === 1 ? '' : 's'}.`,
      '',
    ];
    if (!total) lines.push('Sin cambios pendientes.');
    for (const group of groups) {
      lines.push(`## ${group.chapter.title || group.chapter.id}`, '');
      for (const change of group.changes) {
        lines.push(`- ${describe(change)}`);
      }
      lines.push('');
    }
    return lines.join('\n');
  }

  async downloadReport(): Promise<void> {
    const blob = new Blob([this.report()], { type: 'text/markdown;charset=utf-8' });
    const name = (this.store.book()?.title || 'libria').replace(/\s+/g, '_') + '-cambios.md';
    await this.files.downloadFile(blob, name);
  }

  private liveChapter(id: string): Chapter | undefined {
    return this.store.chapters().find((chapter) => chapter.id === id);
  }

  private acceptedChapter(id: string): Chapter | undefined {
    return this.store.review()?.baseline?.find((chapter) => chapter.id === id);
  }

  /** Punto de inserción de un bloque restaurado: antes del siguiente bloque que sobrevive. */
  private insertionIndex(live: Chapter, accepted: Chapter | undefined, acceptedIndex: number): number {
    if (!accepted) return Math.min(acceptedIndex, live.body.length);
    for (let index = acceptedIndex + 1; index < accepted.body.length; index++) {
      const target: Block | undefined = accepted.body[index];
      const liveIndex = target?.id ? live.body.findIndex((block) => block.id === target.id) : -1;
      if (liveIndex >= 0) return liveIndex;
    }
    return live.body.length;
  }
}

const QUOTE = (value: string, limit = 70): string => {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  const clipped = text.length > limit ? text.slice(0, limit - 1) + '…' : text;
  return `«${clipped}»`;
};

function describe(change: ReviewChange): string {
  switch (change.kind) {
    case 'block-insert':
      return `Párrafo insertado en ${change.chapterTitle}: ${QUOTE(change.after)}`;
    case 'block-delete':
      return `Párrafo eliminado en ${change.chapterTitle}: ${QUOTE(change.before)}`;
    case 'block-replace':
      return `Bloque reemplazado en ${change.chapterTitle}: ${QUOTE(change.before)} → ${QUOTE(change.after)}`;
    case 'chapter-title':
      return `Título de capítulo: ${QUOTE(change.before)} → ${QUOTE(change.after)}`;
    default:
      return `Texto en ${change.chapterTitle}: ${QUOTE(change.before)} → ${QUOTE(change.after)}`;
  }
}
