import { Component, inject, effect, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookStore } from './store/book.store';
import { FileService } from './services/file.service';
import { PersonalConfigService } from './services/personal-config.service';
import { TopbarComponent } from './components/topbar/topbar.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { EditorComponent } from './components/editor/editor.component';
import { PreviewComponent } from './components/preview/preview.component';
import { TweaksPanelComponent } from './components/tweaks-panel/tweaks-panel.component';
import { WelcomeComponent } from './components/welcome/welcome.component';
import { AboutModalComponent } from './components/modals/about-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    TopbarComponent,
    SidebarComponent,
    EditorComponent,
    PreviewComponent,
    TweaksPanelComponent,
    WelcomeComponent,
    AboutModalComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);

  isResizing = false;
  showAbout = signal(false);

  constructor() {
    const api = (window as any).electronAPI;
    if (api?.onMenuAction) {
      api.onMenuAction((action: string) => {
        if (action === 'about') this.showAbout.set(true);
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
