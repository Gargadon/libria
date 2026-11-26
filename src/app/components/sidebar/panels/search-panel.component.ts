import { Component, inject, ChangeDetectionStrategy, computed, DestroyRef, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { SearchResult } from '../../../models/book.models';
import { BookStore } from '../../../store/book.store';

const RESULTS_PER_PAGE = 50;
const SEARCH_DELAY_MS = 150;

@Component({
  selector: 'app-sidebar-search',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './search-panel.component.html',
  styles: `.sb__search-pagination { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 12px; font-size: 12px; }`,
})
export class SidebarSearchPanelComponent {
  readonly store = inject(BookStore);
  readonly draft = signal<string | null>(null);
  readonly page = signal(0);
  readonly count = computed(() => this.store.searchResults().length);
  readonly start = computed(() => this.page() * RESULTS_PER_PAGE);
  readonly end = computed(() => Math.min(this.start() + RESULTS_PER_PAGE, this.count()));
  readonly visibleResults = computed(() => this.store.searchResults().slice(this.start(), this.end()));

  private timer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  queueSearch(query: string) {
    clearTimeout(this.timer);
    this.draft.set(query);
    if (!query.trim()) {
      this.submitSearch();
      return;
    }
    const session = this.store.documentSession();
    this.timer = setTimeout(() => {
      if (session === this.store.documentSession()) this.submitSearch();
      else this.draft.set(null);
    }, SEARCH_DELAY_MS);
  }

  submitSearch(event?: KeyboardEvent) {
    const query = this.draft();
    if (event?.isComposing || query === null) return;

    clearTimeout(this.timer);
    this.page.set(0);
    this.store.search(query);
    this.draft.set(null);
  }

  replaceAll() {
    this.page.set(0);
    this.store.replaceAll(this.store.replaceQuery());
  }

  goToResult(result: SearchResult) {
    this.store.goToSearchResult(result.chapterId, result.blockIndex);
  }
}
