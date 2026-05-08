import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="tb">
      <div class="tb__left">
        <div class="tb__logo">
          <svg viewBox="0 0 28 28" width="22" height="22">
            <rect x="2" y="2" width="24" height="24" rx="4" fill="#1a1612"/>
            <path d="M14 6l4.5 7-1 7.5-3.5 2.5-3.5-2.5-1-7.5z" fill="none" stroke="#f5efe4" stroke-width="1.2" stroke-linejoin="round"/>
            <path d="M14 14.5v7" fill="none" stroke="#f5efe4" stroke-width="1.2" stroke-linecap="round"/>
            <circle cx="14" cy="13.5" r="1.2" fill="#f5efe4"/>
          </svg>
        </div>
        <div class="tb__brand">
          <div class="tb__brandN">Libria</div>
          <div class="tb__brandV">2.4 · Atelier</div>
        </div>
        
        @if (store.book(); as book) {
          <div class="tb__bookchip">
            <span class="tb__chipBadge">{{ titleInitials() }}</span>
            <span class="tb__chipT">{{ book.title }}</span>
            <span class="tb__chipMeta">{{ displayAuthors() }}</span>
            <span class="tb__chipChev">▾</span>
          </div>
        }
      </div>

      @if (store.book()) {
        <nav class="tb__nav">
          <button class="tb__nav__b" 
            [class.tb__nav__b--on]="store.ui.activeNav() === 'manuscript'"
            (click)="store.setNav('manuscript')">Manuscrito</button>
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'styles'"
            (click)="store.setNav('styles')">Estilos</button>
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'layout'"
            (click)="store.setNav('layout')">Maquetar</button>
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'metadata'"
            (click)="store.setNav('metadata')">Propiedades</button>
          <!-- 
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'export'"
            (click)="store.setNav('export')">Generar</button>
          -->
        </nav>
      }

      <div class="tb__right">
        @if (store.book()) {
          <div class="tb__actions">
            <button class="tb__action" title="Nuevo" (click)="newDoc()"><span class="material-symbols-outlined">note_add</span></button>
            <button class="tb__action" title="Abrir" (click)="openDoc()"><span class="material-symbols-outlined">folder_open</span></button>
            <button class="tb__action" title="Guardar" (click)="saveDoc()"><span class="material-symbols-outlined">save</span></button>
            <button class="tb__action" title="Guardar como" (click)="saveDocAs()"><span class="material-symbols-outlined">save_as</span></button>
          </div>
          <span class="tb__sep"></span>
          <div class="tb__actions">
            <button class="tb__action" title="Deshacer (Ctrl+Z)" (click)="store.undo()"><span class="material-symbols-outlined">undo</span></button>
            <button class="tb__action" title="Rehacer (Ctrl+Y)" (click)="store.redo()"><span class="material-symbols-outlined">redo</span></button>
          </div>
          <span class="tb__sep"></span>
          <button class="tb__icon" title="Buscar" (click)="store.search(''); store.setNav('search')">
            <svg width="16" height="16" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M11 11l3 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
          <button class="tb__icon" title="Ajustes" (click)="store.setNav('settings')">
            <span class="material-symbols-outlined">settings</span>
          </button>
          <!-- <button class="tb__cta" (click)="store.setNav('export')">Generar libro</button> -->
        }
        <div class="tb__avatar">
          @if (store.personalConfig().avatar; as avatar) {
            <img [src]="avatar" alt="Avatar">
          } @else {
            M
          }
        </div>
      </div>
    </header>

    @if (showExitModal()) {
      <div class="exit-modal-backdrop">
        <div class="exit-modal">
          <div class="exit-modal__title">Cambios sin guardar</div>
          <div class="exit-modal__body">¿Deseas guardar los cambios antes de continuar? Si no lo haces, se perderán las modificaciones recientes.</div>
          <div class="exit-modal__actions">
            <button class="exit-modal__btn" (click)="cancelExit()">Cancelar</button>
            <button class="exit-modal__btn exit-modal__btn--danger" (click)="exitWithoutSaving()">Descartar</button>
            <button class="exit-modal__btn exit-modal__btn--primary" (click)="saveAndExit()">Guardar</button>
          </div>
        </div>
      </div>
    }
  `
})
export class TopbarComponent {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);

  readonly displayAuthors = computed(() => {
    const book = this.store.book();
    if (!book) return '';
    
    const list = (book.authors && book.authors.length > 0) ? book.authors : [book.author];
    const filtered = list.filter(a => !!a && a.trim() !== '');
    
    if (filtered.length === 0) return 'Sin autor';
    if (filtered.length === 1) return filtered[0];
    return `${filtered[0]} et al.`;
  });

  readonly titleInitials = computed(() => {
    const title = this.store.book()?.title || '';
    const words = title.trim().split(/\s+/).filter(w => w.length > 0);
    return words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
  });

  @HostListener('document:click')
  onDocumentClick() {
  }

  newDoc() {
    if (this.store.isDirty()) {
      this.pendingAction.set('new');
      this.showExitModal.set(true);
    } else {
      this.fileService.newProject();
    }
  }

  openDoc() {
    if (this.store.isDirty()) {
      this.pendingAction.set('open');
      this.showExitModal.set(true);
    } else {
      this.fileService.openLibriaFile();
    }
  }

  saveDoc() {
    if (!this.store.book()) return;
    this.fileService.saveLibriaFile();
  }

  saveDocAs() {
    if (!this.store.book()) return;
    this.fileService.saveLibriaFile(true);
  }

  @HostListener('window:keydown', ['$event'])
  onGlobalKeyDown(event: KeyboardEvent) {
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (ctrl && key === 's') {
      event.preventDefault();
      if (event.shiftKey) {
        this.saveDocAs();
      } else {
        this.saveDoc();
      }
      return;
    }
  }

  docProps() {
    this.store.setNav('metadata');
  }

  // --- DATA LOSS GUARD LOGIC ---
  showExitModal = signal(false);
  pendingAction = signal<'new' | 'open' | null>(null);

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: BeforeUnloadEvent) {
    if (this.store.isDirty()) {
      $event.preventDefault();
      $event.returnValue = true;
    }
  }

  cancelExit() {
    this.showExitModal.set(false);
    this.pendingAction.set(null);
  }

  exitWithoutSaving() {
    const action = this.pendingAction();
    this.showExitModal.set(false);
    this.pendingAction.set(null);
    
    if (action === 'new') this.fileService.newProject();
    if (action === 'open') this.fileService.openLibriaFile();
  }

  async saveAndExit() {
    const action = this.pendingAction();
    await this.fileService.saveLibriaFile();
    this.showExitModal.set(false);
    this.pendingAction.set(null);

    if (action === 'new') this.fileService.newProject();
    if (action === 'open') this.fileService.openLibriaFile();
  }
}
