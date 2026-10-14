import { inject, Injectable } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { AssetService } from '../../services/asset.service';

import { Block } from '../../models/book.models';

@Injectable()
export class EditorImageService {
  readonly store = inject(BookStore);
  readonly assetService = inject(AssetService);

  insertImage(getIndex: () => number) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      this.readImageFile(file).then(({ dataUrl, width, height }) => {
        const assetKey = 'img-' + Date.now().toString(36);
        this.assetService.set(assetKey, dataUrl);
        const chapterId = this.store.activeChapterId();
        const index = getIndex() >= 0 ? getIndex() : this.store.activeChapter()!.body.length - 1;
        this.store.saveSnapshot();
        this.store.insertImageBlock(chapterId, index, assetKey, width, height);
      });
    };
    input.click();
  }

  pickImageForBlock(chapterId: string, blockIndex: number) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      this.readImageFile(file).then(({ dataUrl, width, height }) => {
        const assetKey = 'img-' + Date.now().toString(36);
        this.assetService.set(assetKey, dataUrl);
        this.store.saveSnapshot();
        this.store.updateImageSize(chapterId, blockIndex, width, height);
        this.store.setImageSrc(chapterId, blockIndex, assetKey);
      });
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
    const startH = img.offsetHeight;
    const aspect = startW / startH;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const newW = Math.max(80, startW + dx);
      const newH = Math.round(newW / aspect);
      img.style.width = newW + 'px';
      img.style.height = newH + 'px';
    };

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const dx = e.clientX - startX;
      const newW = Math.max(80, startW + dx);
      const newH = Math.round(newW / aspect);
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
            width: img.naturalWidth,
            height: img.naturalHeight,
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
