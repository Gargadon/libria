import { Component, inject, signal, computed, effect, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';
import { SpellCheckService } from '../../services/spell-check.service';
import { Misspelling } from '../../models/book.models';

@Component({
  selector: 'app-spellcheck-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="scp" (click)="$event.stopPropagation()">
      <div class="scp__h">
        <span class="scp__title">{{ 'spellcheck.title' | translate }}</span>
        <button class="scp__close" (click)="store.toggleSpellCheckPanel()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="scp__body">
        @if (loading()) {
          <div class="scp__status">{{ 'spellcheck.loading' | translate }}…</div>
        } @else if (error()) {
          <div class="scp__status scp__status--error">{{ error() }}</div>
        } @else if (misspellings().length === 0) {
          <div class="scp__status scp__status--ok">{{ 'spellcheck.noErrors' | translate }}</div>
        } @else {
          <div class="scp__counter">
            {{ currentIndex() + 1 }} / {{ misspellings().length }}
          </div>

          <div class="scp__word">{{ currentMisspelling().word }}</div>

          <div class="scp__suggestions">
            @for (s of currentMisspelling().suggestions; track $index) {
              <button class="scp__sug" (click)="replaceWith(s)">
                {{ s }}
              </button>
            }
            @if (!currentMisspelling().suggestions.length) {
              <span class="scp__nosug">{{ 'spellcheck.noSuggestions' | translate }}</span>
            }
          </div>

          <div class="scp__context">
            <span [innerHTML]="contextHtml()"></span>
          </div>

          <div class="scp__actions">
            <button class="scp__btn" (click)="ignore()">{{ 'spellcheck.ignore' | translate }}</button>
            <button class="scp__btn" (click)="ignoreAll()">{{ 'spellcheck.ignoreAll' | translate }}</button>
            <button class="scp__btn scp__btn--primary" (click)="addToDict()">{{ 'spellcheck.addToDictionary' | translate }}</button>
          </div>

          <div class="scp__nav">
            <button class="scp__nav-btn" [disabled]="currentIndex() === 0" (click)="prev()">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <button class="scp__nav-btn" [disabled]="currentIndex() >= misspellings().length - 1" (click)="next()">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
  `]
})
export class SpellCheckPanelComponent {
  readonly store = inject(BookStore);
  readonly spellCheck = inject(SpellCheckService);

  readonly misspellings = signal<Misspelling[]>([]);
  readonly currentIndex = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly currentMisspelling = computed(() =>
    this.misspellings()[this.currentIndex()] ?? null
  );

  readonly contextHtml = computed(() => {
    const m = this.currentMisspelling();
    if (!m) return '';
    const chapter = this.store.activeChapter();
    if (!chapter) return '';
    const block = chapter.body[m.blockIndex];
    const text = block.text || '';
    const before = this.escapeHtml(text.slice(Math.max(0, m.start - 30), m.start));
    const word = this.escapeHtml(m.word);
    const after = this.escapeHtml(text.slice(m.end, m.end + 30));
    return `${before}<strong class="scp__hl">${word}</strong>${after}`;
  });

  private activeChapterId = '';
  private checkTimeout: any = null;

  constructor() {
    effect(() => {
      const chapter = this.store.activeChapter();
      const lang = this.store.documentLang();
      if (chapter && chapter.id !== this.activeChapterId) {
        this.activeChapterId = chapter.id;
        this.runCheck(chapter.body, lang);
      }
    });

    effect(() => {
      const visible = this.store.ui.showSpellCheck();
      const chapter = this.store.activeChapter();
      const lang = this.store.documentLang();
      if (visible && chapter) {
        this.runCheck(chapter.body, lang);
      }
    });
  }

  private async runCheck(body: any[], lang: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.currentIndex.set(0);
    try {
      const results = await this.spellCheck.checkChapter(body, lang);
      this.misspellings.set(results);
    } catch (e: any) {
      this.error.set(e.message || String(e));
      this.misspellings.set([]);
    }
    this.loading.set(false);
  }

  replaceWith(suggestion: string): void {
    const m = this.currentMisspelling();
    if (!m) return;
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const block = chapter.body[m.blockIndex];
    const text = block.text || '';
    const newText = text.slice(0, m.start) + suggestion + text.slice(m.end);
    this.store.updateChapterBlock(chapter.id, m.blockIndex, newText);
    this.spellCheck.ignoreWord(m.word);
    this.removeCurrent();
  }

  ignore(): void {
    const m = this.currentMisspelling();
    if (!m) return;
    this.spellCheck.ignoreWord(m.word);
    this.removeCurrent();
  }

  ignoreAll(): void {
    const m = this.currentMisspelling();
    if (!m) return;
    this.spellCheck.ignoreAllInChapter(m.word);
    this.misspellings.set(
      this.misspellings().filter(x => x.word.toLowerCase() !== m.word.toLowerCase())
    );
    if (this.currentIndex() >= this.misspellings().length) {
      this.currentIndex.set(Math.max(0, this.misspellings().length - 1));
    }
  }

  addToDict(): void {
    const m = this.currentMisspelling();
    if (!m) return;
    this.spellCheck.addToDictionary(m.word);
    this.removeCurrent();
  }

  private removeCurrent(): void {
    const idx = this.currentIndex();
    const list = this.misspellings();
    if (idx < list.length) {
      this.misspellings.set([...list.slice(0, idx), ...list.slice(idx + 1)]);
    }
    if (this.currentIndex() >= this.misspellings().length) {
      this.currentIndex.set(Math.max(0, this.misspellings().length - 1));
    }
  }

  next(): void {
    if (this.currentIndex() < this.misspellings().length - 1) {
      this.currentIndex.set(this.currentIndex() + 1);
    }
  }

  prev(): void {
    if (this.currentIndex() > 0) {
      this.currentIndex.set(this.currentIndex() - 1);
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
