import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AppCacheService } from '../../services/app-cache.service';
import { GoogleDriveService } from '../../services/google-drive.service';
import { BookStore } from '../../store/book.store';

@Component({
  selector: 'app-settings-modal',
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-modal.component.html',
  styleUrl: './settings-modal.component.scss',
})
export class SettingsModalComponent {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cache = inject(AppCacheService);
  private readonly translate = inject(TranslateService);
  readonly drive = inject(GoogleDriveService);
  readonly store = inject(BookStore);
  readonly clearingCache = signal(false);
  readonly cacheMessage = signal('');
  readonly avatarError = signal(false);
  private avatarRequest = 0;

  open() {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  close() {
    this.dialog().nativeElement.close();
  }

  openDrive() {
    this.close();
    this.drive.show();
  }

  setLanguage(language: string) {
    this.store.setPersonalConfig({ ...this.store.personalConfig(), language });
    this.translate.use(language);
  }

  setInterfaceStyle(interfaceStyle: 'classic' | 'modern') {
    this.store.setPersonalConfig({ ...this.store.personalConfig(), interfaceStyle });
  }

  setName(userName: string) {
    const config = this.store.personalConfig();
    if (config.userName !== userName) this.store.setPersonalConfig({ ...config, userName });
  }

  removeAvatar() {
    this.avatarRequest++;
    this.avatarError.set(false);
    this.store.setPersonalConfig({ ...this.store.personalConfig(), avatar: '' });
  }

  async uploadAvatar(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    input.value = '';
    const request = ++this.avatarRequest;
    const url = URL.createObjectURL(file);
    this.avatarError.set(false);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (request !== this.avatarRequest) return;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 200;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2,
        size, size, 0, 0, 200, 200);
      const avatar = canvas.toDataURL('image/webp', 0.8);
      this.store.setPersonalConfig({ ...this.store.personalConfig(), avatar });
    } catch {
      if (request === this.avatarRequest) this.avatarError.set(true);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async clearCache() {
    if (this.clearingCache()) return;
    this.clearingCache.set(true);
    this.cacheMessage.set('');
    try {
      await this.cache.clear();
      this.cacheMessage.set('sidebar.cacheCleared');
    } catch {
      this.cacheMessage.set('sidebar.cacheError');
    } finally {
      this.clearingCache.set(false);
    }
  }
}
