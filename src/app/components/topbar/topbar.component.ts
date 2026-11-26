import { Component, inject, signal, computed, HostListener, ChangeDetectionStrategy, DestroyRef, output, NgZone, Injector, afterNextRender } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { FileService } from '../../services/file.service';
import { CommonModule, DOCUMENT } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { PomodoroService } from '../../services/pomodoro.service';
import { RecoveryService } from '../../services/recovery.service';
import { ReviewService } from '../../services/review.service';
import { GoogleDriveService } from '../../services/google-drive.service';
import { ImportService } from '../../services/import.service';
import { ChapterKind, ChapterTemplateId } from '../../models/book.models';

type TopbarMenu = 'file' | 'edit' | 'view' | 'tools' | 'help';

@Component({
  selector: 'app-topbar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <header class="tb">
      <div class="tb__leading">
        <div class="tb__identity">
          <div class="tb__logo">
            <img src="libria.svg" alt="" class="app-logo">
          </div>
          <div class="tb__brandN">Libria</div>
        </div>
        <nav class="tb__menu-bar" [attr.aria-label]="'topbar.mainMenu' | translate">
          @for (menu of menus; track menu.id) {
            <div class="tb__menu" (focusout)="onMenuBlur(menu.id, $event)">
              <button type="button" class="tb__menu-trigger" #trigger
                [attr.aria-expanded]="openMenu() === menu.id"
                [attr.aria-controls]="openMenu() === menu.id ? 'menu-' + menu.id : null"
                (click)="toggleMenu(menu.id, $event)"
                (keydown)="onMenuTriggerKeydown(menu.id, $event)">
                {{ menu.label | translate }}
              </button>
              @if (openMenu() === menu.id) {
                <div class="tb__dropdown" [id]="'menu-' + menu.id"
                  (click)="completeMenu(trigger)" (keydown)="onMenuKeydown($event, trigger)"
                  (scroll)="positionAddOptions()">
                  @switch (menu.id) {
                    @case ('file') {
                      <button type="button" class="tb__menu-action" (click)="newDoc()">
                        <span class="material-symbols-outlined" aria-hidden="true">note_add</span>
                        <span>{{ 'topbar.new' | translate }}</span>
                      </button>
                      <button type="button" class="tb__menu-action" (click)="openDoc()">
                        <span class="material-symbols-outlined" aria-hidden="true">folder_open</span>
                        <span>{{ 'topbar.open' | translate }}</span>
                      </button>
                      <button type="button" class="tb__menu-action" [disabled]="importService.importing()"
                        (click)="importInput.click()">
                        <span class="material-symbols-outlined" aria-hidden="true">upload_file</span>
                        <span>{{ 'sidebar.importFile' | translate }}</span>
                      </button>
                      @if (drive.available) {
                        <button type="button" class="tb__menu-action" (click)="drive.show()">
                          <span class="material-symbols-outlined" aria-hidden="true">cloud</span>
                          <span>{{ 'drive.open' | translate }}</span>
                        </button>
                      }
                      <hr />
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()" (click)="saveDoc()">
                        <span class="material-symbols-outlined" aria-hidden="true">save</span>
                        <span>{{ 'topbar.save' | translate }}</span>
                      </button>
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()" (click)="saveDocAs()">
                        <span class="material-symbols-outlined" aria-hidden="true">save_as</span>
                        <span>{{ 'topbar.saveAs' | translate }}</span>
                      </button>
                      @if (drive.available) {
                        <button type="button" class="tb__menu-action" [disabled]="!store.book() || drive.busy()"
                          (click)="drive.saveToDrive()">
                          <span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span>
                          <span>{{ 'drive.saveToDrive' | translate }}</span>
                        </button>
                      }
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()" (click)="store.setNav('export')">
                        <span class="material-symbols-outlined" aria-hidden="true">publish</span>
                        <span>{{ 'topbar.export' | translate }}</span>
                      </button>
                      <hr />
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()" (click)="closeDoc()">
                        <span class="material-symbols-outlined" aria-hidden="true">close_fullscreen</span>
                        <span>{{ 'topbar.closeDoc' | translate }}</span>
                      </button>
                      @if (isDesktop) {
                        <button type="button" class="tb__menu-action" (click)="quitApp()">
                          <span class="material-symbols-outlined" aria-hidden="true">logout</span>
                          <span>{{ 'electron.menu.fileQuit' | translate }}</span>
                        </button>
                      }
                    }
                    @case ('edit') {
                      <button type="button" class="tb__menu-action" [disabled]="!canUndo()" (click)="store.undo()">
                        <span class="material-symbols-outlined" aria-hidden="true">undo</span>
                        <span>{{ 'electron.menu.editUndo' | translate }}</span>
                      </button>
                      <button type="button" class="tb__menu-action" [disabled]="!canRedo()" (click)="store.redo()">
                        <span class="material-symbols-outlined" aria-hidden="true">redo</span>
                        <span>{{ 'electron.menu.editRedo' | translate }}</span>
                      </button>
                      <hr />
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()" (click)="openSearch()">
                        <span class="material-symbols-outlined" aria-hidden="true">search</span>
                        <span>{{ 'electron.menu.viewSearch' | translate }}</span>
                      </button>
                      <hr />
                      <button type="button" class="tb__menu-action" (click)="openSettings(trigger)">
                        <span class="material-symbols-outlined" aria-hidden="true">settings</span>
                        <span>{{ 'topbar.settings' | translate }}</span>
                      </button>
                    }
                    @case ('view') {
                      <ng-container *ngTemplateOutlet="panels; context: { items: viewPanels }"></ng-container>
                      <hr />
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()"
                        [class.tb__menu-action--on]="store.ui.previewOpen()" [attr.aria-pressed]="store.ui.previewOpen()"
                        (click)="store.togglePreview()">
                        <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
                        <span>{{ 'topbar.preview' | translate }}</span>
                      </button>
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()"
                        (click)="store.toggleZenMode()">
                        <span class="material-symbols-outlined" aria-hidden="true">fullscreen</span>
                        <span>{{ 'topbar.zenMode' | translate }}</span>
                      </button>
                    }
                    @case ('tools') {
                      <button id="menu-add-trigger" type="button" class="tb__menu-action tb__add-toggle" [disabled]="!store.book()"
                        [attr.aria-expanded]="showAddOptions()"
                        [attr.aria-controls]="showAddOptions() ? 'menu-add-element' : null"
                        (click)="$event.stopPropagation(); setAddOptions(!showAddOptions())"
                        (keydown.arrowright)="openAddOptionsWithKeyboard($event)">
                        <span class="material-symbols-outlined" aria-hidden="true">add_circle</span>
                        <span>{{ 'sidebar.addElement' | translate }}</span>
                        <span class="material-symbols-outlined" aria-hidden="true">{{ addOptionsPosition()?.opensLeft ? 'chevron_left' : 'chevron_right' }}</span>
                      </button>
                      @if (showAddOptions()) {
                        <div id="menu-add-element" class="tb__submenu" [style.left.px]="addOptionsPosition()?.left"
                          [style.top.px]="addOptionsPosition()?.top"
                          [style.opacity]="addOptionsPosition() ? 1 : 0">
                          @for (item of chapterOptions; track item.kind) {
                            <button type="button" class="tb__menu-action" (click)="addElement(item.kind)">
                              <span class="material-symbols-outlined" aria-hidden="true">{{ item.icon }}</span>
                              <span>{{ item.label | translate }}</span>
                            </button>
                          }
                          <div class="tb__menu-section-label">{{ 'sidebar.preliminares' | translate }}</div>
                          @for (template of chapterTemplates; track template.id) {
                            <button type="button" class="tb__menu-action" (click)="addElement('front', template.id)">
                              <span class="material-symbols-outlined" aria-hidden="true">{{ template.icon }}</span>
                              <span>{{ template.label | translate }}</span>
                            </button>
                          }
                        </div>
                      }
                      <hr />
                      <ng-container *ngTemplateOutlet="panels; context: { items: toolPanels }"></ng-container>
                      <hr />
                      <button type="button" class="tb__menu-action" (click)="recovery.show()">
                        <span class="material-symbols-outlined" aria-hidden="true">history</span>
                        <span>{{ 'recovery.title' | translate }}</span>
                      </button>
                      <button type="button" class="tb__menu-action" [disabled]="!store.book()" (click)="review.show()">
                        <span class="material-symbols-outlined" aria-hidden="true">rate_review</span>
                        <span>{{ 'review.title' | translate }}</span>
                      </button>
                    }
                    @case ('help') {
                      <button type="button" class="tb__menu-action" (click)="aboutRequested.emit()">
                        <span class="material-symbols-outlined" aria-hidden="true">info</span>
                        <span>{{ 'electron.menu.helpAbout' | translate }}</span>
                      </button>
                    }
                  }
                </div>
              }
            </div>
          }
        </nav>
      </div>

      <div class="tb__bookchip">
        @if (store.book(); as book) {
          <span class="tb__chipT" [attr.title]="book.title">{{ book.title }}</span>
          <span class="tb__chipMeta">{{ displayAuthors() }}</span>
        }
      </div>

      <div class="tb__right">
        @if (store.book()) {
          <button type="button" class="tb__icon tb__save" [attr.title]="'topbar.save' | translate"
            [attr.aria-label]="'topbar.save' | translate" (click)="saveDoc()">
            <span class="material-symbols-outlined" aria-hidden="true">save</span>
          </button>
          @if (drive.available && fileService.driveLink()) {
            @let driveLabel = ('drive.state.' + fileService.syncState()) | translate;
            <button type="button" class="tb__icon tb__drive" [attr.title]="driveLabel"
              [attr.aria-label]="driveLabel" (click)="drive.show()">
              <span class="material-symbols-outlined" aria-hidden="true">{{ fileService.syncState() === 'conflict' ? 'warning' : fileService.syncState() === 'working' ? 'sync' : fileService.syncState() === 'pending' ? 'cloud_off' : 'cloud_done' }}</span>
            </button>
          }
          <button type="button" class="tb__icon tb__preview" [attr.title]="'topbar.preview' | translate"
            [attr.aria-label]="'topbar.preview' | translate" [attr.aria-pressed]="store.ui.previewOpen()"
            [class.tb__icon--on]="store.ui.previewOpen()" (click)="store.togglePreview()">
            <span class="material-symbols-outlined" aria-hidden="true">{{ store.ui.previewOpen() ? 'visibility' : 'visibility_off' }}</span>
          </button>
        <div class="tb__pomodoro-widget" (click)="$event.stopPropagation()" (keydown.escape)="dismissMenu($event, timerButton)">
          <button #timerButton type="button" class="tb__pomodoro-btn"
                  [class.tb__pomodoro-btn--active]="pomo.isActive()"
                  [class.tb__pomodoro-btn--focus]="pomo.mode() === 'focus'"
                  [class.tb__pomodoro-btn--break]="pomo.mode() !== 'focus'"
                  [attr.title]="'Pomodoro'"
                  [attr.aria-expanded]="openMenu() === 'pomodoro'"
                  (click)="toggleMenu('pomodoro', $event)">
            <span class="material-symbols-outlined" style="font-size: 18px;" [style.color]="pomo.isActive() ? 'var(--accent)' : 'inherit'">{{ pomo.isActive() ? 'timer' : 'timer_off' }}</span>
            <span class="tb__pomodoro-time" style="font-size: 12px; font-weight: bold; font-family: var(--ui); font-variant-numeric: tabular-nums;">{{ pomo.getFormattedTime() }}</span>
          </button>
          @if (openMenu() === 'pomodoro') {
            <div class="tb__popover tb__pomodoro-dropdown" style="right: 0; left: auto; min-width: 220px; padding: 12px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); border: 1px solid var(--rule); background: var(--paper); color: var(--ink);">
              <div class="tb__pomo-title" style="margin-bottom: 8px; display: flex; justify-content: center;">
                @if (pomo.mode() === 'focus') {
                  <span class="tb__pomo-badge tb__pomo-badge--focus" style="background: var(--accent); color: var(--paper); padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase;">{{ 'pomodoro.focusing' | translate }}</span>
                } @else if (pomo.mode() === 'short-break') {
                  <span class="tb__pomo-badge tb__pomo-badge--break" style="background: #10b981; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase;">{{ 'pomodoro.shortBreak' | translate }}</span>
                } @else {
                  <span class="tb__pomo-badge tb__pomo-badge--break" style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; text-transform: uppercase;">{{ 'pomodoro.longBreak' | translate }}</span>
                }
              </div>

              <div class="tb__pomo-timer-display" style="font-size: 32px; font-weight: bold; text-align: center; margin: 12px 0; font-family: var(--ui); font-variant-numeric: tabular-nums; letter-spacing: 1px;">{{ pomo.getFormattedTime() }}</div>

              <div class="tb__pomo-controls" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">
                @if (!pomo.isActive()) {
                  <button class="sb__btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px;" (click)="pomo.start()">
                    <span class="material-symbols-outlined" style="font-size: 18px;">play_arrow</span> {{ 'pomodoro.start' | translate }}
                  </button>
                } @else {
                  <button class="sb__btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; background: #ef4444; border-color: #ef4444;" (click)="pomo.pause()">
                    <span class="material-symbols-outlined" style="font-size: 18px;">pause</span> {{ 'pomodoro.pause' | translate }}
                  </button>
                }
                <button class="tb__pomo-btn-secondary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 4px; padding: 6px; background: none; border: 1px solid var(--rule); border-radius: 4px; cursor: pointer; color: var(--ink); font-family: inherit; font-size: 12px;" (click)="pomo.reset()">
                  <span class="material-symbols-outlined" style="font-size: 16px;">restart_alt</span> {{ 'pomodoro.reset' | translate }}
                </button>
              </div>

              <div class="tb__dropdown-sep" style="margin: 8px 0; height: 1px; background: var(--rule);"></div>

              <div class="tb__pomo-mode-select" style="display: flex; gap: 4px; margin-bottom: 12px;">
                <button class="tb__pomo-mode-btn" style="flex: 1; padding: 4px; font-size: 10px; border-radius: 4px; border: 1px solid var(--rule); cursor: pointer;" [style.background]="pomo.mode() === 'focus' ? 'var(--accent)' : 'none'" [style.color]="pomo.mode() === 'focus' ? 'var(--paper)' : 'var(--ink)'" (click)="pomo.setMode('focus')">{{ 'pomodoro.modeFocus' | translate }}</button>
                <button class="tb__pomo-mode-btn" style="flex: 1; padding: 4px; font-size: 10px; border-radius: 4px; border: 1px solid var(--rule); cursor: pointer;" [style.background]="pomo.mode() === 'short-break' ? '#10b981' : 'none'" [style.color]="pomo.mode() === 'short-break' ? 'white' : 'var(--ink)'" (click)="pomo.setMode('short-break')">{{ 'pomodoro.modeShort' | translate }}</button>
                <button class="tb__pomo-mode-btn" style="flex: 1; padding: 4px; font-size: 10px; border-radius: 4px; border: 1px solid var(--rule); cursor: pointer;" [style.background]="pomo.mode() === 'long-break' ? '#3b82f6' : 'none'" [style.color]="pomo.mode() === 'long-break' ? 'white' : 'var(--ink)'" (click)="pomo.setMode('long-break')">{{ 'pomodoro.modeLong' | translate }}</button>
              </div>

              <div class="tb__pomo-stats" style="font-size: 10px; text-align: center; color: var(--ink-mute);">
                {{ 'pomodoro.completedSessions' | translate }}: <strong>{{ pomo.focusCount() }}</strong>
              </div>
            </div>
          }
        </div>

        } @else {
          <button type="button" class="tb__icon" [attr.title]="'topbar.settings' | translate"
            [attr.aria-label]="'topbar.settings' | translate" aria-haspopup="dialog"
            (mousedown)="$event.preventDefault()" (click)="settingsRequested.emit()">
            <span class="material-symbols-outlined" aria-hidden="true">settings</span>
          </button>
        }
      </div>
    </header>

    <input #importInput type="file" accept=".docx,.txt" hidden (change)="onImportFile(importInput)" />
    @if (importService.importing() || importService.warnings().length) {
      <div class="tb__import-report" role="status">
        @if (importService.importing()) {
          {{ 'importReport.importing' | translate }}
        } @else {
          <div class="tb__import-heading">
            <strong>{{ 'importReport.title' | translate }}</strong>
            <button type="button" class="exit-modal__btn" (click)="importService.warnings.set([])">
              {{ 'recovery.close' | translate }}
            </button>
          </div>
          <ul>
            @for (warning of importService.warnings(); track $index) {
              <li>{{ warning }}</li>
            }
          </ul>
        }
      </div>
    }

    <ng-template #panels let-items="items">
      @for (panel of items; track panel.id) {
        <button type="button" class="tb__menu-action" [disabled]="!store.book()"
          [class.tb__menu-action--on]="store.ui.sidebarOpen() && store.ui.activeNav() === panel.id"
          (click)="store.setNav(panel.id)">
          <span class="material-symbols-outlined" aria-hidden="true">{{ panel.icon }}</span>
          <span>{{ panel.label | translate }}</span>
        </button>
      }
    </ng-template>

    @if (showSaveLocation()) {
      <div class="exit-modal-backdrop">
        <div class="exit-modal" role="dialog" aria-modal="true" aria-labelledby="save-location-title" (keydown.escape)="showSaveLocation.set(false); $event.stopPropagation()">
          <div id="save-location-title" class="exit-modal__title">{{ 'drive.chooseLocation' | translate }}</div>
          <div class="exit-modal__body">{{ 'drive.chooseLocationHint' | translate }}</div>
          <div class="exit-modal__actions">
            <button class="exit-modal__btn" (click)="showSaveLocation.set(false)">{{ 'drive.cancel' | translate }}</button>
            <button class="exit-modal__btn" (click)="saveLocally()">{{ 'drive.thisDevice' | translate }}</button>
            <button class="exit-modal__btn exit-modal__btn--primary" (click)="showSaveLocation.set(false); drive.beginUpload()">Google Drive</button>
          </div>
        </div>
      </div>
    }
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
  readonly recovery = inject(RecoveryService);
  readonly review = inject(ReviewService);
  readonly store = inject(BookStore);
  readonly drive = inject(GoogleDriveService);
  readonly fileService = inject(FileService);
  readonly translate = inject(TranslateService);
  readonly canUndo = computed(() => !!this.store.book() && this.store.past().length > 0);
  readonly canRedo = computed(() => !!this.store.book() && this.store.future().length > 0);

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
    this.closeMenu();
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
    if (this.drive.available && !this.fileService.currentPath && !this.fileService.driveLink()) {
      this.saveAsRequested = false;
      this.showSaveLocation.set(true);
      return;
    }
    this.fileService.saveLibriaFile();
  }

  saveDocAs() {
    if (!this.store.book()) return;
    if (this.drive.available) {
      this.saveAsRequested = true;
      this.showSaveLocation.set(true);
      return;
    }
    this.fileService.saveLibriaFile(true);
  }

  readonly showSaveLocation = signal(false);
  private saveAsRequested = false;
  saveLocally() {
    this.showSaveLocation.set(false);
    void this.fileService.saveLibriaFile(this.saveAsRequested);
  }

  closeDoc() {
    if (!this.store.book()) return;
    if (this.store.isDirty()) {
      this.pendingAction.set('close-doc');
      this.showExitModal.set(true);
    } else {
      this.fileService.closeProject();
    }
  }

  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  @HostListener('document:keydown', ['$event'])
  onSearchShortcut(event: KeyboardEvent) {
    if (event.defaultPrevented || event.altKey || event.shiftKey ||
        !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'f' ||
        !this.store.book()) return;
    event.preventDefault();
    this.openSearch();
  }

  openSearch() {
    if (!this.store.book()) return;
    this.store.setNav('search');
    const focus = () => {
      this.document.querySelector<HTMLInputElement>('app-sidebar-search [data-search-input]')?.focus();
    };
    const input = this.document.querySelector<HTMLInputElement>('app-sidebar-search [data-search-input]');
    if (input?.getClientRects().length) input.focus();
    else afterNextRender(focus, { injector: this.injector });
  }

  private readonly ngZone = inject(NgZone);

  constructor() {
    const api = (window as any).desktopAPI;
    if (api?.onMenuAction) {
      api.onMenuAction((action: string) => {
        this.ngZone.run(() => {
          switch (action) {
            case 'new': this.newDoc(); break;
            case 'open': this.openDoc(); break;
            case 'save': this.saveDoc(); break;
            case 'saveAs': this.saveDocAs(); break;
            case 'close': this.closeDoc(); break;
            case 'undo': if (this.canUndo()) this.store.undo(); break;
            case 'redo': if (this.canRedo()) this.store.redo(); break;
            case 'search': this.openSearch(); break;
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

  readonly pomo = inject(PomodoroService);

  readonly menus = [
    { id: 'file', label: 'topbar.file' },
    { id: 'edit', label: 'topbar.edit' },
    { id: 'view', label: 'electron.menu.view' },
    { id: 'tools', label: 'topbar.tools' },
    { id: 'help', label: 'electron.menu.help' },
  ] as const;

  readonly viewPanels = [
    { id: 'manuscript', label: 'topbar.manuscript', icon: 'menu_book' },
    { id: 'outline', label: 'planning.outline', icon: 'view_kanban' },
    { id: 'styles', label: 'topbar.styles', icon: 'text_fields' },
    { id: 'layout', label: 'topbar.layout', icon: 'space_dashboard' },
    { id: 'metadata', label: 'topbar.properties', icon: 'info' },
    { id: 'attachments', label: 'topbar.attachments', icon: 'attach_file' },
  ] as const;

  readonly toolPanels = [
    { id: 'worldbuilding', label: 'topbar.worldbuilding', icon: 'badge' },
    { id: 'dictionary', label: 'sidebar.dictionary', icon: 'dictionary' },
    { id: 'productivity', label: 'topbar.productivity', icon: 'bar_chart' },
  ] as const;

  readonly chapterOptions = [
    { kind: 'chapter', label: 'sidebar.addChapter', icon: 'note_add' },
    { kind: 'back', label: 'sidebar.addBack', icon: 'post_add' },
  ] as const;

  readonly chapterTemplates = [
    { id: 'title-page', label: 'sidebar.templateTitlePage', icon: 'title' },
    { id: 'credits', label: 'sidebar.templateCredits', icon: 'copyright' },
    { id: 'dedication', label: 'sidebar.templateDedication', icon: 'favorite' },
    { id: 'acknowledgments', label: 'sidebar.templateAcknowledgments', icon: 'volunteer_activism' },
    { id: 'toc', label: 'sidebar.templateToc', icon: 'toc' },
    { id: undefined, label: 'sidebar.addFrontBlank', icon: 'draft' },
  ] as const;

  readonly importService = inject(ImportService);
  readonly showAddOptions = signal(false);

  readonly addOptionsPosition = signal<{ left: number; top: number; opensLeft: boolean } | null>(null);

  setAddOptions(open: boolean, focusFirst = false) {
    this.showAddOptions.set(open);
    if (!open) {
      this.addOptionsPosition.set(null);
      return;
    }
    afterNextRender(() => {
      this.positionAddOptions();
      if (focusFirst) {
        this.document.querySelector<HTMLButtonElement>('#menu-add-element button')?.focus({ preventScroll: true });
      }
    }, { injector: this.injector });
  }

  @HostListener('window:resize')
  positionAddOptions() {
    const submenu = this.document.getElementById('menu-add-element');
    const parent = this.document.getElementById('menu-tools');
    const trigger = this.document.getElementById('menu-add-trigger');
    if (!this.showAddOptions() || !submenu || !parent || !trigger) return;

    const { clientWidth, clientHeight } = this.document.documentElement;
    const menuBounds = parent.getBoundingClientRect();
    const buttonBounds = trigger.getBoundingClientRect();
    const { width, height } = submenu.getBoundingClientRect();
    const margin = 8;
    const right = menuBounds.right + 4;
    const left = menuBounds.left - width - 4;
    const fitsRight = right + width <= clientWidth - margin;
    const fitsLeft = left >= margin;
    const opensLeft = !fitsRight && (fitsLeft || menuBounds.left > clientWidth - menuBounds.right);
    const x = opensLeft ? left : right;
    const y = fitsLeft || fitsRight ? buttonBounds.top : buttonBounds.bottom + 4;
    this.addOptionsPosition.set({
      left: Math.max(margin, Math.min(x, clientWidth - width - margin)),
      top: Math.max(margin, Math.min(y, clientHeight - height - margin)),
      opensLeft,
    });
  }

  openAddOptionsWithKeyboard(event: Event) {
    event.preventDefault();
    this.setAddOptions(true, true);
  }

  addElement(kind: ChapterKind, template?: ChapterTemplateId) {
    if (template) this.store.addChapterFromTemplate(template);
    else this.store.addChapter(kind);
    this.store.setNav('manuscript');
  }

  onImportFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.importService.importFile(file);
  }

  readonly openMenu = signal<TopbarMenu | 'pomodoro' | null>(null);
  readonly aboutRequested = output<void>();
  readonly settingsRequested = output<void>();
  readonly isDesktop = !!window.desktopAPI;

  toggleMenu(menu: TopbarMenu | 'pomodoro', event: MouseEvent) {
    event.stopPropagation();
    this.setAddOptions(false);
    this.openMenu.update(current => current === menu ? null : menu);
  }

  closeMenu() {
    this.openMenu.set(null);
    this.setAddOptions(false);
  }

  openSettings(trigger: HTMLButtonElement) {
    this.closeMenu();
    trigger.focus({ preventScroll: true });
    // WebKit needs a paint between dismissing the menu and opening a top-layer dialog.
    afterNextRender(() => {
      requestAnimationFrame(() => setTimeout(() => {
        if (!this.destroyRef.destroyed) this.settingsRequested.emit();
      }, 0));
    }, { injector: this.injector });
  }

  completeMenu(trigger: HTMLButtonElement) {
    this.closeMenu();
    if (trigger.parentElement?.contains(this.document.activeElement)) trigger.focus();
  }

  onMenuBlur(menu: TopbarMenu, event: FocusEvent) {
    const container = event.currentTarget as HTMLElement;
    if (this.openMenu() === menu && event.relatedTarget instanceof Node && !container.contains(event.relatedTarget)) {
      this.closeMenu();
    }
  }

  onMenuTriggerKeydown(menu: TopbarMenu, event: KeyboardEvent) {
    if (event.key === 'Escape' && this.openMenu() === menu) {
      this.dismissMenu(event);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.openMenu.set(menu);
      afterNextRender(() => {
        const buttons = this.document.querySelectorAll<HTMLButtonElement>(`#menu-${menu} button:enabled`);
        (event.key === 'ArrowDown' ? buttons[0] : buttons[buttons.length - 1])?.focus();
      }, { injector: this.injector });
    }
  }

  onMenuKeydown(event: KeyboardEvent, trigger: HTMLButtonElement) {
    const submenu = (event.target as HTMLElement).closest('.tb__submenu');
    if ((event.key === 'Escape' && this.showAddOptions()) || (event.key === 'ArrowLeft' && submenu)) {
      event.preventDefault();
      event.stopPropagation();
      this.setAddOptions(false);
      this.document.getElementById('menu-add-trigger')?.focus();
      return;
    }
    if (event.key === 'Escape') {
      this.dismissMenu(event, trigger);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const container = submenu ?? event.currentTarget as HTMLElement;
    const actions = Array.from(container.querySelectorAll<HTMLButtonElement>('button:enabled'))
      .filter(button => button.closest('.tb__submenu') === submenu);
    if (!actions.length) return;
    event.preventDefault();
    const current = actions.indexOf(event.target as HTMLButtonElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1
      : (current + step + actions.length) % actions.length;
    actions[next].focus();
  }

  dismissMenu(event: Event, trigger?: HTMLButtonElement) {
    event.preventDefault();
    event.stopPropagation();
    this.closeMenu();
    trigger?.focus();
  }

  quitApp() {
    if (this.store.isDirty()) {
      this.pendingAction.set('close');
      this.showExitModal.set(true);
    } else {
      const api = (window as any).desktopAPI;
      if (api?.confirmClose) {
        api.confirmClose();
      }
    }
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

    const api = (window as any).desktopAPI;
    if (action === 'new') this.fileService.newProject();
    else if (action === 'open') this.fileService.openLibriaFile();
    else if (action === 'close') api?.confirmClose();
    else if (action === 'close-doc') this.fileService.closeProject();
  }

  async saveAndExit() {
    const action = this.pendingAction();
    if (!await this.fileService.saveLibriaFile(false, false) || this.store.isDirty()) return;
    this.showExitModal.set(false);
    this.pendingAction.set(null);

    const api = (window as any).desktopAPI;
    if (action === 'new') this.fileService.newProject();
    else if (action === 'open') this.fileService.openLibriaFile();
    else if (action === 'close') api?.confirmClose();
    else if (action === 'close-doc') this.fileService.closeProject();
  }
}
