import { Component, inject, signal, ChangeDetectionStrategy, Injectable } from '@angular/core';
import { BookStore } from '../../../store/book.store';

import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FormsModule } from '@angular/forms';

import { SpellCheckService } from '../../../services/spell-check.service';

import { GoogleDriveService } from '../../../services/google-drive.service';

@Injectable()
export class SidebarSettingsState {
  readonly drive = inject(GoogleDriveService);

  readonly store = inject(BookStore);

  setLanguage(lang: string) {
    const config = { ...this.store.personalConfig(), language: lang };
    this.store.setPersonalConfig(config);
    this.translate.use(lang);
  }

  removeAvatar() {
    const config = { ...this.store.personalConfig(), avatar: '' };
    this.store.setPersonalConfig(config);
  }

  onAvatarFile(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this._resizeImage(e.target.result, 200, 200).then((resizedBase64) => {
          const config = { ...this.store.personalConfig(), avatar: resizedBase64 };
          this.store.setPersonalConfig(config);
        });
      };
      reader.readAsDataURL(file);
    }
  }

  updateUserName(name: string) {
    const config = { ...this.store.personalConfig(), userName: name };
    this.store.setPersonalConfig(config);
  }

  newDictWord = '';

  async addDictWord() {
    const word = this.newDictWord.trim();
    if (!word) return;
    const ok = await this.spellCheckService.addWord(word);
    if (ok) {
      this.dictWords.update((w) => [...w, word].sort((a, b) => a.localeCompare(b)));
      this.newDictWord = '';
    }
  }

  async removeDictWord(word: string) {
    const ok = await this.spellCheckService.removeWord(word);
    if (ok) {
      this.dictWords.update((w) => w.filter((x) => x !== word));
    }
  }

  readonly spellCheckService = inject(SpellCheckService);

  dictWords = signal<string[]>([]);

  readonly translate = inject(TranslateService);

  private _resizeImage(base64: string, width: number, height: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Calculate object-fit: cover equivalent
          const scale = Math.max(width / img.width, height / img.height);
          const x = width / 2 - (img.width / 2) * scale;
          const y = height / 2 - (img.height / 2) * scale;

          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        }

        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.src = base64;
    });
  }

  async loadDictWords() {
    if (this.spellCheckService.isAvailable) {
      const words = await this.spellCheckService.getCustomDictionary();
      this.dictWords.set(words);
    }
  }
  constructor() {
    void this.loadDictWords();
  }
}

@Component({
  selector: 'app-sidebar-settings',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './settings-panel.component.html',
})
export class SidebarSettingsPanelComponent {
  readonly panel = inject(SidebarSettingsState);
}
