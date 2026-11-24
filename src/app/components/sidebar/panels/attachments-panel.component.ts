import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../../store/book.store';
import { AssetService } from '../../../services/asset.service';
import { inlineImageSize } from '../../../utils/image-sizing';

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

  async insertAttachment(assetKey: string) {
    const chapterId = this.store.activeChapterId();
    const source = this.assetService.get(assetKey);
    if (!chapterId || !source) return;
    const session = this.store.documentSession();
    const image = new Image();
    image.src = source;
    try {
      await image.decode();
    } catch {
      return;
    }
    if (session !== this.store.documentSession() || this.assetService.get(assetKey) !== source) return;
    const chapter = this.store.chapters().find(chapter => chapter.id === chapterId);
    if (!chapter) return;
    const { width, height } = inlineImageSize(image.naturalWidth, image.naturalHeight);
    this.store.saveSnapshot();
    this.store.insertImageBlock(chapterId, chapter.body.length - 1, assetKey, width, height);
  }

  deleteAttachment(assetKey: string) {
    this.assetService.remove(assetKey);
  }

  readonly assetService = inject(AssetService);

  readonly store = inject(BookStore);
}
