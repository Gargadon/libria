import { Component, inject, signal, computed, HostListener, ChangeDetectionStrategy, output, NgZone } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <header class="tb">
      <div class="tb__left">
        <div class="tb__logo">
          <img src="libria.svg" alt="Libria" class="app-logo">
        </div>
        <div class="tb__brand">
          <div class="tb__brandN">Libria</div>
          <div class="tb__brandV">{{ editionLabel }}</div>
        </div>

        @if (showWebMenu) {
          <span class="tb__sep"></span>
          <!-- Full Horizontal Menu Bar (Visible on >= 1360px) -->
          <div class="tb__sysmenu tb__sysmenu--full" (click)="$event.stopPropagation()">
            <!-- Archivo -->
            <div style="position: relative;">
              <div class="tb__sysmenu-item" (click)="toggleIntegrated('file', $event)">
                {{ 'electron.menu.file' | translate }}
              </div>
              @if (activeIntegratedMenu() === 'file') {
                <div class="tb__dropdown">
                  <button class="tb__dropdown-item" (click)="newDoc(); closeIntegrated()">
                    {{ 'electron.menu.fileNew' | translate }}
                  </button>
                  <button class="tb__dropdown-item" (click)="openDoc(); closeIntegrated()">
                    {{ 'electron.menu.fileOpen' | translate }}
                  </button>
                  <button class="tb__dropdown-item" 
                       [class.tb__dropdown-item--disabled]="!store.book()" 
                       (click)="store.book() && saveDoc(); store.book() && closeIntegrated()">
                    {{ 'electron.menu.fileSave' | translate }}
                  </button>
                  <button class="tb__dropdown-item" 
                       [class.tb__dropdown-item--disabled]="!store.book()" 
                       (click)="store.book() && saveDocAs(); store.book() && closeIntegrated()">
                    {{ 'electron.menu.fileSaveAs' | translate }}
                  </button>
                  <div class="tb__dropdown-sep"></div>
                  <button class="tb__dropdown-item" 
                       [class.tb__dropdown-item--disabled]="!store.book()" 
                       (click)="store.book() && closeDoc(); store.book() && closeIntegrated()">
                    {{ 'topbar.closeDoc' | translate }}
                  </button>
                  @if (isElectron) {
                    <div class="tb__dropdown-sep"></div>
                    <button class="tb__dropdown-item" (click)="quitApp(); closeIntegrated()">
                      {{ 'electron.menu.fileQuit' | translate }}
                    </button>
                  }
                </div>
              }
            </div>

            <!-- Editar -->
            <div style="position: relative;">
              <div class="tb__sysmenu-item" 
                   [class.tb__sysmenu-item--disabled]="!store.book()"
                   (click)="store.book() && toggleIntegrated('edit', $event)">
                {{ 'electron.menu.edit' | translate }}
              </div>
              @if (store.book() && activeIntegratedMenu() === 'edit') {
                <div class="tb__dropdown">
                  <button class="tb__dropdown-item" (click)="store.undo(); closeIntegrated()">
                    {{ 'electron.menu.editUndo' | translate }}
                  </button>
                  <button class="tb__dropdown-item" (click)="store.redo(); closeIntegrated()">
                    {{ 'electron.menu.editRedo' | translate }}
                  </button>
                </div>
              }
            </div>

            <!-- Ver -->
            <div style="position: relative;">
              <div class="tb__sysmenu-item" 
                   [class.tb__sysmenu-item--disabled]="!store.book()"
                   (click)="store.book() && toggleIntegrated('view', $event)">
                {{ 'electron.menu.view' | translate }}
              </div>
              @if (store.book() && activeIntegratedMenu() === 'view') {
                <div class="tb__dropdown">
                  <button class="tb__dropdown-item" (click)="store.search(''); store.setNav('search'); closeIntegrated()">
                    {{ 'electron.menu.viewSearch' | translate }}
                  </button>
                </div>
              }
            </div>

            <!-- Ayuda -->
            <div style="position: relative;">
              <div class="tb__sysmenu-item" (click)="toggleIntegrated('help', $event)">
                {{ 'electron.menu.help' | translate }}
              </div>
              @if (activeIntegratedMenu() === 'help') {
                <div class="tb__dropdown">
                  <button class="tb__dropdown-item" (click)="openAbout(); closeIntegrated()">
                    {{ 'electron.menu.helpAbout' | translate }}
                  </button>
                </div>
              }
            </div>
          </div>

          <!-- Hamburger Button (Visible on < 1360px) -->
          <div class="tb__compact-menu tb__sysmenu--compact" (click)="$event.stopPropagation()">
            <button class="tb__action" [attr.title]="'electron.menu.file' | translate" (click)="toggleIntegratedHamburger($event)">
              <span class="material-symbols-outlined">menu</span>
            </button>
            @if (openIntegratedHamburger()) {
              <div class="tb__compact-dropdown" style="left: 0; right: auto; min-width: 240px; max-height: 80vh; overflow-y: auto;">
                <div class="tb__dropdown-header">{{ 'electron.menu.file' | translate }}</div>
                <button class="tb__compact-item" (click)="newDoc(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">note_add</span> {{ 'electron.menu.fileNew' | translate }}
                </button>
                <button class="tb__compact-item" (click)="openDoc(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">folder_open</span> {{ 'electron.menu.fileOpen' | translate }}
                </button>
                <button class="tb__compact-item" 
                        [disabled]="!store.book()" 
                        (click)="store.book() && saveDoc(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">save</span> {{ 'electron.menu.fileSave' | translate }}
                </button>
                <button class="tb__compact-item" 
                        [disabled]="!store.book()" 
                        (click)="store.book() && saveDocAs(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">save_as</span> {{ 'electron.menu.fileSaveAs' | translate }}
                </button>
                <button class="tb__compact-item" 
                        [disabled]="!store.book()" 
                        (click)="store.book() && closeDoc(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">close_fullscreen</span> {{ 'topbar.closeDoc' | translate }}
                </button>
                @if (isElectron) {
                  <button class="tb__compact-item" (click)="quitApp(); closeIntegratedHamburger()">
                    <span class="material-symbols-outlined">logout</span> {{ 'electron.menu.fileQuit' | translate }}
                  </button>
                }

                <div class="tb__dropdown-sep"></div>

                <div class="tb__dropdown-header" [class.tb__dropdown-header--disabled]="!store.book()">{{ 'electron.menu.edit' | translate }}</div>
                <button class="tb__compact-item" 
                        [disabled]="!store.book()" 
                        (click)="store.book() && store.undo(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">undo</span> {{ 'electron.menu.editUndo' | translate }}
                </button>
                <button class="tb__compact-item" 
                        [disabled]="!store.book()" 
                        (click)="store.book() && store.redo(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">redo</span> {{ 'electron.menu.editRedo' | translate }}
                </button>

                <div class="tb__dropdown-sep"></div>

                <div class="tb__dropdown-header" [class.tb__dropdown-header--disabled]="!store.book()">{{ 'electron.menu.view' | translate }}</div>
                <button class="tb__compact-item" 
                        [disabled]="!store.book()" 
                        (click)="store.book() && store.search(''); store.book() && store.setNav('search'); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">search</span> {{ 'electron.menu.viewSearch' | translate }}
                </button>

                <div class="tb__dropdown-sep"></div>

                <div class="tb__dropdown-header">{{ 'electron.menu.help' | translate }}</div>
                <button class="tb__compact-item" (click)="openAbout(); closeIntegratedHamburger()">
                  <span class="material-symbols-outlined">info</span> {{ 'electron.menu.helpAbout' | translate }}
                </button>
              </div>
            }
          </div>
        }

        @if (store.book(); as book) {
          <div class="tb__bookchip">
            <span class="tb__chipBody">
              <span class="tb__chipT">{{ book.title }}</span>
              <span class="tb__chipMeta">{{ displayAuthors() }}</span>
            </span>
          </div>
        }
      </div>

      <!-- NAV FULL (≥1360px) -->
      @if (store.book()) {
        <nav class="tb__nav tb__nav--full">
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'manuscript'"
            (click)="store.setNav('manuscript')">{{ 'topbar.manuscript' | translate }}</button>
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'styles'"
            (click)="store.setNav('styles')">{{ 'topbar.styles' | translate }}</button>
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'layout'"
            (click)="store.setNav('layout')">{{ 'topbar.layout' | translate }}</button>
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'metadata'"
            (click)="store.setNav('metadata')">{{ 'topbar.properties' | translate }}</button>
          <button class="tb__nav__b"
            [class.tb__nav__b--on]="store.ui.activeNav() === 'attachments'"
            (click)="store.setNav('attachments')">{{ 'topbar.attachments' | translate }}</button>
        </nav>
      }

      <div class="tb__right">
        @if (store.book()) {

          <!-- FILE ACTIONS FULL (≥1360px) -->
          <div class="tb__actions tb__actions--full">
            <button class="tb__action" [attr.title]="'topbar.new' | translate" (click)="newDoc()"><span class="material-symbols-outlined">note_add</span></button>
            <button class="tb__action" [attr.title]="'topbar.open' | translate" (click)="openDoc()"><span class="material-symbols-outlined">folder_open</span></button>
            <button class="tb__action" [attr.title]="'topbar.save' | translate" (click)="saveDoc()"><span class="material-symbols-outlined">save</span></button>
            <button class="tb__action" [attr.title]="'topbar.saveAs' | translate" (click)="saveDocAs()"><span class="material-symbols-outlined">save_as</span></button>
            <button class="tb__action" [attr.title]="'topbar.closeDoc' | translate" (click)="closeDoc()"><span class="material-symbols-outlined">close_fullscreen</span></button>
          </div>
          <span class="tb__sep tb__sep--full"></span>

          <!-- UNDO/REDO FULL (≥1360px) -->
          <div class="tb__actions tb__actions--full">
            <button class="tb__action" [attr.title]="'topbar.undo' | translate" (click)="store.undo()"><span class="material-symbols-outlined">undo</span></button>
            <button class="tb__action" [attr.title]="'topbar.redo' | translate" (click)="store.redo()"><span class="material-symbols-outlined">redo</span></button>
          </div>
          <span class="tb__sep tb__sep--full"></span>

          <!-- NAV COMPACT (<1360px) -->
          <div class="tb__compact-menu tb__compact-menu--nav">
            <button class="tb__action" [attr.title]="'topbar.view' | translate" (click)="toggleMenu('nav', $event)">
              <span class="material-symbols-outlined">menu_book</span>
            </button>
            @if (openMenu() === 'nav') {
              <div class="tb__compact-dropdown">
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'manuscript'" (click)="store.setNav('manuscript'); closeMenus()">{{ 'topbar.manuscript' | translate }}</button>
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'styles'" (click)="store.setNav('styles'); closeMenus()">{{ 'topbar.styles' | translate }}</button>
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'layout'" (click)="store.setNav('layout'); closeMenus()">{{ 'topbar.layout' | translate }}</button>
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'metadata'" (click)="store.setNav('metadata'); closeMenus()">{{ 'topbar.properties' | translate }}</button>
                <button class="tb__compact-item" [class.tb__compact-item--on]="store.ui.activeNav() === 'attachments'" (click)="store.setNav('attachments'); closeMenus()">{{ 'topbar.attachments' | translate }}</button>
              </div>
            }
          </div>

          <!-- FILE COMPACT (<1360px) -->
          <div class="tb__compact-menu tb__compact-menu--file">
            <button class="tb__action" [attr.title]="'topbar.file' | translate" (click)="toggleMenu('file', $event)">
              <span class="material-symbols-outlined">folder_open</span>
            </button>
            @if (openMenu() === 'file') {
              <div class="tb__compact-dropdown">
                <button class="tb__compact-item" (click)="newDoc(); closeMenus()">
                  <span class="material-symbols-outlined">note_add</span> {{ 'topbar.new' | translate }}
                </button>
                <button class="tb__compact-item" (click)="openDoc(); closeMenus()">
                  <span class="material-symbols-outlined">folder_open</span> {{ 'topbar.open' | translate }}
                </button>
                <button class="tb__compact-item" (click)="saveDoc(); closeMenus()">
                  <span class="material-symbols-outlined">save</span> {{ 'topbar.save' | translate }}
                </button>
                <button class="tb__compact-item" (click)="saveDocAs(); closeMenus()">
                  <span class="material-symbols-outlined">save_as</span> {{ 'topbar.saveAs' | translate }}
                </button>
                <button class="tb__compact-item" (click)="closeDoc(); closeMenus()">
                  <span class="material-symbols-outlined">close_fullscreen</span> {{ 'topbar.closeDoc' | translate }}
                </button>
              </div>
            }
          </div>

          <!-- UNDO/REDO COMPACT (<1360px) -->
          <div class="tb__compact-menu tb__compact-menu--edit">
            <button class="tb__action" [attr.title]="'topbar.edit' | translate" (click)="toggleMenu('edit', $event)">
              <span class="material-symbols-outlined">history</span>
            </button>
            @if (openMenu() === 'edit') {
              <div class="tb__compact-dropdown">
                <button class="tb__compact-item" (click)="store.undo(); closeMenus()">
                  <span class="material-symbols-outlined">undo</span> {{ 'topbar.undo' | translate }}
                </button>
                <button class="tb__compact-item" (click)="store.redo(); closeMenus()">
                  <span class="material-symbols-outlined">redo</span> {{ 'topbar.redo' | translate }}
                </button>
              </div>
            }
          </div>

          <button class="tb__icon" [attr.title]="'topbar.search' | translate" (click)="store.search(''); store.setNav('search')">
            <span class="material-symbols-outlined">search</span>
          </button>
          <button class="tb__icon" [attr.title]="'topbar.preview' | translate" (click)="store.togglePreview()" [class.tb__icon--on]="store.ui.previewOpen()">
            <span class="material-symbols-outlined">{{ store.ui.previewOpen() ? 'visibility' : 'visibility_off' }}</span>
          </button>
          <button class="tb__icon" [attr.title]="'topbar.zenMode' | translate" (click)="store.toggleZenMode()" [class.tb__icon--on]="store.ui.zenMode()">
            <span class="material-symbols-outlined">{{ store.ui.zenMode() ? 'fullscreen_exit' : 'fullscreen' }}</span>
          </button>
          <button class="tb__icon" [attr.title]="'topbar.settings' | translate" (click)="store.setNav('settings')">
            <span class="material-symbols-outlined">settings</span>
          </button>
          <button class="tb__cta" (click)="store.setNav('export')">{{ 'topbar.export' | translate }}</button>
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
          <div class="exit-modal__title">{{ 'topbar.unsavedTitle' | translate }}</div>
          <div class="exit-modal__body">{{ 'topbar.unsavedBody' | translate }}</div>
          <div class="exit-modal__actions">
            <button class="exit-modal__btn" (click)="cancelExit()">{{ 'topbar.cancel' | translate }}</button>
            <button class="exit-modal__btn exit-modal__btn--danger" (click)="exitWithoutSaving()">{{ 'topbar.discard' | translate }}</button>
            <button class="exit-modal__btn exit-modal__btn--primary" (click)="saveAndExit()">{{ 'topbar.saveAndExit' | translate }}</button>
          </div>
        </div>
      </div>
    }
  `
})
export class TopbarComponent {
  readonly store = inject(BookStore);
  readonly fileService = inject(FileService);
  readonly translate = inject(TranslateService);
  readonly environment = environment;
  readonly editionLabel = `${environment.version} · ${environment.edition}`;

  readonly displayAuthors = computed(() => {
    const book = this.store.book();
    if (!book) return '';

    const list = (book.authors && book.authors.length > 0) ? book.authors : [book.author];
    const filtered = list.filter(a => !!a && a.trim() !== '');

    if (filtered.length === 0) return this.translate.instant('topbar.noAuthor');
    if (filtered.length === 1) return filtered[0];
    return `${filtered[0]} ${this.translate.instant('topbar.etAl')}`;
  });

  @HostListener('document:click')
  onDocumentClick() {
    this.closeMenus();
    this.closeIntegrated();
    this.closeIntegratedHamburger();
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

  closeDoc() {
    if (this.store.isDirty()) {
      this.pendingAction.set('close-doc');
      this.showExitModal.set(true);
    } else {
      this.fileService.closeProject();
    }
  }

  private readonly ngZone = inject(NgZone);

  constructor() {
    const api = (window as any).electronAPI;
    if (api?.onMenuAction) {
      api.onMenuAction((action: string) => {
        this.ngZone.run(() => {
          switch (action) {
            case 'new': this.newDoc(); break;
            case 'open': this.openDoc(); break;
            case 'save': this.saveDoc(); break;
            case 'saveAs': this.saveDocAs(); break;
            case 'close': this.closeDoc(); break;
            case 'undo': this.store.undo(); break;
            case 'redo': this.store.redo(); break;
            case 'search': this.store.search(''); this.store.setNav('search'); break;
          }
        });
      });
    }

    if (api?.onCloseRequested) {
      api.onCloseRequested(() => {
        this.ngZone.run(() => {
          if (this.store.isDirty()) {
            this.pendingAction.set('close');
            this.showExitModal.set(true);
          } else {
            api.confirmClose();
          }
        });
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

  // --- INTEGRATED FALLBACK MENU ---
  aboutRequested = output<void>();
  readonly isElectron = !!(window as any).electronAPI;
  readonly showWebMenu = (() => {
    const api = (window as any).electronAPI;
    if (!api) return true;
    return !!api.useIntegratedMenu;
  })();

  activeIntegratedMenu = signal<'file' | 'edit' | 'view' | 'help' | null>(null);

  toggleIntegrated(menu: 'file' | 'edit' | 'view' | 'help', event: MouseEvent) {
    event.stopPropagation();
    this.activeIntegratedMenu.update(current => current === menu ? null : menu);
  }

  closeIntegrated() {
    this.activeIntegratedMenu.set(null);
  }

  openAbout() {
    this.aboutRequested.emit();
  }

  quitApp() {
    if (this.store.isDirty()) {
      this.pendingAction.set('close');
      this.showExitModal.set(true);
    } else {
      const api = (window as any).electronAPI;
      if (api?.confirmClose) {
        api.confirmClose();
      }
    }
  }

  // --- INTEGRATED COMPACT HAMBURGER MENU ---
  openIntegratedHamburger = signal(false);

  toggleIntegratedHamburger(event: MouseEvent) {
    event.stopPropagation();
    this.openIntegratedHamburger.update(current => !current);
  }

  closeIntegratedHamburger() {
    this.openIntegratedHamburger.set(false);
  }

  // --- DATA LOSS GUARD LOGIC ---
  showExitModal = signal(false);
  pendingAction = signal<'new' | 'open' | 'close' | 'close-doc' | null>(null);

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
    else if (action === 'close-doc') this.fileService.closeProject();
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
    else if (action === 'close-doc') this.fileService.closeProject();
  }
}
