export type ChapterKind = 'front' | 'chapter' | 'back';
export type ChapterStatus = 'ok' | 'draft' | 'outline' | 'front' | 'back';

export interface Block {
  type: string;
  text?: string;
  html?: string;
  drop?: string;
}

export interface Chapter {
  id: string;
  kind: ChapterKind;
  title: string;
  words: number;
  readMin?: number;
  number?: number;
  status?: ChapterStatus;
  forceOddPage?: boolean;
  body: Block[];
}

export interface Book {
  title: string;
  subtitle: string;
  author: string;
  authors: string[];
  editors: string[];
  publisher: string;
  year: number;
  isbn: string;
  paperSize: '5x8' | '6x9' | 'A5' | 'A4' | 'A6' | 'Letter';
  lang?: string;
}

export interface Tweaks {
  sidebar: 'left' | 'right';
  mode: 'light' | 'dark';
  bookFont: 'spectral' | 'lora' | 'eb-garamond' | 'crimson-pro' | 'inter' | 'montserrat';
  spellcheck: boolean;
  // Detailed styles
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  indentFirstLine: boolean;
  indentSize: number;
  justifyText: boolean;
  // Layout styles
  marginTop: number;
  marginBottom: number;
  marginInner: number;
  marginOuter: number;
  showPageNumbers: boolean;
  showHeader: boolean;
  headerText: string;
  // Advanced Decoration
  sceneBreakType: 'asterisks' | 'dots' | 'flourish' | 'none';
  titleAlignment: 'left' | 'center' | 'right';
  titleFontSize: number;
  titleFont: 'spectral' | 'lora' | 'eb-garamond' | 'crimson-pro' | 'inter' | 'montserrat';
  titleBold: boolean;
  titleItalic: boolean;
  titleUnderline: boolean;
  pageNumberPosition: 'bottom-center' | 'bottom-edges' | 'top-edges';
  // Typographic tweaks
  dropCap: boolean;
  dropCapLines: number;
  hyphenation: boolean;
}

export type NoteRole = 'author' | 'editor' | 'corrector' | 'publisher';
export type NoteStatus = 'unresolved' | 'resolved' | 'not-applicable';

export interface Reply {
  id: string;
  authorName: string;
  role: NoteRole;
  content: string;
  date: string;
}

export interface Note {
  id: string;
  chapterId: string;
  blockIndex: number;
  role: NoteRole;
  authorName: string;
  content: string;
  date: string;
  status: NoteStatus;
  replies: Reply[];
}

export interface SearchResult {
  chapterId: string;
  chapterTitle: string;
  chapterKind: ChapterKind;
  chapterNumber?: number;
  blockIndex: number;
  blockType: string;
  matchIndex: number;
  before: string;
  match: string;
  after: string;
}

export interface PersonalConfig {
  avatar: string;
  userName: string;
  previewWidth: number;
  language: string;
}

export interface LibriaDocument {
  libriaVersion: string;
  metadata: Book | null;
  preferences: Tweaks;
  session: {
    lastActiveChapterId: string;
  };
  chapters: Chapter[];
  notes?: Note[];
  assets?: Record<string, string>;
}
