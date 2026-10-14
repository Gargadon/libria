import { Injectable, inject, computed, signal } from '@angular/core';
import { BookStore } from '../../../store/book.store';
import { FontService } from '../../../services/font.service';
const BUNDLED_FONT_KEYS = ['spectral', 'lora', 'eb-garamond', 'crimson-pro', 'inter', 'montserrat'];
@Injectable()
export class SidebarFontsState {
  readonly bookFontSelectVal = computed(() => {
    const custom = this.store.tweaks.customBookFont();
    if (custom === null) return this.store.tweaks.bookFont();
    if (this.systemFontFamilies().includes(custom)) return custom;
    return '__custom__';
  });

  readonly titleFontSelectVal = computed(() => {
    const custom = this.store.tweaks.customTitleFont();
    if (custom === null) return this.store.tweaks.titleFont();
    if (this.systemFontFamilies().includes(custom)) return custom;
    return '__custom__';
  });

  readonly showCustomBookFontInput = computed(() => {
    const custom = this.store.tweaks.customBookFont();
    return custom !== null && !this.systemFontFamilies().includes(custom);
  });

  readonly showCustomTitleFontInput = computed(() => {
    const custom = this.store.tweaks.customTitleFont();
    return custom !== null && !this.systemFontFamilies().includes(custom);
  });

  onBookFontSelect(val: string) {
    if (val === '__custom__') {
      this.store.updateTweak('customBookFont', '');
    } else if (BUNDLED_FONT_KEYS.includes(val)) {
      this.store.updateTweak('bookFont', val as any);
      this.store.updateTweak('customBookFont', null);
    } else {
      this.store.updateTweak('customBookFont', val);
    }
  }

  onTitleFontSelect(val: string) {
    if (val === '__custom__') {
      this.store.updateTweak('customTitleFont', '');
    } else if (BUNDLED_FONT_KEYS.includes(val)) {
      this.store.updateTweak('titleFont', val as any);
      this.store.updateTweak('customTitleFont', null);
    } else {
      this.store.updateTweak('customTitleFont', val);
    }
  }

  readonly fontService = inject(FontService);

  readonly store = inject(BookStore);

  systemFontFamilies = signal<string[]>([]);
  constructor() {
    this.fontService.loadSystemFonts().then((families) => this.systemFontFamilies.set(families));
  }
}
