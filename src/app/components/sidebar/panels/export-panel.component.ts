import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../../store/book.store';
import { AssetService } from '../../../services/asset.service';

import { TranslateModule } from '@ngx-translate/core';

import { ExportService } from '../../../services/export.service';

@Component({
  selector: 'app-sidebar-export',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './export-panel.component.html',
})
export class SidebarExportPanelComponent {
  readonly store = inject(BookStore);

  selectAllChapters() {
    const ids = this.store.chapters().map((c) => c.id);
    this.store.updateExportPrefs({ selectedChapterIds: ids });
  }

  toggleExportChapter(id: string, checked: boolean) {
    const current = this.store.exportPrefs.selectedChapterIds();
    const next = checked ? [...current, id] : current.filter((x) => x !== id);
    this.store.updateExportPrefs({ selectedChapterIds: next });
  }

  readonly exportService = inject(ExportService);

  exportPdf() {
    this.exportService.exportPdf();
  }

  readonly assetService = inject(AssetService);
}
