export const SCENE_BREAK_GLYPHS: Record<string, string> = {
  asterisks: '✦ ✦ ✦',
  asterisks3: '* * *',
  dots: '· · ·',
  flourish: '— o —',
  none: '',
};

export function sceneBreakGlyph(type: string): string {
  return SCENE_BREAK_GLYPHS[type] ?? '* * *';
}

export const FONT_MAP: Record<string, string> = {
  spectral: 'Spectral',
  lora: 'Lora',
  'eb-garamond': 'EB Garamond',
  'crimson-pro': 'Crimson Pro',
  inter: 'Inter',
  montserrat: 'Montserrat',
};

export function fontFamily(font: string, custom: string | null): string {
  if (custom) return `"${custom}", serif`;
  switch (font) {
    case 'eb-garamond': return "'EB Garamond', serif";
    case 'crimson-pro': return "'Crimson Pro', serif";
    case 'lora': return "'Lora', serif";
    case 'spectral': return "'Spectral', serif";
    case 'inter': return "'Inter', sans-serif";
    case 'montserrat': return "'Montserrat', sans-serif";
    default: return 'serif';
  }
}

export const PAGE_SIZE_CSS: Record<string, string> = {
  '5x8': '5in 8in',
  '6x9': '6in 9in',
  'Letter': '8.5in 11in',
  'A5': '148mm 210mm',
  'A4': '210mm 297mm',
  'A6': '105mm 148mm',
};

export function pageSizeCss(paperSize: string): string {
  return PAGE_SIZE_CSS[paperSize] || '5in 8in';
}

export const PAGE_SIZE_INCHES: Record<string, { width: number; height: number }> = {
  '5x8': { width: 5, height: 8 },
  '6x9': { width: 6, height: 9 },
  'Letter': { width: 8.5, height: 11 },
  'A5': { width: 5.827, height: 8.268 },
  'A4': { width: 8.268, height: 11.693 },
  'A6': { width: 4.134, height: 5.827 },
};

export function pageSizeInches(size: string): { width: number; height: number } {
  return PAGE_SIZE_INCHES[size] || PAGE_SIZE_INCHES['5x8'];
}

export const UI_LOCALE_MAP: Record<string, string> = {
  en: 'en-US', fr: 'fr-FR', it: 'it-IT', pt: 'pt-BR',
};

export function uiLocale(lang: string): string {
  return UI_LOCALE_MAP[lang] || 'es-ES';
}

export const UNTITLED_LABELS: Record<string, string> = {
  en: 'Untitled', fr: 'Sans titre', it: 'Senza titolo', pt: 'Sem título',
};

export function untitledLabel(lang: string): string {
  return UNTITLED_LABELS[lang] || 'Sin título';
}

export const NEW_PROJECT_LABELS: Record<string, { title: string; chapter: string; docLang: string }> = {
  en: { title: 'New Book', chapter: 'Chapter 1', docLang: 'en-US' },
  fr: { title: 'Nouveau livre', chapter: 'Chapitre 1', docLang: 'fr-FR' },
  it: { title: 'Nuovo libro', chapter: 'Capitolo 1', docLang: 'it-IT' },
  de: { title: 'Neues Buch', chapter: 'Kapitel 1', docLang: 'de-DE' },
  pt: { title: 'Novo Livro', chapter: 'Capítulo 1', docLang: 'pt-BR' },
};

export function newProjectLabels(lang: string): { title: string; chapter: string; docLang: string } {
  return NEW_PROJECT_LABELS[lang] || { title: 'Nuevo Libro', chapter: 'Capítulo 1', docLang: 'es-MX' };
}

export const NOTE_STATUS_SEQUENCE: ('unresolved' | 'resolved' | 'not-applicable')[] = ['unresolved', 'resolved', 'not-applicable'];

export function nextNoteStatus(current: 'unresolved' | 'resolved' | 'not-applicable'): 'unresolved' | 'resolved' | 'not-applicable' {
  const idx = NOTE_STATUS_SEQUENCE.indexOf(current);
  return NOTE_STATUS_SEQUENCE[(idx + 1) % NOTE_STATUS_SEQUENCE.length];
}

export function noteStatusIcon(status: string): string {
  return { unresolved: '○', resolved: '●', 'not-applicable': '×' }[status] || '○';
}

export function noteStatusTitle(status: string): string {
  return { unresolved: 'Pendiente', resolved: 'Resuelto', 'not-applicable': 'No aplica' }[status] || 'Pendiente';
}

export function ptToPx(pt: number): number {
  return pt * 96 / 72;
}

export function escapeHtml(str: string): string {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function xhtmlSafe(str: string): string {
  return str.replace(/<br\s*\/?>/gi, '<br/>').replace(/&nbsp;/g, '&#160;');
}

export function imageExt(dataUrl: string): string {
  const m = dataUrl.match(/^data:image\/(\w+);/);
  const ext = m?.[1] ?? 'png';
  if (ext === 'jpeg') return 'jpg';
  if (ext === 'svg+xml') return 'png';
  return ext;
}

export function imageTransform(rotation?: number, flipH?: boolean, flipV?: boolean): string;
export function imageTransform(block?: { rotation?: number; flipH?: boolean; flipV?: boolean }): string;
export function imageTransform(rotationOrBlock?: number | { rotation?: number; flipH?: boolean; flipV?: boolean }, flipH?: boolean, flipV?: boolean): string {
  let rotation = 0, fH = false, fV = false;
  if (typeof rotationOrBlock === 'object' && rotationOrBlock !== null) {
    rotation = rotationOrBlock.rotation ?? 0;
    fH = rotationOrBlock.flipH ?? false;
    fV = rotationOrBlock.flipV ?? false;
  } else {
    rotation = (rotationOrBlock as number) ?? 0;
    fH = flipH ?? false;
    fV = flipV ?? false;
  }
  const parts: string[] = [];
  if (rotation && rotation !== 0) parts.push(`rotate(${rotation}deg)`);
  if (fH) parts.push('scaleX(-1)');
  if (fV) parts.push('scaleY(-1)');
  return parts.join(' ') || 'none';
}

export function titleBlockStyles(
  tweaks: { titleFontSize: number; titleBold: boolean; titleItalic: boolean; titleUnderline: boolean; titleAlignment: string },
  fontFamily: string,
  sizeMultiplier = 1
): Record<string, string> {
  return {
    'font-family': fontFamily,
    'font-size': `${ptToPx(tweaks.titleFontSize) * sizeMultiplier}px`,
    'text-align': tweaks.titleAlignment,
    'font-weight': tweaks.titleBold ? 'bold' : 'normal',
    'font-style': tweaks.titleItalic ? 'italic' : 'normal',
    'text-decoration': tweaks.titleUnderline ? 'underline' : 'none',
  };
}
