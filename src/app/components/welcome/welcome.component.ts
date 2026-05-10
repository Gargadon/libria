import { Component, inject } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="welcome">
      <div class="welcome__card">
        <div class="welcome__logo">
          <svg viewBox="0 0 28 28" width="64" height="64">
            <rect x="2" y="2" width="24" height="24" rx="4" fill="#1a1612"/>
            <path d="M14 6l4.5 7-1 7.5-3.5 2.5-3.5-2.5-1-7.5z" fill="none" stroke="#f5efe4" stroke-width="1.2" stroke-linejoin="round"/>
            <path d="M14 14.5v7" fill="none" stroke="#f5efe4" stroke-width="1.2" stroke-linecap="round"/>
            <circle cx="14" cy="13.5" r="1.2" fill="#f5efe4"/>
          </svg>
        </div>
        <h1 class="welcome__title">Libria</h1>
        <p class="welcome__tagline">Tu próxima gran historia empieza aquí.</p>
        
        <div class="welcome__actions">
          <button class="welcome__btn welcome__btn--primary" (click)="store.createNewProject()">
            <span class="material-symbols-outlined">add</span>
            <div class="welcome__btn-text">
              <strong>Crear nuevo proyecto</strong>
              <span>Empieza un nuevo libro desde cero</span>
            </div>
          </button>
          
          <button class="welcome__btn" (click)="fileService.openLibriaFile()">
            <span class="material-symbols-outlined">file_open</span>
            <div class="welcome__btn-text">
              <strong>Abrir proyecto existente</strong>
              <span>Carga un archivo .libria desde tu computadora</span>
            </div>
          </button>
        </div>
        
        <div class="welcome__footer">
          Versión {{ version }}
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
      background: var(--bg-paper, #f9f7f2);
      color: #333;
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
      color: #666;
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
      border: 1px solid #ddd;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      text-align: left;
      transition: all 0.2s ease;
    }
    .welcome__btn:hover {
      border-color: #999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05);
      transform: translateY(-2px);
    }
    .welcome__btn--primary {
      background: #333;
      color: white;
      border-color: #333;
    }
    .welcome__btn--primary:hover {
      background: #000;
      border-color: #000;
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
      color: #999;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
  `]
})
export class WelcomeComponent {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);
  readonly version = environment.version;
}
