import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../../store/book.store';

import { TranslateModule } from '@ngx-translate/core';

import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-sidebar-search',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './search-panel.component.html',
})
export class SidebarSearchPanelComponent {
  readonly store = inject(BookStore);

  goToResult(r: any) {
    this.store.goToSearchResult(r.chapterId, r.blockIndex);
  }

  searchFrag(r: any): string {
    const before = r.before.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const match = r.match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const after = r.after.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return (
      (r.before ? '…' : '') +
      before +
      '<mark>' +
      match +
      '</mark>' +
      after +
      (r.after.length >= 40 ? '…' : '')
    );
  }
}
