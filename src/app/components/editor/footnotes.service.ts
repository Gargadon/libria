import { inject, effect, Injectable } from '@angular/core';
import { BookStore } from '../../store/book.store';

@Injectable()
export class EditorFootnoteService {
  readonly store = inject(BookStore);

  private readonly _footnoteWatch = effect(() => {
    const chapter = this.store.activeChapter();
    if (chapter?.footnotes?.length) {
      this.syncFootnoteRefs(chapter);
    }
  });

  insertFootnote(index: number) {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const idx = index >= 0 ? index : 0;
    const block = chapter.body[idx];
    if (
      !block ||
      (block.type !== 'p' &&
        block.type !== 'first-p' &&
        block.type !== 'blockquote' &&
        block.type !== 'h1' &&
        block.type !== 'h2' &&
        block.type !== 'h3' &&
        block.type !== 'epigraph' &&
        block.type !== 'verse' &&
        block.type !== 'chapter-title')
    )
      return;
    const fnId = 'fn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const fns = chapter.footnotes || [];
    const num = fns.length + 1;
    this.store.saveSnapshot();
    this.store.addFootnote(chapter.id, idx, fnId, '');
    document.execCommand('insertHTML', false, `<sup data-fn="${fnId}">[${num}]</sup>`);
    const el = document.activeElement as HTMLElement | null;
    if (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  private syncFootnoteRefs(chapter: any): void {
    if (!chapter.footnotes?.length) return;
    const sorted = [...chapter.footnotes].sort((a: any, b: any) => {
      if (a.blockIndex !== b.blockIndex) return a.blockIndex - b.blockIndex;
      const htmlA = chapter.body[a.blockIndex]?.html || '';
      const htmlB = chapter.body[b.blockIndex]?.html || '';
      return htmlA.indexOf(`data-fn="${a.id}"`) - htmlB.indexOf(`data-fn="${b.id}"`);
    });
    let seq = 0;
    for (const fn of sorted) {
      const block = chapter.body[fn.blockIndex];
      if (!block) continue;
      const html = block.html || '';
      if (html.includes(`data-fn="${fn.id}"`)) {
        seq++;
        continue;
      }
      seq++;
      const ref = `<sup data-fn="${fn.id}" class="fn-ref">[${seq}]</sup>`;
      const newHtml = html ? html + ref : ref;
      this.store.updateChapterBlock(chapter.id, fn.blockIndex, block.text || '', newHtml);
    }
  }

  onFootnoteInput(chapterId: string, fnId: string, event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    this.store.updateFootnote(chapterId, fnId, textarea.value);
  }

  onDeleteFootnote(chapterId: string, fnId: string) {
    this.store.saveSnapshot();
    const chapter = this.store.activeChapter();
    if (chapter) {
      for (const block of chapter.body) {
        if (block.html && block.html.includes(`data-fn="${fnId}"`)) {
          const cleaned = block.html.replace(
            new RegExp(`<sup[^>]*data-fn="${fnId}"[^>]*>\\[\\d+\\]<\\/sup>`, 'g'),
            '',
          );
          const idx = chapter.body.indexOf(block);
          this.store.updateChapterBlock(chapterId, idx, block.text || '', cleaned);
        }
      }
    }
    this.store.deleteFootnote(chapterId, fnId);
  }
}
