import { computed, effect, inject } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState, withHooks } from '@ngrx/signals';
import { Book, BookTheme, Chapter, ChapterKind, ChapterTemplateId, Tweaks, LibriaDocument, Note, NoteRole, NoteStatus, Reply, SearchResult, PersonalConfig, WritingGoals, Footnote, CharacterSheet, LocationSheet } from '../models/book.models';
import { PersonalConfigService } from '../services/personal-config.service';
import { SpellCheckService } from '../services/spell-check.service';
import { AssetService } from '../services/asset.service';
import { CustomThemesService } from '../services/custom-themes.service';
import { environment } from '../../environments/environment';
import { validateLibriaDocument } from '../utils/document-validator';

export interface BookState {
  book: Book | null;
  chapters: Chapter[];
  notes: Note[];
  activeChapterId: string;
  tweaks: Tweaks;
  past: { chapters: Chapter[], notes: Note[] }[];
  future: { chapters: Chapter[], notes: Note[] }[];
  isDirty: boolean;
  ui: {
    showStyles: boolean;
    showTweaks: boolean;
    sidebarOpen: boolean;
    previewOpen: boolean;
    zenMode: boolean;
    activeNav: 'manuscript' | 'styles' | 'layout' | 'export' | 'metadata' | 'search' | 'settings' | 'attachments' | 'productivity' | 'worldbuilding';
    focusBlockIndex: number | null;
  };
  exportPrefs: {
    includeCover: boolean;
    includeNotes: boolean;
    exportMode: 'all' | 'selection';
    selectedChapterIds: string[];
  };
  searchQuery: string;
  searchResults: SearchResult[];
  replaceQuery: string;
  personalConfig: PersonalConfig;
  isSaving: boolean;
  isExporting: boolean;
  exportStatus: string;
  writingGoals: WritingGoals;
  // Measured start pages from the print preview DOM (1-indexed); empty until preview is opened
  printPageMap: Record<string, number>;
  customThemes: BookTheme[];
  characters: CharacterSheet[];
  locations: LocationSheet[];
}

const initialState: BookState = {
  book: null,
  chapters: [],
  notes: [],
  activeChapterId: '',
  characters: [],
  locations: [],
  tweaks: {
    sidebar: 'right',
    mode: 'light',
    bookFont: 'lora',
    customBookFont: null,
    spellcheck: true,
    fontSize: 12,
    lineHeight: 1.6,
    paragraphSpacing: 4,
    indentFirstLine: true,
    indentSize: 0.5,
    justifyText: false,
    marginTop: 20,
    marginBottom: 20,
    marginInner: 25,
    marginOuter: 15,
    showPageNumbers: true,
    showHeader: true,
    headerText: '',
    sceneBreakType: 'asterisks3',
    titleAlignment: 'center',
    titleFontSize: 16,
    titleFont: 'spectral',
    customTitleFont: null,
    titleBold: true,
    titleItalic: false,
    titleUnderline: false,
    pageNumberPosition: 'bottom-center',
    dropCap: true,
    dropCapLines: 3,
    hyphenation: true,
    smartQuotes: true,
    smartDashes: true,
    smartEllipsis: true,
    smartOpeningSigns: true,
    pdfxCompliant: false
  },
  past: [],
  future: [],
  isDirty: false,
  ui: {
    showStyles: false,
    showTweaks: false,
    sidebarOpen: true,
    previewOpen: true,
    zenMode: false,
    activeNav: 'manuscript' as 'manuscript' | 'styles' | 'layout' | 'metadata' | 'export' | 'search' | 'settings' | 'attachments' | 'productivity' | 'worldbuilding',
    focusBlockIndex: null,
  },
  exportPrefs: {
    includeCover: true,
    includeNotes: false,
    exportMode: 'all' as 'all' | 'selection',
    selectedChapterIds: [] as string[],
  },
  searchQuery: '',
  searchResults: [],
  replaceQuery: '',
  personalConfig: { avatar: '', userName: '', previewWidth: 460, language: 'es', mode: 'light' },
  isSaving: false,
  isExporting: false,
  exportStatus: '',
  writingGoals: { targetWords: 0, deadline: '' },
  printPageMap: {},
  customThemes: [],
};

function uiLocale(lang: string): string {
  const map: Record<string, string> = { en: 'en-US', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR' };
  return map[lang] || 'es-ES';
}

function untitledLabel(lang: string): string {
  const map: Record<string, string> = { en: 'Untitled', fr: 'Sans titre', it: 'Senza titolo', pt: 'Sem título' };
  return map[lang] || 'Sin título';
}

function calculateWords(body: { text?: string }[]): number {
  return body.reduce((sum, b) => {
    const text = (b.text || '').trim();
    return sum + (text ? text.split(/\s+/).length : 0);
  }, 0);
}

function calculateReadMin(words: number): number {
  return Math.max(1, Math.ceil(words / 200));
}

export const BookStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((state) => ({
    activeChapter: computed(() => 
      state.chapters().find(c => c.id === state.activeChapterId())
    ),
    activeNotes: computed(() => 
      state.notes().filter(n => n.chapterId === state.activeChapterId())
        .sort((a, b) => a.blockIndex - b.blockIndex)
    ),
    totalWords: computed(() => 
      state.chapters().reduce((sum, c) => sum + (c.words || 0), 0)
    ),
    totalReadMin: computed(() => 
      state.chapters()
        .filter(c => c.kind === 'chapter')
        .reduce((sum, c) => sum + (c.readMin || 0), 0)
    ),
    mainChaptersCount: computed(() => 
      state.chapters().filter(c => c.kind === 'chapter').length
    ),
    maxWords: computed(() => 
      state.chapters().reduce((max, c) => Math.max(max, c.words || 0), 0)
    ),
    pageSize: computed(() => {
      const size = state.book()?.paperSize || '5x8';
      switch (size) {
        case '5x8': return '5in 8in';
        case '6x9': return '6in 9in';
        case 'Letter': return '8.5in 11in';
        case 'A5': return '148mm 210mm';
        case 'A4': return '210mm 297mm';
        case 'A6': return '105mm 148mm';
        default: return '5in 8in';
      }
    }),
    bookFontFamily: computed(() => {
      const custom = state.tweaks.customBookFont();
      if (custom) return `"${custom}", serif`;
      const font = state.tweaks.bookFont();
      switch (font) {
        case 'eb-garamond': return "'EB Garamond', serif";
        case 'crimson-pro': return "'Crimson Pro', serif";
        case 'lora': return "'Lora', serif";
        case 'spectral': return "'Spectral', serif";
        case 'inter': return "'Inter', sans-serif";
        case 'montserrat': return "'Montserrat', sans-serif";
        default: return "serif";
      }
    }),
    titleFontFamily: computed(() => {
      const custom = state.tweaks.customTitleFont();
      if (custom) return `"${custom}", serif`;
      const font = state.tweaks.titleFont();
      switch (font) {
        case 'eb-garamond': return "'EB Garamond', serif";
        case 'crimson-pro': return "'Crimson Pro', serif";
        case 'lora': return "'Lora', serif";
        case 'spectral': return "'Spectral', serif";
        case 'inter': return "'Inter', sans-serif";
        case 'montserrat': return "'Montserrat', sans-serif";
        default: return "serif";
      }
    }),
    wordsProgress: computed(() => {
      const target = state.writingGoals.targetWords();
      if (!target) return 0;
      return Math.min(100, Math.round((state.chapters().reduce((s, c) => s + (c.words || 0), 0) / target) * 100));
    }),
    daysToDeadline: computed(() => {
      const dl = state.writingGoals.deadline();
      if (!dl) return null;
      const diff = Math.ceil((new Date(dl).getTime() - Date.now()) / 86_400_000);
      return diff;
    }),
    documentLang: computed(() => state.book()?.lang || 'es-MX'),
    domLang: computed(() => {
      const lang = state.book()?.lang || 'es-MX';
      if (lang.startsWith('es-')) return 'es';
      if (lang.startsWith('fr-')) return 'fr';
      if (lang.startsWith('it-')) return 'it';
      if (lang.startsWith('de-')) return 'de';
      if (lang.startsWith('pt-')) return 'pt';
      return lang;
    })
  })),
  withMethods((store) => ({
    saveSnapshot() {
      patchState(store, (state) => {
        const last = state.past[state.past.length - 1];
        // Skip if state is identical to last snapshot (same references)
        if (last && last.chapters === state.chapters && last.notes === state.notes) {
          return state;
        }
        return {
          past: [...state.past.slice(-19), {
            chapters: state.chapters,
            notes: state.notes
          }],
          future: []
        };
      });
    },
    undo() {
      patchState(store, (state) => {
        if (state.past.length === 0) return state;
        const previous = state.past[state.past.length - 1];
        const newPast = state.past.slice(0, state.past.length - 1);
        return {
          chapters: previous.chapters,
          notes: previous.notes,
          past: newPast,
          future: [{ 
            chapters: state.chapters, 
            notes: state.notes 
          }, ...state.future],
          isDirty: true
        };
      });
    },
    redo() {
      patchState(store, (state) => {
        if (state.future.length === 0) return state;
        const next = state.future[0];
        const newFuture = state.future.slice(1);
        return {
          chapters: next.chapters,
          notes: next.notes,
          past: [...state.past, { 
            chapters: state.chapters, 
            notes: state.notes 
          }],
          future: newFuture,
          isDirty: true
        };
      });
    },
    loadDocument(doc: LibriaDocument, assetService: AssetService) {
      validateLibriaDocument(doc);
      assetService.load(doc.assets || {});
      const personalMode = store.personalConfig().mode;
      patchState(store, {
        book: doc.metadata,
        chapters: doc.chapters,
        notes: doc.notes || [],
        characters: doc.characters || [],
        locations: doc.locations || [],
        activeChapterId: doc.session?.lastActiveChapterId || doc.chapters[0]?.id || '',
        tweaks: { ...store.tweaks(), ...(doc.preferences || {}), mode: personalMode },
        writingGoals: doc.writingGoals || initialState.writingGoals,
        isDirty: false,
        ui: initialState.ui
      });
    },
    createNewProject() {
      const author = store.personalConfig().userName;
      const lang = store.personalConfig().language;
      const newProjectLabels: Record<string, { title: string; chapter: string; docLang: string }> = {
        en: { title: 'New Book',      chapter: 'Chapter 1',  docLang: 'en-US' },
        fr: { title: 'Nouveau livre', chapter: 'Chapitre 1', docLang: 'fr-FR' },
        it: { title: 'Nuovo libro',   chapter: 'Capitolo 1', docLang: 'it-IT' },
        de: { title: 'Neues Buch',    chapter: 'Kapitel 1',  docLang: 'de-DE' },
        pt: { title: 'Novo Livro',    chapter: 'Capítulo 1', docLang: 'pt-BR' },
      };
      const labels = newProjectLabels[lang] || { title: 'Nuevo Libro', chapter: 'Capítulo 1', docLang: 'es-MX' };
      const newBook: Book = {
        title: labels.title,
        subtitle: '',
        author: author,
        authors: author ? [author] : [],
        editors: [],
        publisher: '',
        year: new Date().getFullYear(),
        isbn: '',
        paperSize: '5x8',
        lang: labels.docLang
      };
      const firstChapter: Chapter = {
        id: 'ch-' + Date.now().toString(36),
        kind: 'chapter',
        title: labels.chapter,
        words: 0,
        readMin: 0,
        number: 1,
        status: 'draft',
        body: [
          { type: 'chapter-title', text: labels.chapter },
          { type: 'p', text: '' }
        ]
      };
      patchState(store, {
        book: newBook,
        chapters: [firstChapter],
        notes: [],
        characters: [],
        locations: [],
        activeChapterId: firstChapter.id,
        isDirty: true,
        past: [],
        future: [],
        ui: initialState.ui
      });
    },
    setNav(nav: BookState['ui']['activeNav']) {
      patchState(store, (state) => ({
        ui: { ...state.ui, activeNav: nav, showStyles: nav === 'styles', sidebarOpen: true }
      }));
    },
    closeSidebar() {
      patchState(store, (state) => ({ ui: { ...state.ui, sidebarOpen: false } }));
    },
    toggleZenMode() {
      patchState(store, (state) => ({ ui: { ...state.ui, zenMode: !state.ui.zenMode } }));
    },
    togglePreview() {
      patchState(store, (state) => ({ ui: { ...state.ui, previewOpen: !state.ui.previewOpen } }));
    },
    updateUi(ui: Partial<BookState['ui']>) {
      patchState(store, (state) => ({
        ui: { ...state.ui, ...ui }
      }));
    },
    addNote(chapterId: string, blockIndex: number, role: NoteRole, authorName: string, content: string) {
      const newNote: Note = {
        id: 'nt-' + Date.now().toString(36),
        chapterId,
        blockIndex,
        role,
        authorName,
        content,
        date: new Date().toLocaleDateString(uiLocale(store.personalConfig().language), { day: 'numeric', month: 'short' }),
        status: 'unresolved',
        replies: []
      };
      patchState(store, (state) => ({
        notes: [...state.notes, newNote],
        isDirty: true
      }));
    },
    updateNoteStatus(noteId: string, status: NoteStatus) {
      patchState(store, (state) => ({
        notes: state.notes.map(n => n.id === noteId ? { ...n, status } : n),
        isDirty: true
      }));
    },
    addReply(noteId: string, role: NoteRole, authorName: string, content: string) {
      const newReply: Reply = {
        id: 'rp-' + Date.now().toString(36),
        authorName,
        role,
        content,
        date: new Date().toLocaleDateString(uiLocale(store.personalConfig().language), { day: 'numeric', month: 'short' })
      };
      patchState(store, (state) => ({
        notes: state.notes.map(n =>
          n.id === noteId ? { ...n, replies: [...n.replies, newReply] } : n
        ),
        isDirty: true
      }));
    },
    deleteNote(noteId: string) {
      patchState(store, (state) => ({
        notes: state.notes.filter(n => n.id !== noteId),
        isDirty: true
      }));
    },
    addFootnote(chapterId: string, blockIndex: number, footnoteId: string, content: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, footnotes: [...(c.footnotes || []), { id: footnoteId, blockIndex, content }] }
            : c
        ),
        isDirty: true
      }));
    },
    updateFootnote(chapterId: string, footnoteId: string, content: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, footnotes: (c.footnotes || []).map((fn) =>
                fn.id === footnoteId ? { ...fn, content } : fn
              )}
            : c
        ),
        isDirty: true
      }));
    },
    deleteFootnote(chapterId: string, footnoteId: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, footnotes: (c.footnotes || []).filter((fn) => fn.id !== footnoteId) }
            : c
        ),
        isDirty: true
      }));
    },
    updateBookMetadata(metadata: Partial<Book>) {
      patchState(store, (state) => ({
        book: state.book ? { ...state.book, ...metadata } : null,
        isDirty: true
      }));
    },
    addCharacter(name: string) {
      const newChar: CharacterSheet = {
        id: 'char-' + Date.now().toString(36),
        name,
        content: ''
      };
      patchState(store, (state) => ({
        characters: [...state.characters, newChar],
        isDirty: true
      }));
    },
    updateCharacter(id: string, name: string, content: string) {
      patchState(store, (state) => ({
        characters: state.characters.map(c => c.id === id ? { ...c, name, content } : c),
        isDirty: true
      }));
    },
    deleteCharacter(id: string) {
      patchState(store, (state) => ({
        characters: state.characters.filter(c => c.id !== id),
        isDirty: true
      }));
    },
    addLocation(name: string) {
      const newLoc: LocationSheet = {
        id: 'loc-' + Date.now().toString(36),
        name,
        content: ''
      };
      patchState(store, (state) => ({
        locations: [...state.locations, newLoc],
        isDirty: true
      }));
    },
    updateLocation(id: string, name: string, content: string) {
      patchState(store, (state) => ({
        locations: state.locations.map(l => l.id === id ? { ...l, name, content } : l),
        isDirty: true
      }));
    },
    deleteLocation(id: string) {
      patchState(store, (state) => ({
        locations: state.locations.filter(l => l.id !== id),
        isDirty: true
      }));
    },
    closeDocument(assetService: AssetService) {
      assetService.clear();
      patchState(store, {
        book: null,
        chapters: [],
        notes: [],
        activeChapterId: '',
        isDirty: false,
        past: [],
        future: [],
        ui: { ...initialState.ui, activeNav: 'manuscript' }
      });
    },
    deleteChapter(chapterId: string) {
      patchState(store, (state) => {
        const newChapters = state.chapters.filter(c => c.id !== chapterId);
        if (newChapters.length === 0) return state; // Prevent empty chapters list
        
        let newActiveId = state.activeChapterId;
        if (state.activeChapterId === chapterId) {
          const index = state.chapters.findIndex(c => c.id === chapterId);
          newActiveId = newChapters[Math.min(index, newChapters.length - 1)].id;
        }

        return {
          chapters: newChapters,
          notes: state.notes.filter(n => n.chapterId !== chapterId),
          activeChapterId: newActiveId,
          isDirty: true
        };
      });
    },
    setActiveChapter(id: string) {
      patchState(store, { activeChapterId: id });
    },
    goToSearchResult(chapterId: string, blockIndex: number) {
      patchState(store, {
        activeChapterId: chapterId,
        ui: { ...store.ui(), activeNav: 'manuscript', focusBlockIndex: blockIndex }
      });
    },
    clearFocusBlock() {
      patchState(store, (state) => ({
        ui: { ...state.ui, focusBlockIndex: null }
      }));
    },
    markAsSaved() {
      patchState(store, { isDirty: false });
    },
    setIsSaving(isSaving: boolean) {
      patchState(store, { isSaving });
    },
    setExporting(isExporting: boolean, exportStatus = '') {
      patchState(store, { isExporting, exportStatus });
    },
    addChapter(kind: ChapterKind = 'chapter') {
      patchState(store, (state) => {
        const chapters = state.chapters;
        const lastChapter = [...chapters].reverse().find(c => c.kind === 'chapter');
        const newChapter: Chapter = {
          id: 'ch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
          kind,
          title: untitledLabel(store.personalConfig().language),
          words: 0,
          readMin: 0,
          number: kind === 'chapter' ? (lastChapter?.number ?? 0) + 1 : undefined,
          status: 'draft',
          body: kind === 'chapter'
            ? [{ type: 'chapter-title', text: untitledLabel(store.personalConfig().language) }, { type: 'p', text: '' }]
            : [{ type: 'p', text: '' }]
        };
        let insertAt = chapters.length;
        if (kind === 'front') {
          insertAt = 0;
        } else if (kind === 'chapter') {
          const lastFront = [...chapters].reverse().find(c => c.kind === 'front');
          insertAt = lastFront ? chapters.lastIndexOf(lastFront) + 1 : 0;
        }
        return {
          chapters: [
            ...chapters.slice(0, insertAt),
            newChapter,
            ...chapters.slice(insertAt)
          ],
          activeChapterId: newChapter.id,
          isDirty: true
        };
      });
    },
    addChapterFromTemplate(templateId: ChapterTemplateId) {
      patchState(store, (state) => {
        const book = state.book;
        const lang = store.personalConfig().language;
        const titleMap: Record<ChapterTemplateId, Record<string, string>> = {
          'title-page':      { es: 'Portadilla', en: 'Title Page', fr: 'Page de titre', it: 'Frontespizio', pt: 'Folha de rosto', de: 'Titelseite' },
          'credits':         { es: 'Créditos', en: 'Credits', fr: 'Crédits', it: 'Crediti', pt: 'Créditos', de: 'Impressum' },
          'dedication':      { es: 'Dedicatoria', en: 'Dedication', fr: 'Dédicace', it: 'Dedica', pt: 'Dedicatória', de: 'Widmung' },
          'acknowledgments': { es: 'Agradecimientos', en: 'Acknowledgments', fr: 'Remerciements', it: 'Ringraziamenti', pt: 'Agradecimentos', de: 'Danksagung' },
          'toc':             { es: 'Contenido', en: 'Contents', fr: 'Table des matières', it: 'Indice', pt: 'Sumário', de: 'Inhalt' },
        };
        const l = lang.slice(0, 2);
        const title = titleMap[templateId][l] ?? titleMap[templateId]['en'];

        const bodyMap: Record<ChapterTemplateId, () => Chapter['body']> = {
          'title-page': () => [
            { type: 'title',     text: book?.title     ?? '' },
            { type: 'subtitle',  text: book?.subtitle  ?? '' },
            { type: 'author',    text: (book?.authors ?? []).join(', ') || book?.author || '' },
            { type: 'publisher', text: book?.publisher ?? '' },
          ],
          'credits': () => {
            const allRights: Record<string, string> = {
              es: 'Todos los derechos reservados.',
              en: 'All rights reserved.',
              fr: 'Tous droits réservés.',
              it: 'Tutti i diritti riservati.',
              pt: 'Todos os direitos reservados.',
              de: 'Alle Rechte vorbehalten.',
            };
            return [
              { type: 'p', text: `© ${book?.year ?? new Date().getFullYear()} ${book?.author ?? ''}` },
              { type: 'p', text: book?.isbn ? `ISBN: ${book.isbn}` : 'ISBN: ' },
              { type: 'p', text: book?.publisher ?? '' },
              { type: 'p', text: allRights[l] ?? allRights['en'] },
            ];
          },
          'dedication': () => [
            { type: 'dedication', text: '' },
          ],
          'acknowledgments': () => [
            { type: 'h1', text: title },
            { type: 'p',  text: '' },
          ],
          'toc': () => [],
        };

        const newChapter: Chapter = {
          id: 'ch-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6),
          kind: 'front',
          title,
          words: 0,
          readMin: 0,
          status: 'front' as any,
          templateId,
          body: bodyMap[templateId](),
        };

        const chapters = state.chapters;
        const lastFront = [...chapters].reverse().find(c => c.kind === 'front');
        const insertAt = lastFront ? chapters.lastIndexOf(lastFront) + 1 : 0;
        return {
          chapters: [
            ...chapters.slice(0, insertAt),
            newChapter,
            ...chapters.slice(insertAt),
          ],
          activeChapterId: newChapter.id,
          isDirty: true,
        };
      });
    },
    addChapters(newChapters: Chapter[]) {
      patchState(store, (state) => ({
        chapters: [...state.chapters, ...newChapters],
        isDirty: true
      }));
    },
    moveChapter(chapterId: string, direction: 'up' | 'down') {
      patchState(store, (state) => {
        const idx = state.chapters.findIndex(c => c.id === chapterId);
        if (idx === -1) return state;
        const chapter = state.chapters[idx];
        const step = direction === 'up' ? -1 : 1;
        let swapIdx = idx + step;
        while (swapIdx >= 0 && swapIdx < state.chapters.length) {
          if (state.chapters[swapIdx].kind === chapter.kind) break;
          swapIdx += step;
        }
        if (swapIdx < 0 || swapIdx >= state.chapters.length) return state;
        const chapters = [...state.chapters];
        [chapters[idx], chapters[swapIdx]] = [chapters[swapIdx], chapters[idx]];
        return { chapters, isDirty: true };
      });
    },
    updateChapterMeta(chapterId: string, meta: Partial<Pick<Chapter, 'title' | 'number' | 'forceOddPage' | 'status'>>) {
      patchState(store, (state) => ({
        chapters: state.chapters.map(c => 
          c.id === chapterId ? { ...c, ...meta } : c
        ),
        isDirty: true
      }));
    },
    updateChapterBlock(chapterId: string, blockIndex: number, text: string, html?: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) => {
          if (c.id !== chapterId) return c;
          
          const editedBlock = c.body[blockIndex];
          const isTitleBlock = editedBlock.type === 'h1' || editedBlock.type === 'chapter-title';
          const newBody = c.body.map((b, i) =>
            i === blockIndex ? { ...b, text, html } : b
          );
          const words = calculateWords(newBody);
          
          return {
            ...c,
            title: isTitleBlock ? (text || untitledLabel(store.personalConfig().language)) : c.title,
            body: newBody,
            words,
            readMin: calculateReadMin(words)
          };
        }),
        isDirty: true
      }));
    },
    setBlockType(chapterId: string, blockIndex: number, type: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                body: c.body.map((b, i) =>
                  i === blockIndex ? { ...b, type } : b
                )
              }
            : c
        ),
        isDirty: true
      }));
    },
    insertBlock(chapterId: string, afterIndex: number, type: string, text: string = '', html?: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) => {
          if (c.id !== chapterId) return c;
          const newBody = [
            ...c.body.slice(0, afterIndex + 1),
            { type, text, ...(html ? { html } : {}) },
            ...c.body.slice(afterIndex + 1)
          ];
          const words = calculateWords(newBody);
          return { ...c, body: newBody, words, readMin: calculateReadMin(words) };
        }),
        isDirty: true
      }));
    },
    splitBlock(chapterId: string, blockIndex: number, cursorPosition: number) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) => {
          if (c.id !== chapterId) return c;
          const newBody = [
            ...c.body.slice(0, blockIndex),
            { ...c.body[blockIndex], text: c.body[blockIndex].text?.substring(0, cursorPosition) || '', html: undefined },
            { type: 'p', text: c.body[blockIndex].text?.substring(cursorPosition) || '' },
            ...c.body.slice(blockIndex + 1)
          ];
          const words = calculateWords(newBody);
          return { ...c, body: newBody, words, readMin: calculateReadMin(words) };
        }),
        isDirty: true
      }));
    },
    mergeWithPrevious(chapterId: string, blockIndex: number) {
      patchState(store, (state) => {
        const chapter = state.chapters.find(c => c.id === chapterId);
        if (!chapter || blockIndex <= 0) return state;

        const prevBlock = chapter.body[blockIndex - 1];
        const currentBlock = chapter.body[blockIndex];
        const mergedText = (prevBlock.text || '') + (currentBlock.text || '');

        const newBody = [
          ...chapter.body.slice(0, blockIndex - 1),
          { ...prevBlock, text: mergedText, html: undefined },
          ...chapter.body.slice(blockIndex + 1)
        ];

        const words = calculateWords(newBody);
        return {
          chapters: state.chapters.map(c =>
            c.id === chapterId ? { ...chapter, body: newBody, words, readMin: calculateReadMin(words) } : c
          ),
          isDirty: true
        };
      });
    },
    deleteBlock(chapterId: string, blockIndex: number) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) => {
          if (c.id !== chapterId) return c;
          const newBody = c.body.filter((_, i) => i !== blockIndex);
          const words = calculateWords(newBody);
          return { ...c, body: newBody, words, readMin: calculateReadMin(words) };
        }),
        isDirty: true
      }));
    },
    mergeBlockWithNext(chapterId: string, blockIndex: number) {
      patchState(store, (state) => {
        const chapter = state.chapters.find(c => c.id === chapterId);
        if (!chapter || blockIndex >= chapter.body.length - 1) return state;

        const currentBlock = chapter.body[blockIndex];
        const nextBlock    = chapter.body[blockIndex + 1];
        const mergedText   = (currentBlock.text || '') + (nextBlock.text || '');

        const newBody = [
          ...chapter.body.slice(0, blockIndex),
          { ...currentBlock, text: mergedText, html: undefined },
          ...chapter.body.slice(blockIndex + 2)
        ];

        const words = calculateWords(newBody);
        return {
          chapters: state.chapters.map(c =>
            c.id === chapterId ? { ...chapter, body: newBody, words, readMin: calculateReadMin(words) } : c
          ),
          isDirty: true
        };
      });
    },
    insertImageBlock(chapterId: string, afterIndex: number, assetKey: string, width?: number, height?: number) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                body: [
                  ...c.body.slice(0, afterIndex + 1),
                  { type: 'image', src: assetKey, width, height },
                  ...c.body.slice(afterIndex + 1)
                ]
              }
            : c
        ),
        isDirty: true
      }));
    },
    setImageSrc(chapterId: string, blockIndex: number, assetKey: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, body: c.body.map((b, i) => i === blockIndex ? { ...b, src: assetKey } : b) }
            : c
        ),
        isDirty: true
      }));
    },
    updateImageSize(chapterId: string, blockIndex: number, width: number, height: number) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, body: c.body.map((b, i) => i === blockIndex ? { ...b, width, height } : b) }
            : c
        ),
        isDirty: true
      }));
    },
    updateImageCaption(chapterId: string, blockIndex: number, caption: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, body: c.body.map((b, i) => i === blockIndex ? { ...b, caption } : b) }
            : c
        ),
        isDirty: true
      }));
    },
    updateBlockAttribution(chapterId: string, blockIndex: number, attribution: string) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, body: c.body.map((b, i) => i === blockIndex ? { ...b, attribution } : b) }
            : c
        ),
        isDirty: true
      }));
    },
    updateImageTransform(chapterId: string, blockIndex: number, transform: { rotation?: number; flipH?: boolean; flipV?: boolean }) {
      patchState(store, (state) => ({
        chapters: state.chapters.map((c) =>
          c.id === chapterId
            ? { ...c, body: c.body.map((b, i) => i === blockIndex ? { ...b, ...transform } : b) }
            : c
        ),
        isDirty: true
      }));
    },
    updateTweak<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
      const UI_ONLY_TWEAKS: (keyof Tweaks)[] = ['sidebar', 'mode', 'spellcheck'];
      const dirty = !UI_ONLY_TWEAKS.includes(key);
      patchState(store, (state) => ({
        tweaks: { ...state.tweaks, [key]: value },
        ...(dirty ? { isDirty: true } : {})
      }));
    },
    applyTheme(theme: BookTheme) {
      patchState(store, (state) => ({
        tweaks: { ...state.tweaks, ...theme.tweaks },
        isDirty: true
      }));
    },
    saveCustomTheme(name: string): BookTheme {
      const customThemesService = inject(CustomThemesService);
      const UI_ONLY: (keyof Tweaks)[] = ['sidebar', 'mode', 'spellcheck'];
      const tweaksCopy = Object.fromEntries(
        Object.entries(store.tweaks()).filter(([k]) => !UI_ONLY.includes(k as keyof Tweaks))
      ) as Partial<Tweaks>;
      const theme: BookTheme = {
        id: crypto.randomUUID(),
        name,
        tweaks: tweaksCopy,
        isCustom: true
      };
      const updated = customThemesService.save(theme);
      patchState(store, { customThemes: updated });
      return theme;
    },
    addCustomTheme(theme: BookTheme): void {
      const customThemesService = inject(CustomThemesService);
      const updated = customThemesService.save(theme);
      patchState(store, { customThemes: updated });
    },
    deleteCustomTheme(id: string): void {
      const customThemesService = inject(CustomThemesService);
      const updated = customThemesService.delete(id);
      patchState(store, { customThemes: updated });
    },
    setThemeMode(mode: 'light' | 'dark') {
      patchState(store, (state) => ({
        tweaks: { ...state.tweaks, mode },
        personalConfig: { ...state.personalConfig, mode }
      }));
    },
    updateExportPrefs(prefs: Partial<BookState['exportPrefs']>) {
      patchState(store, (state) => ({
        exportPrefs: { ...state.exportPrefs, ...prefs }
      }));
    },
    setReplaceQuery(query: string) {
      patchState(store, { replaceQuery: query });
    },
    setPersonalConfig(config: PersonalConfig) {
      patchState(store, { personalConfig: config });
    },
    setWritingGoals(goals: WritingGoals) {
      patchState(store, { writingGoals: goals, isDirty: true });
    },
    setPrintPageMap(map: Record<string, number>) {
      patchState(store, { printPageMap: map });
    },
    search(query: string) {
      if (!query.trim()) {
        patchState(store, { searchQuery: query, searchResults: [] });
        return;
      }
      const results: SearchResult[] = [];
      const lowerQuery = query.toLowerCase();
      for (const chapter of store.chapters()) {
        for (let bi = 0; bi < chapter.body.length; bi++) {
          const block = chapter.body[bi];
          const text = block.text || '';
          const lowerText = text.toLowerCase();
          let pos = 0;
          let mi = 0;
          while ((pos = lowerText.indexOf(lowerQuery, pos)) !== -1) {
            const start = Math.max(0, pos - 40);
            const end = Math.min(text.length, pos + query.length + 40);
            results.push({
              chapterId: chapter.id,
              chapterTitle: chapter.title,
              chapterKind: chapter.kind,
              chapterNumber: chapter.number,
              blockIndex: bi,
              blockType: block.type,
              matchIndex: mi++,
              before: text.slice(start, pos),
              match: text.slice(pos, pos + query.length),
              after: text.slice(pos + query.length, end)
            });
            pos += query.length;
          }
        }
      }
      patchState(store, { searchQuery: query, searchResults: results, ui: { ...store.ui(), activeNav: 'search', showStyles: false } });
    },
    replaceAll(replaceWith: string) {
      const query = store.searchQuery();
      if (!query.trim() || !store.chapters().length) return;
      
      const chapters = store.chapters().map(chapter => {
        const newBody = chapter.body.map(block => {
          const text = block.text || '';
          if (!text.toLowerCase().includes(query.toLowerCase())) return block;
          const newText = text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), replaceWith);
          return { ...block, text: newText, html: undefined };
        });
        const words = calculateWords(newBody); return { ...chapter, body: newBody, words, readMin: calculateReadMin(words) };
      });
      
      patchState(store, {
        chapters,
        replaceQuery: replaceWith,
        searchResults: [],
        searchQuery: '',
        isDirty: true
      });
    }
  })),
  withHooks({
    onInit(store) {
      const personalConfigService = inject(PersonalConfigService);
      const customThemesService = inject(CustomThemesService);
      const spellCheckService = inject(SpellCheckService);
      const assetService = inject(AssetService);

      // Load initial personal config
      const saved = personalConfigService.load();
      patchState(store, { personalConfig: saved });

      // Load custom themes from localStorage
      const savedThemes = customThemesService.load();
      if (savedThemes.length) {
        patchState(store, { customThemes: savedThemes });
      }

      // Apply saved theme mode (personal preference overrides book setting)
      const tweaks = store.tweaks();
      if (saved.mode && saved.mode !== tweaks.mode) {
        patchState(store, { tweaks: { ...tweaks, mode: saved.mode } });
      }

      // Effect to save personal config whenever it changes
      effect(() => {
        const config = store.personalConfig();
        personalConfigService.save(config);
      });

      // Sync spell checker language with Electron
      effect(() => {
        const lang = store.documentLang();
        if (spellCheckService.isAvailable) {
          spellCheckService.setLanguage(lang);
        }
      });

      // Sync HTML lang attribute for CSS hyphenation
      effect(() => {
        document.documentElement.lang = store.domLang();
      });
    }
  })
);
