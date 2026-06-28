export type ChapterKind = 'front' | 'chapter' | 'back';
export type ChapterStatus = 'ok' | 'draft' | 'outline' | 'front' | 'back';

export interface Block {
  type: string;
  text?: string;
  html?: string;
  drop?: string;
  src?: string; // asset key for image blocks
  width?: number;
  height?: number;
  caption?: string;
  attribution?: string; // for epigraph: —Author, Work
  rotation?: number; // 0 | 90 | 180 | 270
  flipH?: boolean;
  flipV?: boolean;
}

export interface Footnote {
  id: string;
  blockIndex: number;
  content: string;
}

export function sortFootnotesByPosition(footnotes: Footnote[] | undefined, body: Block[]): Footnote[] {
  if (!footnotes?.length) return [];
  return [...footnotes].sort((a, b) => {
    if (a.blockIndex !== b.blockIndex) return a.blockIndex - b.blockIndex;
    const htmlA = body[a.blockIndex]?.html || '';
    const htmlB = body[b.blockIndex]?.html || '';
    return htmlA.indexOf(`data-fn="${a.id}"`) - htmlB.indexOf(`data-fn="${b.id}"`);
  });
}

export type ChapterTemplateId = 'title-page' | 'credits' | 'dedication' | 'acknowledgments' | 'toc';

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
  footnotes?: Footnote[];
  templateId?: ChapterTemplateId;
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
  pdfxCompliant: boolean;
  bookFont: 'spectral' | 'lora' | 'eb-garamond' | 'crimson-pro' | 'inter' | 'montserrat';
  customBookFont: string | null;
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
  sceneBreakType: 'asterisks' | 'asterisks3' | 'dots' | 'flourish' | 'none';
  titleAlignment: 'left' | 'center' | 'right';
  titleFontSize: number;
  titleFont: 'spectral' | 'lora' | 'eb-garamond' | 'crimson-pro' | 'inter' | 'montserrat';
  customTitleFont: string | null;
  titleBold: boolean;
  titleItalic: boolean;
  titleUnderline: boolean;
  pageNumberPosition: 'bottom-center' | 'bottom-edges' | 'top-edges';
  // Typographic tweaks
  dropCap: boolean;
  dropCapLines: number;
  hyphenation: boolean;
  smartQuotes: boolean;
  smartDashes: boolean;
  smartEllipsis: boolean;
  smartOpeningSigns: boolean;
}

export interface BookTheme {
  id: string;
  /** i18n key, e.g. 'themes.classic', or a free string for custom themes */
  name: string;
  tweaks: Partial<Tweaks>;
  /** true = user-created theme; undefined/false = built-in preset */
  isCustom?: boolean;
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

export interface WritingGoals {
  targetWords: number;
  deadline: string;
}

export interface Misspelling {
  word: string;
  blockIndex: number;
  start: number;
  end: number;
  suggestions: string[];
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

export interface RecentProject {
  path: string;
  title: string;
  date: string;
}

export interface PersonalConfig {
  avatar: string;
  userName: string;
  previewWidth: number;
  language: string;
  mode: 'light' | 'dark';
}

export interface CharacterSheet {
  id: string;
  name: string;
  content: string;
}

export interface LocationSheet {
  id: string;
  name: string;
  content: string;
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
  writingGoals?: WritingGoals;
  characters?: CharacterSheet[];
  locations?: LocationSheet[];
}
