import { FontSelectComponent } from './font-select.component';
import {
  Component,
  inject,
  computed,
  signal,
  ChangeDetectionStrategy,
  Injectable,
} from '@angular/core';
import { BookStore } from '../../../store/book.store';

import { TranslateModule } from '@ngx-translate/core';
import { BookTheme } from '../../../models/book.models';
import { FormsModule } from '@angular/forms';

import { BOOK_THEMES } from '../../../data/themes.data';
import { CustomThemesService } from '../../../services/custom-themes.service';

import { SidebarFontsState } from './sidebar-fonts.state';
@Injectable()
export class SidebarStylesState {
  readonly store = inject(BookStore);

  async importTheme() {
    const theme = await this.customThemesService.importTheme();
    if (theme) {
      this.store.addCustomTheme(theme);
    }
  }

  readonly activeThemeId = computed(() => {
    const t = this.store.tweaks;
    for (const theme of BOOK_THEMES) {
      const match = this.THEME_KEYS.every((key) => {
        const themeVal = (theme.tweaks as any)[key];
        const storeVal = (t as any)[key]();
        return themeVal === undefined || themeVal === storeVal;
      });
      if (match) return theme.id;
    }
    return null;
  });

  applyTheme(theme: BookTheme) {
    this.store.applyTheme(theme);
  }

  themePreviewFont(theme: BookTheme): string {
    const font = theme.tweaks.bookFont;
    switch (font) {
      case 'eb-garamond':
        return "'EB Garamond', serif";
      case 'crimson-pro':
        return "'Crimson Pro', serif";
      case 'lora':
        return "'Lora', serif";
      case 'spectral':
        return "'Spectral', serif";
      case 'inter':
        return "'Inter', sans-serif";
      case 'montserrat':
        return "'Montserrat', sans-serif";
      default:
        return 'serif';
    }
  }

  async exportTheme(theme: BookTheme, event: Event) {
    event.stopPropagation();
    await this.customThemesService.exportTheme(theme);
  }

  deleteTheme(id: string, event: Event) {
    event.stopPropagation();
    this.store.deleteCustomTheme(id);
  }

  newThemeName = signal('');

  confirmSaveTheme() {
    const name = this.newThemeName().trim();
    if (!name) return;
    this.store.saveCustomTheme(name);
    this.newThemeName.set('');
    this.showSaveThemeInput.set(false);
  }

  showSaveThemeInput = signal(false);

  readonly allThemes = computed(() => [...BOOK_THEMES, ...this.store.customThemes()]);

  readonly customThemesService = inject(CustomThemesService);

  private readonly THEME_KEYS: (keyof BookTheme['tweaks'])[] = [
    'bookFont',
    'titleFont',
    'fontSize',
    'lineHeight',
    'paragraphSpacing',
    'indentFirstLine',
    'indentSize',
    'justifyText',
    'hyphenation',
    'dropCap',
    'dropCapLines',
    'firstParagraphSmallCaps',
    'titleAlignment',
    'titleFontSize',
    'titleBold',
    'titleItalic',
    'titleUnderline',
    'sceneBreakType',
    'showPageNumbers',
    'pageNumberPosition',
    'showHeader',
    'hideFirstPageHeaderFooter',
    'marginTop',
    'marginBottom',
    'marginInner',
    'marginOuter',
  ];
  readonly fonts = inject(SidebarFontsState);
}

@Component({
  selector: 'app-sidebar-styles',
  standalone: true,
  imports: [FormsModule, TranslateModule, FontSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './styles-panel.component.html',
})
export class SidebarStylesPanelComponent {
  readonly panel = inject(SidebarStylesState);
}
