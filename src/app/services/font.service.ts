import { Injectable } from '@angular/core';

interface FontData {
  family: string;
  fullName: string;
  postscriptName: string;
  style: string;
  blob(): Promise<Blob>;
}

export interface FontVariant {
  buffer: ArrayBuffer;
  mimeType: string;
  style: string;
  weight: string;
}

@Injectable({ providedIn: 'root' })
export class FontService {
  private allFonts: FontData[] = [];
  private familyNames: string[] = [];
  private loaded = false;

  async loadSystemFonts(): Promise<string[]> {
    if (this.loaded) return this.familyNames;
    if (!('queryLocalFonts' in window)) return [];
    try {
      this.allFonts = await (window as any).queryLocalFonts() as FontData[];
      this.familyNames = [...new Set(this.allFonts.map(f => f.family))].sort((a, b) =>
        a.localeCompare(b)
      );
      this.loaded = true;
      return this.familyNames;
    } catch {
      return [];
    }
  }

  getLoadedFamilies(): string[] {
    return this.familyNames;
  }

  async getFontVariants(family: string): Promise<FontVariant[]> {
    if (!this.loaded) await this.loadSystemFonts();
    const matches = this.allFonts.filter(f => f.family === family);
    const results: FontVariant[] = [];
    for (const font of matches) {
      try {
        const blob = await font.blob();
        const buffer = await blob.arrayBuffer();
        const mimeType = blob.type || 'font/ttf';
        const { style, weight } = this.parseStyle(font.style);
        results.push({ buffer, mimeType, style, weight });
      } catch {
        // font file read failed, skip
      }
    }
    return results;
  }

  private parseStyle(styleName: string): { style: string; weight: string } {
    const lower = styleName.toLowerCase();
    const italic = lower.includes('italic') || lower.includes('oblique');
    let weight = '400';
    if (lower.includes('thin')) weight = '100';
    else if (lower.includes('extralight') || lower.includes('extra light')) weight = '200';
    else if (lower.includes('light')) weight = '300';
    else if (lower.includes('medium')) weight = '500';
    else if (lower.includes('semibold') || lower.includes('semi bold') || lower.includes('demibold') || lower.includes('demi')) weight = '600';
    else if (lower.includes('extrabold') || lower.includes('extra bold') || lower.includes('ultrabold')) weight = '800';
    else if (lower.includes('black') || lower.includes('heavy') || lower.includes('ultra')) weight = '900';
    else if (lower.includes('bold')) weight = '700';
    return { style: italic ? 'italic' : 'normal', weight };
  }
}
