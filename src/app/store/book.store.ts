import { computed } from '@angular/core';
import { signalStore, withState, withMethods, withComputed, patchState } from '@ngrx/signals';
import { Book, Chapter, ChapterKind, Tweaks, LibriaDocument, Note, NoteRole, NoteStatus, Reply, SearchResult, PersonalConfig } from '../models/book.models';

export interface BookState {
  book: Book | null;
  chapters: Chapter[];
  notes: Note[];
  activeChapterId: string;
  tweaks: Tweaks;
  assets: Record<string, string>;
  past: { chapters: Chapter[], notes: Note[] }[];
  future: { chapters: Chapter[], notes: Note[] }[];
  isDirty: boolean;
  ui: {
    showStyles: boolean;
    showTweaks: boolean;
    activeNav: 'manuscript' | 'styles' | 'layout' | 'export' | 'metadata' | 'search' | 'settings';
  };
  exportPrefs: {
    includeCover: boolean;
    includeNotes: boolean;
    includeTOC: boolean;
  };
  searchQuery: string;
  searchResults: SearchResult[];
  replaceQuery: string;
  personalConfig: PersonalConfig;
}

const initialState: BookState = {
  book: null,
  chapters: [],
  notes: [],
  activeChapterId: '',
  tweaks: {
    sidebar: 'right',
    mode: 'light',
    bookFont: 'lora',
    spellcheck: true,
    spellcheckLang: 'es',
    fontSize: 16,
    lineHeight: 1.6,
    paragraphSpacing: 1.2,
    indentFirstLine: true,
    justifyText: false,
    marginTop: 20,
    marginBottom: 20,
    marginInner: 25,
    marginOuter: 15,
    showPageNumbers: true,
    headerText: '',
    sceneBreakType: 'asterisks',
    titleAlignment: 'center',
    titleFontSize: 24,
    titleFont: 'spectral',
    titleBold: true,
    titleItalic: false,
    titleUnderline: false,
    pageNumberPosition: 'bottom-center',
    dropCap: true,
    dropCapLines: 3,
    hyphenation: true
  },
  assets: {},
  past: [],
  future: [],
  isDirty: false,
  ui: {
    showStyles: false,
    showTweaks: false,
    activeNav: 'manuscript'
  },
  exportPrefs: {
    includeCover: true,
    includeNotes: false,
    includeTOC: true
  },
  searchQuery: '',
  searchResults: [],
  replaceQuery: '',
  personalConfig: { avatar: '' }
};

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
      Math.max(...state.chapters().map(c => c.words || 0))
    ),
    pageSize: computed(() => {
      const size = state.book()?.paperSize || '5x8';
      switch (size) {
        case '5x8': return '5in 8in';
        case '6x9': return '6in 9in';
        case 'A5': return '148mm 210mm';
        case 'A4': return '210mm 297mm';
        default: return '5in 8in';
      }
    }),
    bookFontFamily: computed(() => {      const font = state.tweaks.bookFont();
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
    })
  })),
  withMethods((store) => ({
    saveSnapshot() {
      patchState(store, (state) => ({
        past: [...state.past.slice(-49), { 
          chapters: structuredClone(state.chapters), 
          notes: structuredClone(state.notes) 
        }],
        future: []
      }));
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
            chapters: structuredClone(state.chapters), 
            notes: structuredClone(state.notes) 
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
            chapters: structuredClone(state.chapters), 
            notes: structuredClone(state.notes) 
          }],
          future: newFuture,
          isDirty: true
        };
      });
    },
    loadDocument(doc: LibriaDocument) {
      patchState(store, {
        book: doc.metadata,
        chapters: doc.chapters,
        notes: doc.notes || [],
        assets: doc.assets || {},
        activeChapterId: doc.session?.lastActiveChapterId || doc.chapters[0]?.id || '',
        tweaks: { ...store.tweaks(), ...(doc.preferences || {}) },
        isDirty: false,
        ui: initialState.ui
      });
    },
    createNewProject() {
      const newBook: Book = {
        title: 'Nuevo Libro',
        subtitle: '',
        author: '',
        authors: [],
        editors: [],
        publisher: '',
        year: new Date().getFullYear(),
        isbn: '',
        paperSize: '5x8'
      };
      const firstChapter: Chapter = {
        id: 'ch-' + Date.now().toString(36),
        kind: 'chapter',
        title: 'Capítulo 1',
        words: 0,
        readMin: 0,
        number: 1,
        status: 'draft',
        body: [
          { type: 'chapter-title', text: 'Capítulo 1' },
          { type: 'p', text: '' }
        ]
      };
      patchState(store, {
        book: newBook,
        chapters: [firstChapter],
        notes: [],
        activeChapterId: firstChapter.id,
        isDirty: true,
        past: [],
        future: [],
        ui: initialState.ui
      });
    },
    setNav(nav: 'manuscript' | 'styles' | 'layout' | 'export' | 'metadata' | 'search' | 'settings') {
      patchState(store, (state) => ({
        ui: { ...state.ui, activeNav: nav, showStyles: nav === 'styles' }
      }));
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
        date: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
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
        date: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
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
    updateBookMetadata(metadata: Partial<Book>) {
      patchState(store, (state) => ({
        book: state.book ? { ...state.book, ...metadata } : null,
        isDirty: true
      }));
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
    markAsSaved() {
      patchState(store, { isDirty: false });
    },
    addChapter(kind: ChapterKind = 'chapter') {
      patchState(store, (state) => {
        const sameKindChapters = state.chapters.filter(c => c.kind === kind);
        const nextNumber = kind === 'chapter' 
          ? (sameKindChapters.length > 0 ? Math.max(...sameKindChapters.map(c => c.number || 0)) + 1 : 1)
          : undefined;
        
        const titles: Record<ChapterKind, string> = {
          'front': 'Página frontal',
          'chapter': 'Capítulo ' + (nextNumber || ''),
          'back': 'Página posterior'
        };

        const newChapter: Chapter = {
          id: 'ch-' + Date.now().toString(36),
          kind,
          title: titles[kind],
          words: 0,
          readMin: 0,
          number: nextNumber,
          status: kind === 'chapter' ? 'draft' : (kind === 'front' ? 'front' : 'back'),
          body: [
            { type: kind === 'chapter' ? 'chapter-title' : 'h1', text: titles[kind] },
            { type: 'p', text: '' }
          ]
        };

        // insertion point: after last of same kind or at strategic boundaries
        let insertIndex = state.chapters.length;
        if (kind === 'front') {
          const lastFront = state.chapters.map(c => c.kind).lastIndexOf('front');
          insertIndex = lastFront >= 0 ? lastFront + 1 : 0;
        } else if (kind === 'chapter') {
          const lastChapter = state.chapters.map(c => c.kind).lastIndexOf('chapter');
          if (lastChapter >= 0) {
            insertIndex = lastChapter + 1;
          } else {
            const lastFront = state.chapters.map(c => c.kind).lastIndexOf('front');
            insertIndex = lastFront >= 0 ? lastFront + 1 : 0;
          }
        }
        
        const newChapters = [
          ...state.chapters.slice(0, insertIndex),
          newChapter,
          ...state.chapters.slice(insertIndex)
        ];

        return {
          chapters: newChapters,
          activeChapterId: newChapter.id,
          isDirty: true
        };
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
      patchState(store, (state) => {
        const chapters = state.chapters.map((c) => {
          if (c.id !== chapterId) return c;
          
          const editedBlock = c.body[blockIndex];
          const isTitleBlock = editedBlock.type === 'h1' || editedBlock.type === 'chapter-title';
          
          return {
            ...c,
            title: isTitleBlock ? (text || 'Sin título') : c.title,
            body: c.body.map((b, i) =>
              i === blockIndex ? { ...b, text, html } : b
            )
          };
        });
        return {
          chapters: chapters.map(c => 
            c.id === chapterId ? { ...c, words: calculateWords(c.body), readMin: calculateReadMin(calculateWords(c.body)) } : c
          ),
          isDirty: true
        };
      });
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
    insertBlock(chapterId: string, afterIndex: number, type: string, text: string = '') {
      patchState(store, (state) => {
        const chapters = state.chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                body: [
                  ...c.body.slice(0, afterIndex + 1),
                  { type, text },
                  ...c.body.slice(afterIndex + 1)
                ]
              }
            : c
        );
        return {
          chapters: chapters.map(c => 
            c.id === chapterId ? { ...c, words: calculateWords(c.body), readMin: calculateReadMin(calculateWords(c.body)) } : c
          ),
          isDirty: true
        };
      });
    },
    splitBlock(chapterId: string, blockIndex: number, cursorPosition: number) {
      patchState(store, (state) => {
        const chapters = state.chapters.map((c) =>
          c.id === chapterId
            ? {
                ...c,
                body: [
                  ...c.body.slice(0, blockIndex),
                  { ...c.body[blockIndex], text: c.body[blockIndex].text?.substring(0, cursorPosition) || '', html: undefined },
                  { type: 'p', text: c.body[blockIndex].text?.substring(cursorPosition) || '' },
                  ...c.body.slice(blockIndex + 1)
                ]
              }
            : c
        );
        return {
          chapters: chapters.map(c => 
            c.id === chapterId ? { ...c, words: calculateWords(c.body), readMin: calculateReadMin(calculateWords(c.body)) } : c
          ),
          isDirty: true
        };
      });
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

        const updatedChapter = { ...chapter, body: newBody };
        return {
          chapters: state.chapters.map(c => 
            c.id === chapterId ? { ...updatedChapter, words: calculateWords(updatedChapter.body), readMin: calculateReadMin(calculateWords(updatedChapter.body)) } : c
          ),
          isDirty: true
        };
      });
    },
    deleteBlock(chapterId: string, blockIndex: number) {
      patchState(store, (state) => {
        const chapters = state.chapters.map(c =>
          c.id === chapterId
            ? { ...c, body: c.body.filter((_, i) => i !== blockIndex) }
            : c
        );
        return {
          chapters: chapters.map(c =>
            c.id === chapterId ? { ...c, words: calculateWords(c.body), readMin: calculateReadMin(calculateWords(c.body)) } : c
          ),
          isDirty: true
        };
      });
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

        const updatedChapter = { ...chapter, body: newBody };
        return {
          chapters: state.chapters.map(c =>
            c.id === chapterId ? { ...updatedChapter, words: calculateWords(updatedChapter.body), readMin: calculateReadMin(calculateWords(updatedChapter.body)) } : c
          ),
          isDirty: true
        };
      });
    },
    updateTweak<K extends keyof Tweaks>(key: K, value: Tweaks[K]) {
      patchState(store, (state) => ({
        tweaks: { ...state.tweaks, [key]: value }
      }));
    },
    updateExportPrefs(prefs: Partial<BookState['exportPrefs']>) {
      patchState(store, (state) => ({
        exportPrefs: { ...state.exportPrefs, ...prefs }
      }));
    },
    updateAsset(id: string, data: string) {
      patchState(store, (state) => ({
        assets: { ...state.assets, [id]: data },
        isDirty: true
      }));
    },
    deleteAsset(id: string) {
      patchState(store, (state) => {
        const assets = { ...state.assets };
        delete assets[id];
        return { assets, isDirty: true };
      });
    },
    setReplaceQuery(query: string) {
      patchState(store, { replaceQuery: query });
    },
    setPersonalConfig(config: PersonalConfig) {
      patchState(store, { personalConfig: config });
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
        return { ...chapter, body: newBody, words: calculateWords(newBody), readMin: calculateReadMin(calculateWords(newBody)) };
      });
      
      patchState(store, {
        chapters,
        replaceQuery: replaceWith,
        searchResults: [],
        searchQuery: '',
        isDirty: true
      });
    }
  }))
);
