import { Component, ElementRef, afterNextRender, computed, effect, inject, output, signal, DestroyRef } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import type NSpell from 'nspell';
import { BookStore } from '../../store/book.store';
import { SpellCheckService } from '../../services/spell-check.service';
import { SpellingRange, spellingAtPoint, spellingRanges } from './spelling-ranges';

export interface SpellingCorrection extends SpellingRange { replacement: string }

@Component({
  selector: 'app-editor-spelling',
  imports: [TranslateModule],
  template: `
    @if (menu(); as menu) {
      <div class="spelling-menu" role="menu" [attr.aria-label]="'spellcheck.title' | translate"
        [style.left.px]="menu.x" [style.top.px]="menu.y"
        (mousedown)="$event.preventDefault(); $event.stopPropagation()" (click)="$event.stopPropagation()"
        (keydown.escape)="dismiss(); $event.stopPropagation()">
        <strong>{{ menu.item.word }}</strong>
        @for (suggestion of suggestions(); track suggestion) {
          <button role="menuitem" (click)="replace(suggestion)">{{ suggestion }}</button>
        } @empty { <span>{{ 'spellcheck.noSuggestions' | translate }}</span> }
        <button role="menuitem" (click)="ignore()">{{ 'spellcheck.ignoreAll' | translate }}</button>
        <button role="menuitem" (click)="addWord()">{{ 'spellcheck.addToDictionary' | translate }}</button>
      </div>
    }
    @if (error()) { <span class="spelling-error" role="status">{{ 'spellcheck.error' | translate }}</span> }
  `,
  styles: `
    .spelling-menu { position: fixed; z-index: 2200; width: 240px; max-height: min(400px, 90vh); overflow: auto;
      display: flex; flex-direction: column; padding: 6px; border: 1px solid var(--rule); border-radius: 6px;
      background: var(--paper); color: var(--ink); box-shadow: 0 6px 24px #0003; }
    strong, span { padding: 6px 10px; }
    button { text-align: left; padding: 8px 10px; cursor: pointer; background: transparent; border: 0; color: inherit; }
    button:hover, button:focus-visible { background: var(--paper-2); }
    .spelling-error { display: block; font-size: 12px; color: var(--ink-mute); }
  `,
})
export class EditorSpellingComponent {
  private readonly store = inject(BookStore);
  private readonly spelling = inject(SpellCheckService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  private readonly engine = signal<NSpell | null>(null);
  private readonly ignored = signal(new Set<string>());
  private items: SpellingRange[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private request = 0;
  private destroyed = false;
  readonly error = signal(false);
  readonly correction = output<SpellingCorrection>();
  readonly menu = signal<{ item: SpellingRange; x: number; y: number } | null>(null);
  readonly suggestions = computed(() => {
    const item = this.menu()?.item;
    return item ? this.engine()?.suggest(item.word).slice(0, 8) || [] : [];
  });

  constructor() {
    effect(() => {
      const language = this.store.domLang();
      const enabled = this.store.tweaks.spellcheck();
      this.spelling.revision();
      const request = ++this.request;
      this.engine.set(null);
      this.error.set(false);
      if (enabled) void this.spelling.loadDictionary(language).then(engine => {
        if (!this.destroyed && request === this.request) this.engine.set(engine);
      }).catch(() => { if (!this.destroyed && request === this.request) this.error.set(true); });
    });
    effect(() => {
      this.store.activeChapter();
      this.store.tweaks.spellcheck();
      this.engine();
      this.ignored();
      this.spelling.revision();
      this.dismiss();
      this.schedule();
    });
    afterNextRender(() => {
      const root = this.root;
      const observer = new MutationObserver(() => this.schedule());
      observer.observe(root, { childList: true, subtree: true, characterData: true });
      root.addEventListener('contextmenu', this.contextMenu);
      root.addEventListener('input', this.onInput);
      document.addEventListener('pointerdown', this.outside);
      document.addEventListener('keydown', this.keyboard);
      document.addEventListener('scroll', this.dismiss, true);
      window.addEventListener('resize', this.dismiss);
      this.schedule();
      this.destroy.onDestroy(() => {
        observer.disconnect();
        root.removeEventListener('contextmenu', this.contextMenu);
        root.removeEventListener('input', this.onInput);
        document.removeEventListener('pointerdown', this.outside);
        document.removeEventListener('keydown', this.keyboard);
        document.removeEventListener('scroll', this.dismiss, true);
        window.removeEventListener('resize', this.dismiss);
      });
    });
    this.destroy.onDestroy(() => {
      this.destroyed = true;
      clearTimeout(this.timer);
      globalThis.CSS?.highlights?.delete('libria-spelling');
    });
  }

  private get root() { return this.element.nativeElement.parentElement!; }
  readonly dismiss = () => this.menu.set(null);
  private readonly outside = (event: Event) => {
    if (!this.element.nativeElement.contains(event.target as Node)) this.dismiss();
  };
  private readonly keyboard = (event: KeyboardEvent) => {
    if (event.key === 'Escape' || !this.element.nativeElement.contains(event.target as Node)) this.dismiss();
  };
  private readonly onInput = () => { this.dismiss(); this.schedule(); };

  private schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.refresh(), 250);
  }

  refresh() {
    const engine = this.engine();
    this.items = [];
    if (engine && this.store.tweaks.spellcheck()) {
      const ignored = this.ignored();
      const cache = new Map<string, boolean>();
      const correct = (word: string) => {
        if (!cache.has(word)) cache.set(word, ignored.has(word) || engine.correct(word));
        return cache.get(word)!;
      };
      for (const element of this.root.querySelectorAll<HTMLElement>('[data-libria-spelling]')) {
        this.items.push(...spellingRanges(element, correct));
      }
    }
    if (typeof Highlight !== 'undefined' && globalThis.CSS?.highlights) {
      CSS.highlights.set('libria-spelling', new Highlight(...this.items.map(item => item.range)));
    }
  }

  readonly contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    this.dismiss();
    if (!this.store.tweaks.spellcheck()) return;
    this.refresh();
    const target = event.target instanceof Element ? event.target.closest('[data-libria-spelling]') : null;
    if (!target) return;
    const item = spellingAtPoint(this.items.filter(item => item.element === target), event.clientX, event.clientY);
    if (!item) return;
    this.menu.set({ item, x: Math.max(8, Math.min(event.clientX, window.innerWidth - 256)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 410)) });
  };

  replace(replacement: string) {
    const item = this.menu()?.item;
    this.dismiss();
    if (item && item.element.isConnected && item.range.toString() === item.word) {
      this.correction.emit({ ...item, replacement });
      this.schedule();
    }
  }
  ignore() {
    const word = this.menu()?.item.word;
    if (word) this.ignored.update(words => new Set([...words, word]));
    this.dismiss();
  }
  async addWord() {
    const word = this.menu()?.item.word;
    this.dismiss();
    if (!word) return;
    try {
      if (!await this.spelling.addWord(word)) throw new Error('Dictionary write failed');
      this.refresh();
    } catch { this.error.set(true); }
  }
}
