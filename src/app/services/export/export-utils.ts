import { Block, Chapter } from '../../models/book.models';
export function resolveChapters(
  all: Chapter[],
  prefs: { exportMode: 'all' | 'selection'; selectedChapterIds: string[] },
): Chapter[] {
  if (prefs.exportMode === 'selection' && prefs.selectedChapterIds.length > 0) {
    return all.filter((c) => prefs.selectedChapterIds.includes(c.id));
  }
  return all;
}

export function imageStyle(b: Block): string {
  const parts = ['max-width:100%;display:block;margin:0 auto'];
  if (b.width && b.height) {
    parts.push(`width:${b.width}px;height:${b.height}px`);
  } else {
    parts.push('height:auto');
  }
  const xf: string[] = [];
  if (b.rotation && b.rotation !== 0) xf.push(`rotate(${b.rotation}deg)`);
  if (b.flipH) xf.push('scaleX(-1)');
  if (b.flipV) xf.push('scaleY(-1)');
  if (xf.length) parts.push(`transform:${xf.join(' ')}`);
  return parts.join(';');
}

export function tableHtml(html: string): string {
  if (!html) return '';
  return html.startsWith('<table') ? html : '<table>' + html + '</table>';
}

export function fontName(key: string): string {
  const m: Record<string, string> = {
    spectral: 'Spectral',
    lora: 'Lora',
    'eb-garamond': 'EB Garamond',
    'crimson-pro': 'Crimson Pro',
    inter: 'Inter',
    montserrat: 'Montserrat',
  };
  return m[key] || 'Spectral';
}

export function align(val: string) {
  if (val === 'left') return 'left';
  if (val === 'right') return 'right';
  if (val === 'justify') return 'both';
  return 'center';
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(';base64,');
  const byteString = atob(parts[1]);
  const mimeString = parts[0].split(':')[1];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}
export {
  escapeHtml,
  sceneBreakGlyph as sceneGlyphText,
  imageExt,
  pageSizeInches as pageSizeToInches,
} from '../../utils/block-maps';
export function xhtmlSafe(str: string): string {
  return str.replace(/<br\s*\/?>/gi, '<br/>').replace(/&nbsp;/g, '&#160;');
}
