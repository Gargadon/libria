import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../../store/book.store';
import { AssetService } from '../../../services/asset.service';

import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-sidebar-attachments',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './attachments-panel.component.html',
})
export class SidebarAttachmentsPanelComponent {
  readonly imageAssets = computed(() => {
    const assets = this.assetService.assets();
    return Object.entries(assets)
      .filter(([key]) => key.startsWith('img-'))
      .map(([key, data]) => ({ key, data }));
  });

  insertAttachment(assetKey: string) {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const index = chapter.body.length - 1;
    this.store.saveSnapshot();
    this.store.insertImageBlock(chapter.id, index, assetKey);
  }

  deleteAttachment(assetKey: string) {
    this.assetService.remove(assetKey);
  }

  readonly assetService = inject(AssetService);

  readonly store = inject(BookStore);
}
