import { ChangeDetectionStrategy, Component, Injectable, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SpellCheckService } from '../../../services/spell-check.service';

@Injectable()
export class SidebarDictionaryState {
  private readonly spelling = inject(SpellCheckService);
  readonly words = signal<string[]>([]);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly saving = signal(false);
  readonly query = signal('');
  readonly page = signal(0);
  readonly pageSize = 20;
  newWord = '';
  private request = 0;
  readonly filtered = computed(() => {
    const query = this.query().trim().toLocaleLowerCase();
    return this.words().filter(word => word.toLocaleLowerCase().includes(query));
  });
  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly pageIndex = computed(() => Math.min(this.page(), this.pageCount() - 1));
  readonly visible = computed(() => this.filtered().slice(this.pageIndex() * this.pageSize, (this.pageIndex() + 1) * this.pageSize));

  constructor() {
    effect(() => { this.spelling.revision(); void this.refresh(); });
  }

  search(query: string) { this.query.set(query); this.page.set(0); }
  navigate(direction: number) {
    this.page.set(Math.max(0, Math.min(this.pageCount() - 1, this.pageIndex() + direction)));
  }

  async refresh() {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set(false);
    try {
      const words = await this.spelling.getCustomDictionary();
      if (request === this.request) this.words.set([...new Set(words)].sort((a, b) => a.localeCompare(b)));
    } catch { if (request === this.request) this.error.set(true); }
    finally { if (request === this.request) this.loading.set(false); }
  }

  async add() {
    const word = this.newWord.trim();
    if (!word || this.saving()) return;
    this.saving.set(true);
    this.error.set(false);
    try {
      if (!await this.spelling.addWord(word)) throw new Error('Dictionary write failed');
      if (this.newWord.trim() === word) this.newWord = '';
      this.search(word);
    } catch { this.error.set(true); }
    finally { this.saving.set(false); }
  }

  async remove(word: string) {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set(false);
    try {
      if (!await this.spelling.removeWord(word)) throw new Error('Dictionary write failed');
    } catch { this.error.set(true); }
    finally { this.saving.set(false); }
  }
}

@Component({
  selector: 'app-sidebar-dictionary',
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <div class="sb__head"><div class="sb__title">{{ 'sidebar.dictionary' | translate }}</div></div>
    <div class="sb__content">
      <div class="sb__row sb__row--col">
        <label class="sb__label" for="dictionary-add">{{ 'sidebar.addWord' | translate }}</label>
        <div class="sb__dict-add-row">
          <input id="dictionary-add" class="sb__input" type="text" spellcheck="false"
            [attr.placeholder]="'sidebar.wordPlaceholder' | translate" [(ngModel)]="panel.newWord" (keydown.enter)="panel.add()" />
          <button class="sb__btn-primary sb__dict-add-btn" [attr.aria-label]="'sidebar.addWord' | translate"
            [disabled]="!panel.newWord.trim() || panel.saving()" (click)="panel.add()">+</button>
        </div>
      </div>
      <div class="sb__row sb__row--col">
        <label class="sb__label" for="dictionary-search">{{ 'dictionary.search' | translate }}</label>
        <input id="dictionary-search" class="sb__input" type="search" spellcheck="false"
          [ngModel]="panel.query()" (ngModelChange)="panel.search($event)" />
      </div>
      @if (panel.error()) {
        <p class="sb__help" role="alert">{{ 'dictionary.error' | translate }}</p>
        <button class="sb__opt" (click)="panel.refresh()">{{ 'dictionary.retry' | translate }}</button>
      }
      @if (panel.loading()) { <p class="sb__help" role="status">{{ 'spellcheck.loading' | translate }}…</p> }
      <div class="sb__dict-list">
        @for (word of panel.visible(); track word) {
          <div class="sb__dict-item">
            <span class="sb__dict-word">{{ word }}</span>
            <button class="sb__dict-del" [disabled]="panel.saving()"
              [attr.aria-label]="('dictionary.remove' | translate) + ': ' + word" (click)="panel.remove(word)">×</button>
          </div>
        } @empty {
          @if (!panel.loading()) { <p class="sb__help">{{ (panel.query() ? 'dictionary.noResults' : 'sidebar.dictEmpty') | translate }}</p> }
        }
      </div>
      <nav class="sb__dict-pagination" [attr.aria-label]="'sidebar.dictionary' | translate">
        <button class="sb__opt" [disabled]="panel.pageIndex() === 0" (click)="panel.navigate(-1)">{{ 'dictionary.previous' | translate }}</button>
        <span role="status">{{ 'dictionary.page' | translate: { current: panel.pageIndex() + 1, total: panel.pageCount(), words: panel.filtered().length } }}</span>
        <button class="sb__opt" [disabled]="panel.pageIndex() + 1 >= panel.pageCount()" (click)="panel.navigate(1)">{{ 'dictionary.next' | translate }}</button>
      </nav>
    </div>`,
  styles: `.sb__dict-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 16px; font-size: 12px; }`,
})
export class SidebarDictionaryPanelComponent {
  readonly panel = inject(SidebarDictionaryState);
}
