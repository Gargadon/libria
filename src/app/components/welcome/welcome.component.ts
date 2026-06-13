import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
import { RecentProjectsService } from '../../services/recent-projects.service';
import { RecentProject } from '../../models/book.models';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-welcome',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="welcome">
      <div class="welcome__card">
        <div class="welcome__head">
          <div class="welcome__logo">
            <img src="libria.svg" alt="Libria" class="app-logo">
          </div>
          <h1 class="welcome__title">Libria</h1>
          <p class="welcome__tagline">{{ 'welcome.tagline' | translate }}</p>
        </div>

        <div class="welcome__body">
          @if (recentProjects().length) {
            <div class="welcome__recent">
              <div class="welcome__recent-title">{{ 'welcome.recent' | translate }}</div>
              <div class="welcome__recent-list">
                @for (p of recentProjects(); track p.path) {
                  <button class="welcome__recent-item" (click)="openRecent(p)">
                    <span class="material-symbols-outlined">description</span>
                    <div class="welcome__recent-info">
                      <strong>{{ p.title }}</strong>
                      <span>{{ formatDate(p.date) }}</span>
                    </div>
                  </button>
                }
              </div>
            </div>
          }

          <div class="welcome__actions">
            <button class="welcome__btn welcome__btn--primary" (click)="store.createNewProject()">
              <span class="material-symbols-outlined">add</span>
              <div class="welcome__btn-text">
                <strong>{{ 'welcome.newProject' | translate }}</strong>
                <span>{{ 'welcome.newProjectDesc' | translate }}</span>
              </div>
            </button>
            
            <button class="welcome__btn" (click)="fileService.openLibriaFile()">
              <span class="material-symbols-outlined">file_open</span>
              <div class="welcome__btn-text">
                <strong>{{ 'welcome.openProject' | translate }}</strong>
                <span>{{ 'welcome.openProjectDesc' | translate }}</span>
              </div>
            </button>
          </div>
        </div>
        
        <div class="welcome__footer">
          {{ 'welcome.version' | translate:{ version: version } }} - {{edition}} Edition
        </div>
      </div>
    </div>
  `,
  styles: [`
    .welcome {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      background: var(--paper);
      color: var(--ink);
    }
    .welcome__card {
      width: 100%;
      max-width: 820px;
      padding: 3rem;
    }
    .welcome__head {
      text-align: center;
      margin-bottom: 3rem;
    }
    .welcome__logo {
      margin-bottom: 1.5rem;
      display: flex;
      justify-content: center;
    }
    .welcome__title {
      font-family: 'Lora', serif;
      font-size: 4rem;
      font-weight: 400;
      margin-bottom: 0.5rem;
      letter-spacing: -1px;
    }
    .welcome__tagline {
      font-size: 1.1rem;
      color: var(--ink-soft);
    }
    .welcome__body {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2.5rem;
      align-items: start;
    }
    .welcome__actions {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .welcome__btn {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      padding: 1.5rem;
      border: 1px solid var(--rule);
      border-radius: 8px;
      background: var(--paper-2);
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
    }
    .welcome__btn:hover {
      border-color: var(--ink-mute);
      box-shadow: var(--shadow-md);
      transform: translateY(-2px);
    }
    .welcome__btn--primary {
      background: var(--ink);
      color: var(--paper);
      border-color: var(--ink);
    }
    .welcome__btn--primary:hover {
      background: var(--ink-2);
      border-color: var(--ink-2);
    }
    .welcome__btn-icon {
      font-size: 1.5rem;
    }
    .welcome__btn-text {
      display: flex;
      flex-direction: column;
    }
    .welcome__btn-text strong {
      font-size: 1.1rem;
    }
    .welcome__btn-text span {
      font-size: 0.9rem;
      opacity: 0.7;
    }
    .welcome__footer {
      margin-top: 4rem;
      font-size: 0.8rem;
      color: var(--ink-mute);
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .welcome__recent {
      text-align: left;
    }
    .welcome__recent-title {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--ink-mute);
      margin-bottom: 0.75rem;
    }
    .welcome__recent-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    .welcome__recent-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      border: 1px solid var(--rule);
      border-radius: 6px;
      background: var(--paper-2);
      cursor: pointer;
      transition: all 0.15s ease;
      text-align: left;
      width: 100%;
    }
    .welcome__recent-item:hover {
      border-color: var(--ink-mute);
      box-shadow: var(--shadow-sm);
    }
    .welcome__recent-info {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .welcome__recent-info strong {
      font-size: 0.95rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .welcome__recent-info span {
      font-size: 0.8rem;
      color: var(--ink-mute);
    }
  `]
})
export class WelcomeComponent {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);
  private recentService = inject(RecentProjectsService);
  readonly version = environment.version;
  readonly edition = environment.edition;

  readonly recentProjects = signal<RecentProject[]>(this.recentService.getAll());

  openRecent(p: RecentProject): void {
    this.fileService.openLibriaFileByPath(p.path);
  }

  formatDate(iso: string): string {
    const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR' };
    const locale = localeMap[this.store.personalConfig().language] || 'es-ES';
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
