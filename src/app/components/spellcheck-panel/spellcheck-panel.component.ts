import { Component, computed, effect, inject, output, signal, HostListener, ElementRef, afterNextRender, DestroyRef } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';
import { SpellCheckService } from '../../services/spell-check.service';
import type NSpell from 'nspell';
import { sanitizeRichHtml } from '../../utils/block-html';

/** Replace in text nodes so emphasis, links, and other markup survive correction. */
export function correctSpelling(html: string, word: string, replacement: string): string {
  const root = document.createElement('div');
  root.innerHTML = sanitizeRichHtml(html);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: { node: Node; start: number; end: number }[] = [];
  let text = '';
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const previous = nodes[nodes.length - 1]?.node;
    if (previous) {
      const boundary = document.createRange();
      boundary.setStartAfter(previous);
      boundary.setEndBefore(node);
      if (previous.parentElement?.closest('p,li,td,th,blockquote') !== node.parentElement?.closest('p,li,td,th,blockquote') ||
          boundary.cloneContents().querySelector('br')) text += ' ';
    }
    const start = text.length;
    text += node.textContent || '';
    nodes.push({ node, start, end: text.length });
  }
  const matches = Array.from(text.matchAll(/\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*/gu))
    .filter(match => match[0] === word).reverse();
  for (const match of matches) {
    const start = match.index;
    const end = start + word.length;
    let inserted = false;
    for (const entry of nodes) {
      if (entry.end <= start || entry.start >= end) continue;
      const value = entry.node.textContent || '';
      entry.node.textContent = value.slice(0, Math.max(0, start - entry.start)) +
        (inserted ? '' : replacement) + value.slice(Math.min(value.length, end - entry.start));
      inserted = true;
    }
  }
  return root.innerHTML;
}

@Component({
  selector: 'app-spellcheck-panel',
  imports: [TranslateModule],
  template: `
    <div class="spell-overlay">
      <section role="dialog" aria-modal="true" aria-labelledby="spell-title" tabindex="-1">
        <header><h2 id="spell-title">{{ 'spellcheck.title' | translate }}</h2>
          <button (click)="close.emit()" aria-label="Cerrar / Close">×</button></header>
        <p>{{ store.activeChapter()?.title }}</p>
        @if (loading()) { <p role="status">{{ 'spellcheck.loading' | translate }}…</p> }
        @else if (error()) { <p role="alert">{{ 'spellcheck.error' | translate }}</p><button (click)="load()">↻</button> }
        @else if (current(); as item) {
          <p class="context">{{ item.context }}</p>
          <strong>{{ item.word }}</strong>
          <div class="suggestions">
            @for (suggestion of suggestions(); track suggestion) {
              <button (click)="replace(suggestion)">{{ suggestion }}</button>
            } @empty { <p>{{ 'spellcheck.noSuggestions' | translate }}</p> }
          </div>
          <button (click)="ignore()">{{ 'spellcheck.ignoreAll' | translate }}</button>
          <button (click)="addWord()" [disabled]="addingWord()">{{ 'spellcheck.addToDictionary' | translate }}</button>
        } @else { <p role="status">{{ 'spellcheck.noErrors' | translate }}</p> }
        @if (dictionaryError()) { <p role="alert">{{ 'spellcheck.dictionaryError' | translate }}</p> }
      </section>
    </div>`,
  styles: `
    .spell-overlay { position: fixed; inset: 0; z-index: 2000; background: #0006; display: grid; place-items: center; }
    section { background: var(--paper); color: var(--ink); padding: 24px; border-radius: 8px; width: min(480px, 90vw); max-height: 80vh; overflow: auto; }
    header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    h2 { margin: 0; font-size: 20px; }
    button { cursor: pointer; padding: 6px 12px; }
    .suggestions { display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0; }
    .context { max-height: 140px; overflow: auto; line-height: 1.5; }
  `,
})
export class SpellcheckPanelComponent {
  readonly store = inject(BookStore);
  private readonly spelling = inject(SpellCheckService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly close = output<void>();
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly addingWord = signal(false);
  readonly dictionaryError = signal(false);
  private readonly engine = signal<NSpell | null>(null);
  private readonly ignored = signal(new Set<string>());
  private request = 0;
  readonly current = computed(() => {
    this.spelling.revision();
    const engine = this.engine();
    const chapter = this.store.activeChapter();
    if (!engine || !chapter) return null;
    for (const [blockIndex, block] of chapter.body.entries()) {
      if (block.type === 'code') continue;
      for (const match of (block.text || '').matchAll(/\p{L}[\p{L}\p{M}]*(?:['’]\p{L}[\p{L}\p{M}]*)*/gu)) {
        const word = match[0];
        if (!this.ignored().has(word) && !engine.correct(word)) {
          return { word, blockIndex, chapterId: chapter.id, context: block.text };
        }
      }
    }
    return null;
  });
  readonly suggestions = computed(() => {
    const item = this.current();
    return item ? this.engine()!.suggest(item.word).slice(0, 8) : [];
  });

  constructor() {
    const previousFocus = document.activeElement;
    inject(DestroyRef).onDestroy(() => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    });
    effect(() => { this.store.domLang(); this.spelling.revision(); void this.load(); });
    afterNextRender(() => this.element.nativeElement.querySelector<HTMLElement>('section')?.focus());
  }

  @HostListener('keydown.escape', ['$event'])
  escape(event: Event) { event.stopPropagation(); this.close.emit(); }

  @HostListener('keydown.tab', ['$event'])
  trapFocus(event: Event) {
    const shiftKey = (event as KeyboardEvent).shiftKey;
    const buttons = Array.from(this.element.nativeElement.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || (!shiftKey && index === buttons.length - 1) || (shiftKey && index === 0)) {
      event.preventDefault();
      buttons[shiftKey ? buttons.length - 1 : 0]?.focus();
    }
  }

  async load() {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(false);
    this.engine.set(null);
    try {
      const engine = await this.spelling.loadDictionary(this.store.domLang());
      if (request === this.request) this.engine.set(engine);
    } catch { if (request === this.request) this.error.set(true); }
    finally { if (request === this.request) this.loading.set(false); }
  }

  ignore() {
    const item = this.current();
    if (item) this.ignored.update(words => new Set([...words, item.word]));
  }

  async addWord() {
    const item = this.current();
    if (!item || this.addingWord()) return;
    this.addingWord.set(true);
    this.dictionaryError.set(false);
    try {
      if (!await this.spelling.addWord(item.word)) throw new Error('Dictionary write failed');
    } catch {
      this.dictionaryError.set(true);
    } finally {
      this.addingWord.set(false);
    }
  }

  replace(replacement: string) {
    const item = this.current();
    if (!item) return;
    const block = this.store.activeChapter()!.body[item.blockIndex];
    const root = document.createElement('div');
    root.textContent = block.text || '';
    const html = correctSpelling(block.html || root.innerHTML, item.word, replacement);
    root.innerHTML = html;
    root.querySelectorAll('p,li,tr,td,th,br').forEach(el => el.append(document.createTextNode(' ')));
    this.store.saveSnapshot();
    this.store.updateChapterBlock(item.chapterId, item.blockIndex,
      root.textContent?.replace(/\s+/g, ' ').trim() || '', html);
  }
}
