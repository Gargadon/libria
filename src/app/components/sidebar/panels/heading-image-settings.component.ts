import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { Chapter, ChapterHeadingImage } from '../../../models/book.models';
import { AssetService } from '../../../services/asset.service';
import { BookStore } from '../../../store/book.store';
import { createId } from '../../../utils/ids';

@Component({
  selector: 'app-heading-image-settings',
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let currentChapter = chapter();
    <fieldset class="sb__heading-image" [attr.aria-label]="currentChapter ? ('headingImage.chapter' | translate) : null">
      @if (!currentChapter) {
        <legend>{{ 'headingImage.book' | translate }}</legend>
      }
      @if (preview(); as src) {
        <img [src]="src" alt="" />
      }
      @if (currentChapter) {
        <p class="sb__help">{{ modeLabel() | translate }}</p>
      }
      <div class="sb__heading-image-actions">
        <input #imageFile type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" hidden
          (change)="upload(imageFile)" />
        <button type="button" class="sb__btn-link" [disabled]="busy()" (click)="imageFile.click()">
          {{ (image() ? 'headingImage.replace' : 'headingImage.choose') | translate }}
        </button>
        @if (currentChapter) {
          @if (currentChapter.headingImage !== undefined) {
            <button type="button" class="sb__btn-link" [disabled]="busy()" (click)="apply(undefined)">
              {{ 'headingImage.inherit' | translate }}
            </button>
          }
          @if (currentChapter.headingImage !== null) {
            <button type="button" class="sb__btn-link" [disabled]="busy()" (click)="apply(null)">
              {{ 'headingImage.none' | translate }}
            </button>
          }
        } @else if (image()) {
          <button type="button" class="sb__btn-link" [disabled]="busy()" (click)="apply(undefined)">
            {{ 'headingImage.remove' | translate }}
          </button>
        }
      </div>
      @if (error()) {
        <p class="sb__help" role="alert">{{ 'headingImage.error' | translate }}</p>
      }
    </fieldset>
  `,
})
export class HeadingImageSettingsComponent {
  private readonly store = inject(BookStore);
  private readonly assets = inject(AssetService);
  readonly chapter = input<Chapter>();
  readonly busy = signal(false);
  readonly error = signal(false);
  readonly image = computed(() => {
    const chapter = this.chapter();
    return chapter?.headingImage === undefined ? this.store.book()?.headingImage : chapter.headingImage;
  });
  readonly preview = computed(() => {
    const asset = this.image()?.assetId;
    return asset ? this.assets.assets()[asset] : undefined;
  });
  readonly modeLabel = computed(() => {
    const image = this.chapter()?.headingImage;
    return image === undefined ? 'headingImage.inherited' : image === null ? 'headingImage.none' : 'headingImage.custom';
  });

  apply(image: ChapterHeadingImage | null | undefined) {
    this.error.set(false);
    const chapter = this.chapter();
    this.setImage(chapter?.id, image);
  }

  async upload(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    const session = this.store.documentSession();
    const chapterId = this.chapter()?.id;
    this.busy.set(true);
    this.error.set(false);
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('Image too large');
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      if (!/^data:image\/(?:png|jpeg);base64,/i.test(data)) throw new Error('Unsupported image');
      const image = new Image();
      image.src = data;
      await image.decode();
      if (session !== this.store.documentSession() || (chapterId && !this.store.chapters().some(c => c.id === chapterId))) return;
      const scale = Math.min(360 / image.naturalWidth, 160 / image.naturalHeight, 1);
      const assetId = createId('heading');
      this.assets.set(assetId, data);
      this.setImage(chapterId, {
        assetId,
        width: Math.max(1, Math.round(image.naturalWidth * scale)),
        height: Math.max(1, Math.round(image.naturalHeight * scale)),
      });
    } catch {
      if (session === this.store.documentSession()) this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  private setImage(chapterId: string | undefined, image: ChapterHeadingImage | null | undefined) {
    const previous = chapterId
      ? this.store.chapters().find(c => c.id === chapterId)?.headingImage
      : this.store.book()?.headingImage;
    if (chapterId) {
      this.store.updateChapterPlanning(chapterId, { headingImage: image });
    } else {
      this.store.updateBookMetadata({ headingImage: image ?? undefined });
    }
    if (previous && this.store.book()?.headingImage?.assetId !== previous.assetId &&
        !this.store.chapters().some(chapter => chapter.headingImage?.assetId === previous.assetId)) {
      this.assets.remove(previous.assetId);
    }
  }
}
