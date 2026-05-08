import { Component, inject, effect } from '@angular/core';
import { BookStore } from './store/book.store';
import { FileService } from './services/file.service';
import { PersonalConfigService } from './services/personal-config.service';
import { TopbarComponent } from './components/topbar/topbar.component';
import { SidebarComponent } from './components/sidebar/sidebar.component';
import { EditorComponent } from './components/editor/editor.component';
import { PreviewComponent } from './components/preview/preview.component';
import { TweaksPanelComponent } from './components/tweaks-panel/tweaks-panel.component';
import { WelcomeComponent } from './components/welcome/welcome.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    TopbarComponent,
    SidebarComponent,
    EditorComponent,
    PreviewComponent,
    TweaksPanelComponent,
    WelcomeComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);
  readonly personalConfig = inject(PersonalConfigService);

  constructor() {
    const saved = this.personalConfig.load();
    this.store.setPersonalConfig(saved);

    effect(() => {
      this.personalConfig.save(this.store.personalConfig());
    });

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
      document.title = prefix + fileName;
    });
  }
}
