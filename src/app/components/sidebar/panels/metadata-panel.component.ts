import { Component, inject, ChangeDetectionStrategy, Injectable } from '@angular/core';
import { BookStore } from '../../../store/book.store';
import { AssetService } from '../../../services/asset.service';

import { TranslateModule } from '@ngx-translate/core';
import { Book } from '../../../models/book.models';
import { FormsModule } from '@angular/forms';

@Injectable()
export class SidebarMetadataState {
  readonly assetService = inject(AssetService);

  removeCover() {
    this.assetService.remove('cover');
  }

  onCoverFile(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.assetService.set('cover', e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  localMetadata: Book = {} as Book;

  syncMetadata() {
    this.store.updateBookMetadata(this.localMetadata);
  }

  removeAuthor(index: number) {
    this.localMetadata.authors.splice(index, 1);
    this.syncMetadata();
  }

  addAuthor() {
    if (!this.localMetadata.authors) this.localMetadata.authors = [];
    this.localMetadata.authors.push('');
  }

  removeEditor(index: number) {
    this.localMetadata.editors.splice(index, 1);
    this.syncMetadata();
  }

  addEditor() {
    if (!this.localMetadata.editors) this.localMetadata.editors = [];
    this.localMetadata.editors.push('');
  }

  readonly store = inject(BookStore);

  initLocalMetadata() {
    const current = this.store.book();
    if (current) {
      this.localMetadata = {
        ...current,
        authors: current.authors ? [...current.authors] : [],
        editors: current.editors ? [...current.editors] : [],
      };
    }
  }
  constructor() {
    this.initLocalMetadata();
  }
}

@Component({
  selector: 'app-sidebar-metadata',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './metadata-panel.component.html',
})
export class SidebarMetadataPanelComponent {
  readonly panel = inject(SidebarMetadataState);
}
