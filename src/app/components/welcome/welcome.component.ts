import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
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
        <div class="welcome__logo">
          <img src="libria.svg" alt="Libria" class="app-logo">
        </div>
        <h1 class="welcome__title">Libria</h1>
        <p class="welcome__tagline">{{ 'welcome.tagline' | translate }}</p>
        
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
      max-width: 500px;
      width: 100%;
      text-align: center;
      padding: 3rem;
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
      margin-bottom: 3rem;
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
      text-transform: uppercase;
      letter-spacing: 1px;
    }
  `]
})
export class WelcomeComponent {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);
  readonly version = environment.version;
  readonly edition = environment.edition;
}
