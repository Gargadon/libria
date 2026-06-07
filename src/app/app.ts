import { Component, inject, effect, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { BookStore } from './store/book.store';
import { FileService } from './services/file.service';
import { PersonalConfigService } from './services/personal-config.service';
import { AutosaveService } from './services/autosave.service';
import { TopbarComponent } from './components/topbar/topbar.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { EditorComponent } from './components/editor/editor.component';
import { PreviewComponent } from './components/preview/preview.component';
import { TweaksPanelComponent } from './components/tweaks-panel/tweaks-panel.component';
import { SpellCheckPanelComponent } from './components/spellcheck-panel/spellcheck-panel.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { AboutModalComponent } from './components/modals/about-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    TopbarComponent,
    SidebarComponent,
    EditorComponent,
    PreviewComponent,
    TweaksPanelComponent,
    SpellCheckPanelComponent,
    WelcomeComponent,
    AboutModalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);
  readonly translate = inject(TranslateService);
  private readonly autosave = inject(AutosaveService);

  isResizing = false;
  showAbout = signal(false);

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (event.key === 'F11') {
      event.preventDefault();
      if (this.store.book()) this.store.toggleZenMode();
    }
    if (event.key === 'Escape' && this.store.ui.zenMode()) {
      this.store.toggleZenMode();
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
      event.preventDefault();
      if (this.store.book()) this.store.togglePreview();
    }
  }

  constructor() {
    this.autosave.init();
    this.translate.addLangs(['es', 'en', 'fr', 'it']);
    const savedLang = this.store.personalConfig().language || 'es';
    this.translate.use(savedLang);

    effect(() => {
      const lang = this.store.personalConfig().language;
      if (lang) {
        this.translate.use(lang);
        const api = (window as any).electronAPI;
        if (api?.setLanguage) api.setLanguage(lang);
      }
    });

    const api = (window as any).electronAPI;
    if (api?.onMenuAction) {
      api.onMenuAction((action: string) => {
        if (action === 'about') this.showAbout.set(true);
      });
    }
    if (api?.onFileOpen) {
      api.onFileOpen((filePath: string) => {
        this.fileService.openLibriaFileByPath(filePath);
      });
    }

    effect(() => {
      const book = this.store.book();
      if (!book) {
        document.title = 'Libria';
        return;
      }
      const fileName = this.fileService.currentPath
        ? this.fileService.currentPath.split(/[/\\]/).pop()!
        : (book.title.replace(/\s+/g, '_') + '.libria');
      const prefix = this.store.isDirty() ? '* ' : '';
      document.title = 'Libria - ' + prefix + fileName;
    });
  }

  startResizing(event: MouseEvent) {
    this.isResizing = true;
    event.preventDefault();
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('mouseup', this.stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  onMouseMove = (event: MouseEvent) => {
    if (!this.isResizing) return;

    // When sidebar is on the right, subtract its 300px from the available space
    const sidebarOffset = this.store.tweaks.sidebar() === 'right' ? 300 : 0;
    const newWidth = window.innerWidth - event.clientX - sidebarOffset;

    // Constraints
    if (newWidth > 320 && newWidth < window.innerWidth * 0.7) {
      const config = { ...this.store.personalConfig(), previewWidth: newWidth };
      this.store.setPersonalConfig(config);
    }
  };

  stopResizing = () => {
    this.isResizing = false;
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('mouseup', this.stopResizing);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  };
}
