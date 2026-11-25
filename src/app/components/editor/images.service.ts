import { inject, Injectable } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { AssetService } from '../../services/asset.service';

import { Block } from '../../models/book.models';
import { inlineImageSize } from '../../utils/image-sizing';
import { createId } from '../../utils/ids';

@Injectable()
export class EditorImageService {
  readonly store = inject(BookStore);
  readonly assetService = inject(AssetService);

  insertImage(getIndex: () => number) {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const index = getIndex();
    const anchorId = chapter.body[index]?.id;
    this.pickImage(({ dataUrl, width, height }) => {
      const target = this.store.chapters().find(c => c.id === chapter.id);
      if (!target) return;
      const anchor = target.body.findIndex(block => anchorId && block.id === anchorId);
      const assetKey = createId('img');
      this.assetService.set(assetKey, dataUrl);
      this.store.saveSnapshot();
      this.store.insertImageBlock(chapter.id, anchor >= 0 ? anchor : target.body.length - 1, assetKey, width, height);
    });
  }

  pickImageForBlock(chapterId: string, blockIndex: number) {
    const original = this.store.chapters().find(c => c.id === chapterId)?.body[blockIndex];
    if (!original) return;
    this.pickImage(({ dataUrl, width, height }) => {
      const target = this.store.chapters().find(c => c.id === chapterId);
      const index = target?.body.findIndex(block => block === original || (!!original.id && block.id === original.id)) ?? -1;
      if (index < 0) return;
      const assetKey = createId('img');
      this.assetService.set(assetKey, dataUrl);
      this.store.saveSnapshot();
      this.store.setImageSrc(chapterId, index, assetKey, width, height);
    });
  }

  private pickImage(onRead: (image: { dataUrl: string; width: number; height: number }) => void) {
    const session = this.store.documentSession();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const image = await this.readImageFile(file);
        if (this.store.documentSession() === session) onRead(image);
      } catch (error) {
        console.warn('Could not read image:', error);
      }
    };
    input.click();
  }

  onImageResizeStart(
    event: MouseEvent,
    chapterId: string,
    blockIndex: number,
    img: HTMLImageElement,
  ) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = img.offsetWidth;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const aspect = img.naturalWidth / img.naturalHeight;
    const maxWidth = img.closest('figure')?.clientWidth || startW;
    const minWidth = Math.min(startW, 80);
    const widthAt = (e: MouseEvent) => Math.min(maxWidth, Math.max(minWidth, startW + e.clientX - startX));

    const onMove = (e: MouseEvent) => {
      img.style.width = widthAt(e) + 'px';
    };

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const newW = widthAt(e);
      const newH = Math.max(1, Math.round(newW / aspect));
      this.store.saveSnapshot();
      this.store.updateImageSize(chapterId, blockIndex, newW, newH);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onImageCaptionInput(chapterId: string, blockIndex: number, event: Event) {
    const el = event.target as HTMLElement;
    this.store.updateImageCaption(chapterId, blockIndex, el.innerText);
  }

  rotateImage(chapterId: string, blockIndex: number, b: Block, delta: number) {
    const current = b.rotation ?? 0;
    const next = (((current + delta) % 360) + 360) % 360;
    this.store.saveSnapshot();
    this.store.updateImageTransform(chapterId, blockIndex, { rotation: next });
  }

  flipImage(chapterId: string, blockIndex: number, b: Block, axis: 'h' | 'v') {
    this.store.saveSnapshot();
    if (axis === 'h') {
      this.store.updateImageTransform(chapterId, blockIndex, { flipH: !b.flipH });
    } else {
      this.store.updateImageTransform(chapterId, blockIndex, { flipV: !b.flipV });
    }
  }

  readImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D not available'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve({
            dataUrl: canvas.toDataURL('image/png'),
            ...inlineImageSize(img.naturalWidth, img.naturalHeight),
          });
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  pasteImages(chapterId: string, items: DataTransferItemList, getIndex: () => number): boolean {
    const imageItems = Array.from(items).filter((item) => item.type.startsWith('image/'));
    if (!imageItems.length) return false;
    for (const item of imageItems) {
      const file = item.getAsFile();
      if (!file) continue;
      this.readImageFile(file).then(({ dataUrl, width, height }) => {
        const assetKey =
          'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
        this.assetService.set(assetKey, dataUrl);
        const ch = this.store.activeChapter();
        const idx = getIndex() >= 0 ? getIndex() : ch ? ch.body.length - 1 : 0;
        this.store.saveSnapshot();
        this.store.insertImageBlock(chapterId, idx, assetKey, width, height);
      });
    }
    return true;
  }
}
