import { FontSelectComponent } from './font-select.component';
import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../../store/book.store';

import { TranslateModule } from '@ngx-translate/core';

import { FormsModule } from '@angular/forms';

import { SidebarFontsState } from './sidebar-fonts.state';
@Component({
  selector: 'app-sidebar-layout',
  standalone: true,
  imports: [FormsModule, TranslateModule, FontSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './layout-panel.component.html',
})
export class SidebarLayoutPanelComponent {
  readonly store = inject(BookStore);
  readonly fonts = inject(SidebarFontsState);
}
