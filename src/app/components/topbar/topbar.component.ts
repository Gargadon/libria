import { Component, inject, signal, computed, HostListener } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

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
          <div class="tb__brandV">{{ environment.version }} · Atelier</div>
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

      <!-- NAV FULL (≥1360px) -->
      @if (store.book()) {
        <nav class="tb__nav tb__nav--full">
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
        </nav>
      }

      <div class="tb__right">
        @if (store.book()) {

          <!-- FILE ACTIONS FULL (≥1360px) -->
          <div class="tb__actions tb__actions--full">
            <button class="tb__action" title="Nuevo" (click)="newDoc()"><span class="material-symbols-outlined">note_add</span></button>
            <button class="tb__action" title="Abrir" (click)="openDoc()"><span class="material-symbols-outlined">folder_open</span></button>
            <button class="tb__action" title="Guardar" (click)="saveDoc()"><span class="material-symbols-outlined">save</span></button>
            <button class="tb__action" title="Guardar como" (click)="saveDocAs()"><span class="material-symbols-outlined">save_as</span></button>
          </div>
          <span class="tb__sep tb__sep--full"></span>

          <!-- UNDO/REDO FULL (≥1360px) -->
          <div class="tb__actions tb__actions--full">
            <button class="tb__action" title="Deshacer (Ctrl+Z)" (click)="store.undo()"><span class="material-symbols-outlined">undo</span></button>
            <button class="tb__action" title="Rehacer (Ctrl+Y)" (click)="store.redo()"><span class="material-symbols-outlined">redo</span></button>
          </div>
          <span class="tb__sep tb__sep--full"></span>

          <!-- NAV COMPACT (<1360px) -->
          <div class="tb__compact-menu tb__compact-menu--nav">
            <button class="tb__action" title="Vista" (click)="toggleMenu('nav', $event)">
              <span class="material-symbols-outlined">menu_book</span>
            </button>
            @if (openMenu() === 'nav') {
              <div class="tb__compact-dropdown">
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'manuscript'" (click)="store.setNav('manuscript'); closeMenus()">Manuscrito</button>
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'styles'" (click)="store.setNav('styles'); closeMenus()">Estilos</button>
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'layout'" (click)="store.setNav('layout'); closeMenus()">Maquetar</button>
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'metadata'" (click)="store.setNav('metadata'); closeMenus()">Propiedades</button>
              </div>
            }
          </div>

          <!-- FILE COMPACT (<1360px) -->
          <div class="tb__compact-menu tb__compact-menu--file">
            <button class="tb__action" title="Archivo" (click)="toggleMenu('file', $event)">
              <span class="material-symbols-outlined">folder_open</span>
            </button>
            @if (openMenu() === 'file') {
              <div class="tb__compact-dropdown">
                <button class="tb__compact-item" (click)="newDoc(); closeMenus()">
                  <span class="material-symbols-outlined">note_add</span> Nuevo
                </button>
                <button class="tb__compact-item" (click)="openDoc(); closeMenus()">
                  <span class="material-symbols-outlined">folder_open</span> Abrir
                </button>
                <button class="tb__compact-item" (click)="saveDoc(); closeMenus()">
                  <span class="material-symbols-outlined">save</span> Guardar
                </button>
                <button class="tb__compact-item" (click)="saveDocAs(); closeMenus()">
                  <span class="material-symbols-outlined">save_as</span> Guardar como…
                </button>
              </div>
            }
          </div>

          <!-- UNDO/REDO COMPACT (<1360px) -->
          <div class="tb__compact-menu tb__compact-menu--edit">
            <button class="tb__action" title="Edición" (click)="toggleMenu('edit', $event)">
              <span class="material-symbols-outlined">history</span>
            </button>
            @if (openMenu() === 'edit') {
              <div class="tb__compact-dropdown">
                <button class="tb__compact-item" (click)="store.undo(); closeMenus()">
                  <span class="material-symbols-outlined">undo</span> Deshacer
                </button>
                <button class="tb__compact-item" (click)="store.redo(); closeMenus()">
                  <span class="material-symbols-outlined">redo</span> Rehacer
                </button>
              </div>
            }
          </div>

          <span class="tb__sep"></span>
          <button class="tb__icon" title="Buscar" (click)="store.search(''); store.setNav('search')">
            <span class="material-symbols-outlined">search</span>
          </button>
          <button class="tb__icon" title="Ajustes" (click)="store.setNav('settings')">
            <span class="material-symbols-outlined">settings</span>
          </button>
          <button class="tb__cta" (click)="store.setNav('export')">Generar libro</button>
        }

        <div class="tb__avatar tb__avatar--hideable">
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
  readonly environment = environment;

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
    this.closeMenus();
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

  constructor() {
    const api = (window as any).electronAPI;
    if (api?.onMenuAction) {
      api.onMenuAction((action: string) => {
        switch (action) {
          case 'new':    this.newDoc(); break;
          case 'open':   this.openDoc(); break;
          case 'save':   this.saveDoc(); break;
          case 'saveAs': this.saveDocAs(); break;
          case 'undo':   this.store.undo(); break;
          case 'redo':   this.store.redo(); break;
          case 'search': this.store.search(''); this.store.setNav('search'); break;
        }
      });
    }

    if (api?.onCloseRequested) {
      api.onCloseRequested(() => {
        if (this.store.isDirty()) {
          this.pendingAction.set('close');
          this.showExitModal.set(true);
        } else {
          api.confirmClose();
        }
      });
    }
  }

  docProps() {
    this.store.setNav('metadata');
  }

  // --- COMPACT MENUS ---
  openMenu = signal<'nav' | 'file' | 'edit' | null>(null);

  toggleMenu(menu: 'nav' | 'file' | 'edit', event: MouseEvent) {
    event.stopPropagation();
    this.openMenu.update(current => current === menu ? null : menu);
  }

  closeMenus() {
    this.openMenu.set(null);
  }

  // --- DATA LOSS GUARD LOGIC ---
  showExitModal = signal(false);
  pendingAction = signal<'new' | 'open' | 'close' | null>(null);

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

    const api = (window as any).electronAPI;
    if (action === 'new') this.fileService.newProject();
    else if (action === 'open') this.fileService.openLibriaFile();
    else if (action === 'close') api?.confirmClose();
  }

  async saveAndExit() {
    const action = this.pendingAction();
    await this.fileService.saveLibriaFile();
    this.showExitModal.set(false);
    this.pendingAction.set(null);

    const api = (window as any).electronAPI;
    if (action === 'new') this.fileService.newProject();
    else if (action === 'open') this.fileService.openLibriaFile();
    else if (action === 'close') api?.confirmClose();
  }
}
