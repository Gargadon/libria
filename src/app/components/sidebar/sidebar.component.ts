import { SidebarFontsState } from './panels/sidebar-fonts.state';
import { SidebarStylesPanelComponent, SidebarStylesState } from './panels/styles-panel.component';
import {
  SidebarMetadataPanelComponent,
  SidebarMetadataState,
} from './panels/metadata-panel.component';
import {
  SidebarSettingsPanelComponent,
  SidebarSettingsState,
} from './panels/settings-panel.component';
import { SidebarProductivityPanelComponent } from './panels/productivity-panel.component';
import { SidebarExportPanelComponent } from './panels/export-panel.component';
import { SidebarSearchPanelComponent } from './panels/search-panel.component';
import { SidebarAttachmentsPanelComponent } from './panels/attachments-panel.component';
import { SidebarLayoutPanelComponent } from './panels/layout-panel.component';
import {
  Component,
  inject,
  computed,
  signal,
  HostListener,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { BookStore } from '../../store/book.store';

import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ChapterKind, ChapterTemplateId } from '../../models/book.models';
import { FormsModule } from '@angular/forms';

import { ImportService } from '../../services/import.service';

import { InputModalComponent } from '../modals/input-modal.component';
import { ConfirmModalComponent } from '../modals/confirm-modal.component';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    InputModalComponent,
    ConfirmModalComponent,
    SidebarStylesPanelComponent,
    SidebarMetadataPanelComponent,
    SidebarSettingsPanelComponent,
    SidebarProductivityPanelComponent,
    SidebarExportPanelComponent,
    SidebarSearchPanelComponent,
    SidebarAttachmentsPanelComponent,
    SidebarLayoutPanelComponent,
  ],
  providers: [SidebarFontsState, SidebarStylesState, SidebarMetadataState, SidebarSettingsState],
  templateUrl: './sidebar.component.html',
})
export class SidebarComponent {
  readonly frontChapters = computed(() => this.store.chapters().filter((c) => c.kind === 'front'));
  readonly mainChapters = computed(() => this.store.chapters().filter((c) => c.kind === 'chapter'));
  readonly backChapters = computed(() => this.store.chapters().filter((c) => c.kind === 'back'));
  constructor() {
    // Keep drafts and font/dictionary initialization alive across panel navigation.
    inject(SidebarMetadataState);
    inject(SidebarSettingsState);
    inject(SidebarFontsState);
  }
  readonly store = inject(BookStore);

  readonly currentLang = computed(() => {
    const lang = this.store.personalConfig().language;
    const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', it: 'it-IT' };
    return localeMap[lang] || 'es-ES';
  });

  readonly Math = Math;

  selectedWorldElement = signal<{ type: 'character' | 'location'; id: string } | null>(null);

  readonly translate = inject(TranslateService);

  updateGoalWords(value: number) {
    this.store.setWritingGoals({ ...this.store.writingGoals(), targetWords: Number(value) || 0 });
  }

  updateGoalDeadline(value: string) {
    this.store.setWritingGoals({ ...this.store.writingGoals(), deadline: value || '' });
  }

  showGoalsEditor = signal(false);

  toggleAddMenu(event: Event) {
    event.stopPropagation();
    this.showAddMenu.update((v) => !v);
  }

  toggleFrontSubmenu(event: Event) {
    event.stopPropagation();
    this.showFrontSubmenu.update((v) => !v);
  }

  showFrontSubmenu = signal(false);

  addFromTemplate(templateId: ChapterTemplateId) {
    this.store.addChapterFromTemplate(templateId);
    this.showAddMenu.set(false);
    this.showFrontSubmenu.set(false);
  }

  add(kind: ChapterKind) {
    this.store.addChapter(kind);
    this.showAddMenu.set(false);
    this.showFrontSubmenu.set(false);
  }

  triggerImport() {
    this.importInput.nativeElement.click();
  }

  readonly importing = signal(false);

  async onImportFile(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.importing.set(true);
    try {
      if (file.name.endsWith('.docx')) {
        await this.importService.importDocx(file);
      } else if (file.name.endsWith('.txt')) {
        await this.importService.importTxt(file);
      }
    } catch (error) {
      this.importService.warnings.set([error instanceof Error ? error.message : String(error)]);
    } finally {
      this.importing.set(false);
      event.target.value = '';
    }
  }

  readonly importService = inject(ImportService);

  saveWorldElement(name: string, content: string) {
    const sel = this.selectedWorldElement();
    if (!sel) return;
    if (sel.type === 'character') {
      this.store.updateCharacter(sel.id, name, content);
    } else {
      this.store.updateLocation(sel.id, name, content);
    }
  }

  deleteWorldElement(id: string, type: 'character' | 'location' | undefined) {
    if (!type) return;
    if (
      confirm(
        this.translate.instant('sidebar.deleteConfirm', {
          title: this.activeWorldElement()?.name || '',
        }),
      )
    ) {
      if (type === 'character') {
        this.store.deleteCharacter(id);
      } else {
        this.store.deleteLocation(id);
      }
      this.selectedWorldElement.set(null);
    }
  }

  promptAddCharacter() {
    this.modalTitle.set(this.translate.instant('sidebar.addCharacter'));
    this.modalLabel.set(this.translate.instant('sidebar.charNamePlaceholder'));
    this.modalValue.set('');
    this.modalInputType.set('text');
    this.modalTargetId.set('');
    this.modalAction.set('add-character');
    this.showInputModal.set(true);
  }

  promptAddLocation() {
    this.modalTitle.set(this.translate.instant('sidebar.addLocation'));
    this.modalLabel.set(this.translate.instant('sidebar.locNamePlaceholder'));
    this.modalValue.set('');
    this.modalInputType.set('text');
    this.modalTargetId.set('');
    this.modalAction.set('add-location');
    this.showInputModal.set(true);
  }

  modalTitle = signal('');

  modalLabel = signal('');

  modalValue = signal<string | number>('');

  modalInputType = signal('text');

  showInputModal = signal(false);

  onInputSubmit(value: string | number) {
    const id = this.modalTargetId();
    const action = this.modalAction();
    if (action === 'title') {
      const title = value.toString().trim();
      if (title) this.store.updateChapterMeta(id, { title });
    } else if (action === 'number') {
      const num = parseInt(value.toString(), 10);
      if (!isNaN(num)) this.store.updateChapterMeta(id, { number: num });
    } else if (action === 'add-character') {
      const name = value.toString().trim();
      if (name) this.store.addCharacter(name);
    } else if (action === 'add-location') {
      const name = value.toString().trim();
      if (name) this.store.addLocation(name);
    }
    this.showInputModal.set(false);
  }

  confirmMessage = signal('');

  showConfirmModal = signal(false);

  onConfirmDelete() {
    this.store.deleteChapter(this.confirmTargetId());
    this.showConfirmModal.set(false);
  }

  readonly draggedChapterId = signal<string | null>(null);

  readonly dropTargetId = signal<string | null>(null);

  readonly dropAfter = signal(false);

  startChapterDrag(id: string, event: DragEvent) {
    this.draggedChapterId.set(id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', id);
    }
  }

  overChapter(id: string, event: DragEvent) {
    const source = this.store.chapters().find((c) => c.id === this.draggedChapterId());
    const target = this.store.chapters().find((c) => c.id === id);
    if (!source || !target || source.kind !== target.kind || source.id === id) {
      this.dropTargetId.set(null);
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dropTargetId.set(id);
    this.dropAfter.set(event.clientY > rect.top + rect.height / 2);
  }

  dropChapter(id: string, event: DragEvent) {
    event.preventDefault();
    const source = this.draggedChapterId();
    if (source && this.dropTargetId() === id) {
      this.store.reorderChapter(source, id, this.dropAfter());
    }
    this.endChapterDrag();
  }

  endChapterDrag() {
    this.draggedChapterId.set(null);
    this.dropTargetId.set(null);
  }

  editNumber(chapter: any, event: Event) {
    event.stopPropagation();
    if (chapter.kind !== 'chapter') return;

    this.modalTitle.set(this.translate.instant('sidebar.editNumber'));
    this.modalLabel.set(this.translate.instant('sidebar.chapterNumber'));
    this.modalValue.set(chapter.number || 0);
    this.modalInputType.set('number');
    this.modalTargetId.set(chapter.id);
    this.modalAction.set('number');
    this.showInputModal.set(true);
  }

  editTitle(chapter: any, event: Event) {
    event.stopPropagation();

    this.modalTitle.set(this.translate.instant('sidebar.editTitle'));
    this.modalLabel.set(this.translate.instant('sidebar.chapterTitle'));
    this.modalValue.set(chapter.title);
    this.modalInputType.set('text');
    this.modalTargetId.set(chapter.id);
    this.modalAction.set('title');
    this.showInputModal.set(true);
  }

  moveChapter(chapterId: string, direction: 'up' | 'down', event: Event) {
    event.stopPropagation();
    this.store.saveSnapshot();
    this.store.moveChapter(chapterId, direction);
  }

  deleteChapter(chapter: any, event: Event) {
    event.stopPropagation();
    this.confirmMessage.set(
      this.translate.instant('sidebar.deleteConfirm', { title: chapter.title }),
    );
    this.confirmTargetId.set(chapter.id);
    this.showConfirmModal.set(true);
  }

  showAddMenu = signal(false);

  activeWorldElement = computed(() => {
    const sel = this.selectedWorldElement();
    if (!sel) return null;
    if (sel.type === 'character') {
      return this.store.characters().find((c) => c.id === sel.id) || null;
    } else {
      return this.store.locations().find((l) => l.id === sel.id) || null;
    }
  });

  @ViewChild('importInput') importInput!: ElementRef<HTMLInputElement>;

  modalTargetId = signal('');

  modalAction = signal<'title' | 'number' | 'add-character' | 'add-location'>('title');

  confirmTargetId = signal('');

  @HostListener('document:click')
  onDocumentClick() {
    this.showAddMenu.set(false);
    this.showFrontSubmenu.set(false);
  }
}
