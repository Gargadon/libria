import { Injectable, inject } from '@angular/core';

import { FontService } from '../font.service';

import type JSZip from 'jszip';

const EPUB_FONT_MAP: Record<
  string,
  {
    family: string;
    files: { filename: string; style: string; weight: string }[];
  }
> = {
  spectral: {
    family: 'Spectral',
    files: [
      { filename: 'rnCr-xNNww_2s0amA9M5kng.woff2', style: 'normal', weight: '400' },
      { filename: 'rnCt-xNNww_2s0amA9M8onrmTA.woff2', style: 'italic', weight: '400' },
      { filename: 'rnCs-xNNww_2s0amA9vmtm3BafY.woff2', style: 'normal', weight: '600' },
    ],
  },
  lora: {
    family: 'Lora',
    files: [
      { filename: '0QIvMX1D_JOuMwr7Iw.woff2', style: 'normal', weight: '400 700' },
      {
        filename: '0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFoq92nA.woff2',
        style: 'italic',
        weight: '400 700',
      },
    ],
  },
  'eb-garamond': {
    family: 'EB Garamond',
    files: [
      { filename: 'SlGUmQSNjdsmc35JDF1K5GR1SDk.woff2', style: 'normal', weight: '400 800' },
      { filename: 'SlGWmQSNjdsmc35JDF1K5GRweDs1Zw.woff2', style: 'italic', weight: '400 800' },
    ],
  },
  'crimson-pro': {
    family: 'Crimson Pro',
    files: [
      { filename: 'q5uDsoa5M_tv7IihmnkabARboYE.woff2', style: 'normal', weight: '200 900' },
      { filename: 'q5uBsoa5M_tv7IihmnkabARekYNwDQ.woff2', style: 'italic', weight: '200 900' },
    ],
  },
  inter: {
    family: 'Inter',
    files: [
      {
        filename: 'UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2',
        style: 'normal',
        weight: '100 900',
      },
    ],
  },
  montserrat: {
    family: 'Montserrat',
    files: [
      { filename: 'JTUSjIg1_i6t8kCHKm459Wlhyw.woff2', style: 'normal', weight: '100 900' },
      { filename: 'JTUQjIg1_i6t8kCHKm459WxRyS7m.woff2', style: 'italic', weight: '100 900' },
    ],
  },
};

@Injectable({ providedIn: 'root' })
export class EpubFontService {
  private readonly fontService = inject(FontService);
  async loadEpubFonts(
    zip: JSZip,
    bookFontKey: string,
    titleFontKey: string,
    customBookFont?: string | null,
    customTitleFont?: string | null,
  ): Promise<{ fontFaceCss: string; fontManifest: string }> {
    const keys = [...new Set([bookFontKey, titleFontKey])].filter((k) => EPUB_FONT_MAP[k]);
    let fontFaceCss = '';
    let fontManifest = '';

    for (const key of keys) {
      const def = EPUB_FONT_MAP[key];
      for (const f of def.files) {
        try {
          const resp = await fetch(`fonts/${f.filename}`);
          if (!resp.ok) continue;
          const buf = await resp.arrayBuffer();
          zip.file(`OEBPS/fonts/${f.filename}`, buf);
          const id = `font-${f.filename.replace(/\W/g, '-')}`;
          fontManifest += `    <item id="${id}" href="fonts/${f.filename}" media-type="font/woff2"/>\n`;
          fontFaceCss += `@font-face { font-family: '${def.family}'; src: url('fonts/${f.filename}') format('woff2'); font-style: ${f.style}; font-weight: ${f.weight}; }\n`;
        } catch {
          // font file unavailable, skip
        }
      }
    }

    // Embed system fonts selected by the user
    const customFamilies = [
      ...new Set([customBookFont, customTitleFont].filter(Boolean) as string[]),
    ];
    for (const family of customFamilies) {
      try {
        const variants = await this.fontService.getFontVariants(family);
        const safeName = family.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        for (let i = 0; i < variants.length; i++) {
          const v = variants[i];
          const ext = this.fontMimeToExt(v.mimeType);
          const filename = `${safeName}-${v.style}-${v.weight}.${ext}`;
          zip.file(`OEBPS/fonts/${filename}`, v.buffer);
          const id = `font-sys-${safeName}-${i}`;
          const format = this.fontMimeToFormat(v.mimeType);
          fontManifest += `    <item id="${id}" href="fonts/${filename}" media-type="${v.mimeType}"/>\n`;
          fontFaceCss += `@font-face { font-family: '${family}'; src: url('fonts/${filename}') format('${format}'); font-style: ${v.style}; font-weight: ${v.weight}; }\n`;
        }
      } catch {
        // system font unavailable, skip
      }
    }

    return { fontFaceCss, fontManifest };
  }
  private fontMimeToExt(mime: string): string {
    if (mime.includes('woff2')) return 'woff2';
    if (mime.includes('woff')) return 'woff';
    if (mime.includes('otf') || mime.includes('opentype')) return 'otf';
    return 'ttf';
  }
  private fontMimeToFormat(mime: string): string {
    if (mime.includes('woff2')) return 'woff2';
    if (mime.includes('woff')) return 'woff';
    if (mime.includes('otf') || mime.includes('opentype')) return 'opentype';
    return 'truetype';
  }
}
