import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BookStore } from '../store/book.store';
import { sortFootnotesByPosition, Block } from '../models/book.models';
import { HyphenService } from './hyphen.service';
import { AssetService } from './asset.service';
import type JSZip from 'jszip';
import type {
  Paragraph,
  TextRun,
  TableOfContents,
  Table,
  TableRow,
  TableCell,
  FootnoteReferenceRun,
  IMediaTransformation,
} from 'docx';

const EPUB_FONT_MAP: Record<string, {
  family: string;
  files: { filename: string; style: string; weight: string }[];
}> = {
  spectral: { family: 'Spectral', files: [
    { filename: 'rnCr-xNNww_2s0amA9M5kng.woff2', style: 'normal', weight: '400' },
    { filename: 'rnCt-xNNww_2s0amA9M8onrmTA.woff2', style: 'italic', weight: '400' },
    { filename: 'rnCs-xNNww_2s0amA9vmtm3BafY.woff2', style: 'normal', weight: '600' },
  ]},
  lora: { family: 'Lora', files: [
    { filename: '0QIvMX1D_JOuMwr7Iw.woff2', style: 'normal', weight: '400 700' },
    { filename: '0QI8MX1D_JOuMw_hLdO6T2wV9KnW-MoFoq92nA.woff2', style: 'italic', weight: '400 700' },
  ]},
  'eb-garamond': { family: 'EB Garamond', files: [
    { filename: 'SlGUmQSNjdsmc35JDF1K5GR1SDk.woff2', style: 'normal', weight: '400 800' },
    { filename: 'SlGWmQSNjdsmc35JDF1K5GRweDs1Zw.woff2', style: 'italic', weight: '400 800' },
  ]},
  'crimson-pro': { family: 'Crimson Pro', files: [
    { filename: 'q5uDsoa5M_tv7IihmnkabARboYE.woff2', style: 'normal', weight: '200 900' },
    { filename: 'q5uBsoa5M_tv7IihmnkabARekYNwDQ.woff2', style: 'italic', weight: '200 900' },
  ]},
  inter: { family: 'Inter', files: [
    { filename: 'UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7.woff2', style: 'normal', weight: '100 900' },
  ]},
  montserrat: { family: 'Montserrat', files: [
    { filename: 'JTUSjIg1_i6t8kCHKm459Wlhyw.woff2', style: 'normal', weight: '100 900' },
    { filename: 'JTUQjIg1_i6t8kCHKm459WxRyS7m.woff2', style: 'italic', weight: '100 900' },
  ]},
};

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly store = inject(BookStore);
  private readonly ts = inject(TranslateService);
  private readonly hyphenService = inject(HyphenService);
  private readonly assetService = inject(AssetService);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _jszip: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _docx: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _saveAs: any;

  async exportEpub() {
    this.store.setExporting(true, this.ts.instant('sidebar.exportingEpub'));
    try {
      if (!this._jszip) this._jszip = ((await import('jszip')) as any).default ?? (await import('jszip'));
      const JSZip = this._jszip;
      const zip = new JSZip();
      const book = this.store.book();
      const chapters = this.store.chapters();
      const assets = this.assetService.getAll();
      const prefs = this.store.exportPrefs();
      const tweaks = this.store.tweaks();
      const bodyFontFamily = this.store.bookFontFamily();
      const titleFontFamily = this.store.titleFontFamily();

      if (!book) return;

      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

      this.store.setExporting(true, this.ts.instant('sidebar.exportingFonts'));
      const { fontFaceCss, fontManifest: epubFontManifest } =
        await this.loadEpubFonts(zip, tweaks.bookFont ?? '', tweaks.titleFont ?? '');
    zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    let coverManifest = '';
    let coverSpine = '';
    if (prefs.includeCover && assets['cover']) {
      const coverData = assets['cover'];
      const mime = coverData.split(';')[0].split(':')[1];
      const ext = mime.split('/')[1];
      const coverBlob = this.dataUrlToBlob(coverData);
      zip.file(`OEBPS/images/cover.${ext}`, coverBlob);
      coverManifest = `    <item id="cover-image" href="images/cover.${ext}" media-type="${mime}" properties="cover-image"/>\n`;
      coverManifest += `    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n`;
      coverSpine = `    <itemref idref="cover"/>\n`;

      zip.file('OEBPS/cover.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Portada</title><style>body { margin: 0; padding: 0; text-align: center; } img { max-width: 100%; height: auto; }</style></head>
<body><img src="images/cover.${ext}" alt="Portada"/></body>
</html>`);
    }

    const manifestParts: string[] = [];
    const spineParts: string[] = [];
    chapters.forEach((c, i) => {
      manifestParts.push(`    <item id="chapter_${i}" href="chapters/${c.id}.xhtml" media-type="application/xhtml+xml"/>\n`);
      spineParts.push(`    <itemref idref="chapter_${i}"/>\n`);
    });
    const manifest = manifestParts.join('');
    const spine = spineParts.join('');

    const imageKeys = new Set<string>();
    chapters.forEach(c => c.body.forEach(b => { if (b.type === 'image' && b.src && assets[b.src]) imageKeys.add(b.src); }));
    const imageManifestParts: string[] = [];
    imageKeys.forEach(key => {
      const ext = this.imageExt(assets[key]);
      const blob = this.dataUrlToBlob(assets[key]);
      zip.file(`OEBPS/images/img-${key}.${ext}`, blob);
      imageManifestParts.push(`    <item id="img-${key}" href="images/img-${key}.${ext}" media-type="image/${ext === 'jpg' ? 'jpeg' : ext}"/>\n`);
    });
    const imageManifest = imageManifestParts.join('');

    const esc = (s: string) => this.escapeHtml(s);
    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${esc(book.isbn) || 'libria-' + Date.now()}</dc:identifier>
    <dc:title>${esc(book.title)}</dc:title>
    <dc:creator>${esc(book.author)}</dc:creator>
    <dc:language>${book.lang ?? 'es'}</dc:language>
    <dc:publisher>${esc(book.publisher || 'Libria')}</dc:publisher>
    <dc:date>${book.year}-01-01</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${coverManifest}
${epubFontManifest}
${imageManifest}
${manifest}
  </manifest>
  <spine>
${coverSpine}
${prefs.includeTOC ? '    <itemref idref="nav"/>\n' : ''}${spine}
  </spine>
</package>`;
    zip.file('OEBPS/content.opf', opf);

    const dropCapStyles = tweaks.dropCap ? `.first-p::first-letter { float: left; font-size: 3.5em; line-height: 0.8; padding-right: 8px; font-weight: bold; }` : '';
    zip.file('OEBPS/styles.css', `${fontFaceCss}body { font-family: ${bodyFontFamily}, serif; padding: 5%; line-height: 1.5; }
h1, h2 { font-family: ${titleFontFamily}, serif; text-align: center; }
p { margin: 0; text-align: justify; }
p + p { text-indent: 1.5em; }
.first-p { text-indent: 0; }
.kp-list { margin: 0.5em 0; padding-left: 1.5em; }
.kp-list li { margin: 0.2em 0; }
.kp-table-wrap { overflow-x: auto; margin: 1em 0; }
.kp-table-wrap table { border-collapse: collapse; width: 100%; }
.kp-table-wrap td, .kp-table-wrap th { border: 1px solid #ccc; padding: 6px; text-align: left; vertical-align: top; }
.kp-fnpanel { margin-top: 2em; font-size: 0.85em; color: #555; }
.kp-fnpanel-rule { border: 0; border-top: 1px solid #ccc; margin-bottom: 0.8em; }
.kp-fnpanel-item { margin-bottom: 0.4em; line-height: 1.4; }
.kp-fnpanel-num { font-weight: bold; }
.kp-epigraph { text-align: center; margin: 1.5em 0; }
.kp-epigraph blockquote { font-style: italic; font-size: 0.9em; margin: 0; }
.kp-epigraph cite { display: block; margin-top: 0.5em; font-size: 0.85em; color: #555; }
.kp-verse { font-family: 'Courier New', Courier, monospace; font-size: 0.9em; white-space: pre-line; line-height: 1.6; margin: 1em 0; }
.kp-code { background: #f5f3f1; padding: 1em; border-radius: 4px; font-family: 'Courier New', Courier, monospace; font-size: 0.85em; white-space: pre-wrap; word-break: break-word; }
.kp-code code { font-family: inherit; }
${dropCapStyles}`);

    const navLinkParts: string[] = [];
    chapters.forEach((c, i) => {
      navLinkParts.push(`<li><a href="chapters/${c.id}.xhtml">${this.escapeHtml(c.title)}</a></li>`);
      const contentParts: string[] = [];
      c.body.forEach(b => {
        const raw = this.xhtmlSafe(b.html || this.escapeHtml(b.text || ''));
        switch (b.type) {
          case 'halftitle':     contentParts.push(`<h1 class="kp-halftitle">${raw}</h1>`); break;
          case 'title':         contentParts.push(`<h1 class="kp-title">${raw}</h1>`); break;
          case 'subtitle':      contentParts.push(`<div class="kp-sub">${raw}</div>`); break;
          case 'author':        contentParts.push(`<div class="kp-author">${raw}</div>`); break;
          case 'publisher':     contentParts.push(`<div class="kp-pub">${raw}</div>`); break;
          case 'dedication':    contentParts.push(`<div class="kp-ded">${raw}</div>`); break;
          case 'chapter-num':   contentParts.push(`<div class="kp-chnum">${raw}</div>`); break;
          case 'chapter-title': contentParts.push(`<h2>${raw}</h2>`); break;
          case 'h1':            contentParts.push(`<h2 class="kp-h1">${raw}</h2>`); break;
          case 'h2':            contentParts.push(`<h3 class="kp-h2">${raw}</h3>`); break;
          case 'h3':            contentParts.push(`<h4 class="kp-h3">${raw}</h4>`); break;
          case 'first-p':       contentParts.push(`<p class="first-p">${raw}</p>`); break;
          case 'p':             contentParts.push(`<p>${raw}</p>`); break;
          case 'blockquote':    contentParts.push(`<blockquote>${raw}</blockquote>`); break;
          case 'epigraph': {
            const att = this.escapeHtml(b.attribution || '');
            contentParts.push(`<div class="kp-epigraph"><blockquote>${raw}</blockquote>${att ? `<cite>— ${att}</cite>` : ''}</div>`);
            break;
          }
          case 'verse':         contentParts.push(`<pre class="kp-verse"><code>${raw}</code></pre>`); break;
          case 'code':          contentParts.push(`<pre class="kp-code"><code>${raw}</code></pre>`); break;
          case 'scene-break':   contentParts.push(`<p style="text-align:center;margin:1em 0;color:#888">${this.sceneGlyphText(tweaks.sceneBreakType) || '* * *'}</p>`); break;
          case 'page-break':    contentParts.push(`<div style="page-break-after:always"></div>`); break;
          case 'image': {
            if (b.src && assets[b.src]) {
              const imgStyle = this.imageStyle(b);
              const ext = this.imageExt(assets[b.src]);
              const cap = b.caption ? `<figcaption style="text-align:center;font-size:0.85em;margin-top:0.5em;color:#555">${this.escapeHtml(b.caption)}</figcaption>` : '';
              contentParts.push(`<figure style="text-align:center;margin:1em 0"><img src="../images/img-${b.src}.${ext}" style="${imgStyle}" alt=""/>${cap}</figure>`);
            }
            break;
          }
          case 'list-unordered': contentParts.push(`<ul class="kp-list">${raw}</ul>`); break;
          case 'list-ordered':   contentParts.push(`<ol class="kp-list">${raw}</ol>`); break;
          case 'table':          contentParts.push(`<div class="kp-table-wrap">${this.tableHtml(raw)}</div>`); break;
          default:              contentParts.push(`<p>[${b.type}]</p>`); break;
        }
      });
      const sortedFns = sortFootnotesByPosition(c.footnotes, c.body);
      if (sortedFns.length) {
        contentParts.push(`<div class="kp-fnpanel"><hr class="kp-fnpanel-rule">`);
        sortedFns.forEach((fn: any, fi: number) => {
          const fnText = this.escapeHtml(fn.content || '');
          contentParts.push(`<div class="kp-fnpanel-item"><span class="kp-fnpanel-num">${fi + 1}.</span> <span class="kp-fnpanel-text">${fnText}</span></div>`);
        });
        contentParts.push(`</div>`);
      }
      const content = contentParts.join('');
      zip.file(`OEBPS/chapters/${c.id}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${this.escapeHtml(c.title)}</title><link rel="stylesheet" type="text/css" href="../styles.css"/></head>
<body>${content}</body></html>`);
    });
    const navLinks = navLinkParts.join('');

    const tocLabelMap: Record<string, string> = { es: 'Contenidos', en: 'Contents', fr: 'Table des matières', it: 'Indice', pt: 'Sumário' };
    const tocLabel = tocLabelMap[(book.lang ?? 'es').slice(0, 2)] ?? 'Contents';
    zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${tocLabel}</title></head>
<body><nav epub:type="toc"><h1>${tocLabel}</h1><ol>${navLinks}</ol></nav></body></html>`);

    this.store.setExporting(true, this.ts.instant('sidebar.exportingEpub'));
    const content = await zip.generateAsync({ type: 'blob' });
    this.downloadFile(content, `${book.title}.epub`);
    } finally {
      this.store.setExporting(false);
    }
  }

  async exportPdf() {
    this.store.setExporting(true, this.ts.instant('sidebar.exportingPdf'));
    try {
      const book = this.store.book();
      if (!book) return;

      const chapters = this.store.chapters();
      const t = this.store.tweaks();
      const bodyFontFamily = this.store.bookFontFamily();
      const titleFontFamily = this.store.titleFontFamily();

      const html = this.buildPrintHtml(book, chapters, t, bodyFontFamily, titleFontFamily, undefined, this.assetService.getAll());
      const pageSize = this.pageSizeToInches(book.paperSize || '5x8');

      const pdfOptions: Record<string, any> = {
        pageSize,
        printBackground: true,
        pdfx: t.pdfxCompliant || false,
        margins: {
          marginType: 'custom',
          top: t.marginTop / 25.4,
          bottom: t.marginBottom / 25.4,
          left: 0,
          right: 0,
        },
      };

      // We use CSS @page margin boxes for headers and footers instead of legacy printToPDF templates
      pdfOptions['displayHeaderFooter'] = false;


      const pdfData = await (window as any).electronAPI.printFromHTML(html, pdfOptions);
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      this.downloadFile(blob, `${book.title}.pdf`);
    } catch (error) {
      console.error('PDF export failed', error);
    } finally {
      this.store.setExporting(false);
    }
  }

  private pageSizeToInches(size: string): { width: number; height: number } {
    const map: Record<string, { width: number; height: number }> = {
      '5x8':   { width: 5,     height: 8     },
      '6x9':   { width: 6,     height: 9     },
      'Letter':{ width: 8.5,   height: 11    },
      'A5':    { width: 5.827, height: 8.268 },
      'A4':    { width: 8.268, height: 11.693},
      'A6':    { width: 4.134, height: 5.827 },
    };
    return map[size] || map['5x8'];
  }

  buildPrintHtml(
    book: any,
    chapters: any[],
    t: any,
    bodyFontFamily: string,
    titleFontFamily: string,
    fontsHref?: string,
    assets: Record<string, string> = {},
  ): string {
    const pageSizeCss: Record<string, string> = {
      '5x8':   '5in 8in',
      '6x9':   '6in 9in',
      'Letter':'8.5in 11in',
      'A5':    '148mm 210mm',
      'A4':    '210mm 297mm',
      'A6':    '105mm 148mm',
    };
    const pageSize = pageSizeCss[book.paperSize || '5x8'] || '5in 8in';

    // Fonts are injected by the main process from public/fonts.css (local WOFF2).
    const sceneGlyph: Record<string, string> = {
      asterisks: '✦ ✦ ✦',
      asterisks3: '* * *',
      dots: '· · ·',
      flourish: '— o —',
      none: '',
    };
    const brk = sceneGlyph[t.sceneBreakType] ?? '* * *';

    const pGap   = `${(t.paragraphSpacing / t.fontSize).toFixed(3)}em`;
    const indent = t.indentFirstLine ? `${t.indentSize}cm` : '0';
    const align  = t.justifyText ? 'justify' : 'left';
    const hyphens = t.hyphenation ? '-webkit-hyphens:manual;hyphens:manual;' : '';
    const dropLines = t.dropCapLines ?? 3;

    const titleW = t.titleBold ? 'bold' : 'normal';
    const titleS = t.titleItalic ? 'italic' : 'normal';
    const titleD = t.titleUnderline ? 'underline' : 'none';
    const tAlign = t.titleAlignment ?? 'center';

    const screenCss = fontsHref ? `
html, body { height: 100vh; margin: 0; padding: 0; overflow: hidden; scrollbar-width: none; }
html::-webkit-scrollbar { display: none; }
.pv-clip {
  width: 100vw;
  height: 100vh;
  overflow: clip;
}
.pv-slider {
  width: 100%;
  height: 100%;
  transform: translateX(calc(var(--pi, 0) * -100vw));
  will-change: transform;
}
.pv-flow {
  height: 100vh;
  column-fill: auto;
  column-width: 100vw;
  column-gap: 0;
  overflow: visible;
}
.kp-quote { margin-left: 0.5px; }` : '';

    let marginBoxesCss = '';
    if (!fontsHref) {
      const showHdr = t.showHeader;
      const showPN = t.showPageNumbers;
      const pnp = t.pageNumberPosition;
      const esc = (s: string) => this.escapeHtml(s);
      const headerVal = esc(t.headerText || book.title);

      const headerFooterStyle = `
        font-family: ${bodyFontFamily};
        font-size: 9pt;
        color: #555;
        font-weight: normal;
        font-style: normal;
      `;

      marginBoxesCss = `
@page :first {
  @top-left { content: none !important; }
  @top-center { content: none !important; }
  @top-right { content: none !important; }
  @bottom-left { content: none !important; }
  @bottom-center { content: none !important; }
  @bottom-right { content: none !important; }
}
      `;

      if (showHdr) {
        marginBoxesCss += `
@page {
  @top-center {
    content: "${headerVal}";
    ${headerFooterStyle}
    font-style: italic;
  }
}
        `;
      }

      if (showPN) {
        if (pnp === 'bottom-center') {
          marginBoxesCss += `
@page {
  @bottom-center {
    content: counter(page);
    ${headerFooterStyle}
  }
}
          `;
        } else if (pnp === 'bottom-edges') {
          marginBoxesCss += `
@page :left {
  @bottom-left {
    content: counter(page);
    ${headerFooterStyle}
  }
}
@page :right {
  @bottom-right {
    content: counter(page);
    ${headerFooterStyle}
  }
}
          `;
        } else if (pnp === 'top-edges') {
          marginBoxesCss += `
@page :left {
  @top-left {
    content: counter(page);
    ${headerFooterStyle}
  }
}
@page :right {
  @top-right {
    content: counter(page);
    ${headerFooterStyle}
  }
}
          `;
        }
      }
    }

    const css = `
* { box-sizing: border-box; margin: 0; padding: 0; }

@page {
  size: ${pageSize};
}
@page :left {
  margin-left: ${t.marginOuter}mm;
  margin-right: ${t.marginInner}mm;
}
@page :right {
  margin-left: ${t.marginInner}mm;
  margin-right: ${t.marginOuter}mm;
}

${marginBoxesCss}

body {
  font-family: ${bodyFontFamily};
  font-size: ${t.fontSize}pt;
  line-height: ${t.lineHeight};
  color: #000;
  background: #fff;
}

/* ── Chapter separators ── */
.ch { break-before: ${fontsHref ? 'column' : 'page'}; break-inside: auto; }
.ch:first-child { break-before: auto; }

/* ── Paragraphs ── */
.kp-p {
  margin-top: ${pGap};
  text-align: ${align};
  ${hyphens}
  break-inside: auto;
  widows: 2; orphans: 2;
  overflow-wrap: break-word;
}
.kp-p + .kp-p,
.kp-first + .kp-p {
  text-indent: ${indent};
  margin-top: ${pGap};
}
.kp-p:first-of-type { margin-top: 0; }

.kp-first {
  text-indent: 0;
  text-align: ${align};
  ${hyphens}
  break-inside: avoid;
  widows: 2; orphans: 2;
}
.kp-first::first-line {
  font-variant: small-caps;
  letter-spacing: .04em;
}
${t.dropCap ? `
.has-dropcap::first-letter {
  font-family: ${titleFontFamily};
  float: left;
  font-size: calc(${dropLines} * 1.2em);
  line-height: .85;
  padding: 2pt 4pt 0 0;
}
` : ''}

/* ── Titles ── */
.kp-halftitle {
  font-family: ${titleFontFamily};
  font-size: ${(t.titleFontSize * 1.2).toFixed(1)}pt;
  font-weight: ${titleW}; font-style: ${titleS}; text-decoration: ${titleD};
  text-align: ${tAlign};
  line-height: 1.2;
  margin: 50pt 0 0;
  break-after: avoid;
}
.kp-title {
  font-family: ${titleFontFamily};
  font-size: ${(t.titleFontSize * 1.8).toFixed(1)}pt;
  font-weight: ${titleW}; font-style: ${titleS}; text-decoration: ${titleD};
  text-align: ${tAlign};
  line-height: 1.1;
  margin: 36pt 0 6pt;
  break-after: avoid;
}
.kp-sub {
  text-align: ${tAlign};
  font-style: italic;
  font-size: ${(t.fontSize * 0.9).toFixed(1)}pt;
  margin-bottom: 28pt;
  color: #3a3530;
  break-inside: avoid;
}
.kp-author {
  text-align: center;
  font-size: ${(t.fontSize * 0.85).toFixed(1)}pt;
  letter-spacing: .12em;
  text-transform: uppercase;
  margin-bottom: 6pt;
  break-inside: avoid;
}
.kp-pub {
  text-align: center;
  font-size: ${(t.fontSize * 0.7).toFixed(1)}pt;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: #5a554d;
  margin-top: 56pt;
  break-inside: avoid;
}
.kp-ded {
  text-align: center;
  font-style: italic;
  line-height: 1.8;
  margin: 48pt 16pt;
  break-inside: avoid;
}
.kp-chnum {
  font-family: ${titleFontFamily};
  font-size: ${(t.titleFontSize * 0.7).toFixed(1)}pt;
  font-weight: ${titleW}; font-style: ${titleS};
  letter-spacing: .28em;
  text-transform: uppercase;
  text-align: ${tAlign};
  color: #5a554d;
  margin: 6pt 0 4pt;
  break-after: avoid;
}
.kp-chtitle {
  font-family: ${titleFontFamily};
  font-size: ${t.titleFontSize}pt;
  font-weight: ${titleW}; font-style: ${titleS}; text-decoration: ${titleD};
  text-align: ${tAlign};
  line-height: 1.2;
  margin: 0 0 22pt;
  break-after: avoid;
}
.kp-chtitle::after {
  content: "";
  display: block;
  width: 24pt;
  height: 0.5px;
  background: #1f1c18;
  margin: 8pt auto 0;
  opacity: .5;
}
.kp-h1 {
  font-family: ${titleFontFamily};
  font-size: ${(t.titleFontSize * 0.85).toFixed(1)}pt;
  font-weight: ${titleW}; font-style: ${titleS};
  text-align: ${tAlign};
  margin: 0 0 14pt;
  break-after: avoid;
}
.kp-h2 {
  font-family: ${titleFontFamily};
  font-size: ${(t.titleFontSize * 0.72).toFixed(1)}pt;
  font-weight: ${titleW}; font-style: ${titleS};
  text-align: ${tAlign};
  margin: 0 0 10pt;
  break-after: avoid;
}
.kp-h3 {
  font-family: ${titleFontFamily};
  font-size: ${(t.titleFontSize * 0.62).toFixed(1)}pt;
  font-weight: ${titleW}; font-style: ${titleS};
  text-align: ${tAlign};
  margin: 0 0 8pt;
  break-after: avoid;
}

/* ── Other blocks ── */
.kp-break {
  text-align: center;
  margin: 1em 0;
  letter-spacing: .6em;
  font-size: ${(t.fontSize * 0.8).toFixed(1)}pt;
  color: #5a554d;
  break-inside: avoid;
}
.kp-quote {
  margin: .5em 0;
  padding: .3em 1em;
  border-left: 2px solid #ccc;
  color: #5a554d;
  font-style: italic;
}
.kp-epigraph {
  text-align: center;
  margin: 1.2em 0;
  break-inside: avoid;
}
.kp-epigraph__q {
  font-style: italic;
  font-size: 0.9em;
  margin: 0;
}
.kp-epigraph__att {
  display: block;
  margin-top: 0.4em;
  font-size: 0.85em;
  color: #5a554d;
}
.kp-verse {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85em;
  white-space: pre-line;
  line-height: 1.6;
  margin: 1em 0;
  break-inside: avoid;
}
.kp-code {
  background: #f5f3f1;
  padding: 1em;
  border-radius: 3px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.8em;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  break-inside: avoid;
}
.kp-page-break {
  display: block;
  height: 0;
  break-after: ${fontsHref ? 'column' : 'page'};
  ${!fontsHref ? 'page-break-after: always;' : ''}
}
.kp-list {
  margin: 0.5em 0;
  padding-left: 1.5em;
}
.kp-list li {
  margin: 0.2em 0;
}
.kp-table-wrap {
  overflow-x: auto;
  margin: 0.8em 0;
}
.kp-table-wrap table {
  border-collapse: collapse;
  width: 100%;
}
.kp-table-wrap td {
  border: 1px solid #999;
  padding: 5px 7px;
  text-align: left;
  vertical-align: top;
  font-size: 0.9em;
}
.kp-fnpanel {
  margin-top: 30px;
  font-size: 11pt;
  color: #555;
}
.kp-fnpanel-rule {
  border: 0;
  border-top: 1px solid #ccc;
  margin-bottom: 12px;
}
.kp-fnpanel-item {
  margin-bottom: 6px;
  line-height: 1.4;
  display: flex;
  gap: 4px;
}
.kp-fnpanel-num {
  font-weight: 600;
  min-width: 18px;
  flex-shrink: 0;
}
.kp-fnpanel-text {
  flex: 1;
}
`;

    const chaptersHtml = chapters.map((ch: any, idx: number) => {
      const cls = ['ch',
        idx > 0 && ch.forceOddPage ? 'ch--recto' : '',
      ].filter(Boolean).join(' ');

      const body = ch.body.map((b: any) => {
        const raw: string = b.html ?? this.escapeHtml(b.text ?? '');
        const hyph = (s: string) => this.hyphenService.hyphenateHtml(s);
        switch (b.type) {
          case 'halftitle':     return `<h1 class="kp-halftitle">${raw}</h1>`;
          case 'title':         return `<h1 class="kp-title">${raw}</h1>`;
          case 'subtitle':      return `<div class="kp-sub">${raw}</div>`;
          case 'author':        return `<div class="kp-author">${raw}</div>`;
          case 'publisher':     return `<div class="kp-pub">${raw}</div>`;
          case 'dedication': {
            const lines = (b.text ?? '').split('\n')
              .map((l: string) => `<div>${this.escapeHtml(l) || '&nbsp;'}</div>`)
              .join('');
            return `<div class="kp-ded">${lines}</div>`;
          }
          case 'chapter-num':   return `<div class="kp-chnum">${raw}</div>`;
          case 'chapter-title': return `<h2 class="kp-chtitle">${raw}</h2>`;
          case 'h1':            return `<h2 class="kp-h1">${raw}</h2>`;
          case 'h2':            return `<h3 class="kp-h2">${raw}</h3>`;
          case 'h3':            return `<h4 class="kp-h3">${raw}</h4>`;
          case 'first-p': {
            const dc = t.dropCap ? ' has-dropcap' : '';
            return `<p class="kp-first${dc}">${hyph(raw)}</p>`;
          }
          case 'p':             return `<p class="kp-p">${hyph(raw)}</p>`;
          case 'blockquote':    return `<blockquote class="kp-quote">${hyph(raw)}</blockquote>`;
          case 'epigraph': {
            const att = b.attribution ? this.escapeHtml(b.attribution) : '';
            return `<div class="kp-epigraph"><blockquote class="kp-epigraph__q">${hyph(raw)}</blockquote>${att ? `<cite class="kp-epigraph__att">— ${att}</cite>` : ''}</div>`;
          }
          case 'verse':         return `<pre class="kp-verse"><code>${raw}</code></pre>`;
          case 'code':          return `<pre class="kp-code"><code>${raw}</code></pre>`;
          case 'scene-break':   return `<div class="kp-break">${brk}</div>`;
          case 'page-break':    return `<div class="kp-page-break"></div>`;
          case 'image': {
            const imgSrc = b.src ? (assets[b.src] ?? '') : '';
            const imgStyle = this.imageStyle(b);
            const cap = b.caption ? `<figcaption style="text-align:center;font-size:0.85em;margin-top:0.5em;color:#555">${this.escapeHtml(b.caption)}</figcaption>` : '';
            return imgSrc ? `<figure class="kp-image"><img src="${imgSrc}" style="${imgStyle}" alt="">${cap}</figure>` : '';
          }
          case 'list-unordered': return `<ul class="kp-list">${raw}</ul>`;
          case 'list-ordered':   return `<ol class="kp-list">${raw}</ol>`;
          case 'table':          return `<div class="kp-table-wrap">${this.tableHtml(raw)}</div>`;
          default:              return '';
        }
      }).join('\n');

      let fnHtml = '';
      const fnsSorted = sortFootnotesByPosition(ch.footnotes, ch.body);
      if (fnsSorted.length) {
        fnHtml = `<div class="kp-fnpanel"><hr class="kp-fnpanel-rule">`;
        fnsSorted.forEach((fn: any, fi: number) => {
          const fnText = this.escapeHtml(fn.content || '');
          fnHtml += `<div class="kp-fnpanel-item"><span class="kp-fnpanel-num">${fi + 1}.</span> <span class="kp-fnpanel-text">${fnText}</span></div>`;
        });
        fnHtml += `</div>`;
      }
      return `<div class="${cls}" data-id="${ch.id}">\n${body}\n${fnHtml}</div>`;
    }).join('\n\n');

    let fontTags = '';
    if (fontsHref) {
      const base = new URL('.', fontsHref).href;
      fontTags = `  <base href="${base}">\n  <link rel="stylesheet" href="fonts.css">\n`;
    }
    const bodyContent = fontsHref
      ? `<div class="pv-clip"><div class="pv-slider"><div class="pv-flow">\n${chaptersHtml}\n</div></div></div>`
      : chaptersHtml;
    return `<!DOCTYPE html>
<html lang="${this.escapeHtml(book.lang ?? 'es')}">
<head>
  <meta charset="UTF-8">
  <title>${this.escapeHtml(book.title)}</title>
${fontTags}  <style>${css}${screenCss}</style>
  <script id="libria-cfg" type="application/json">{"mi":${t.marginInner},"mo":${t.marginOuter}}</script>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  private async loadEpubFonts(
    zip: JSZip,
    bookFontKey: string,
    titleFontKey: string,
  ): Promise<{ fontFaceCss: string; fontManifest: string }> {
    const keys = [...new Set([bookFontKey, titleFontKey])].filter(k => EPUB_FONT_MAP[k]);
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

    return { fontFaceCss, fontManifest };
  }

  private escapeHtml(str: string): string {
    return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  private xhtmlSafe(str: string): string {
    return str.replace(/<br\s*\/?>/gi, '<br/>').replace(/&nbsp;/g, '&#160;');
  }

  async exportDocx() {
    this.store.setExporting(true, this.ts.instant('sidebar.exportingDocx'));
    if (!this._docx) this._docx = await import('docx');
    try {
      const book = this.store.book();
      const chapters = this.store.chapters();
      const t = this.store.tweaks();
      const prefs = this.store.exportPrefs();
      const assets = this.assetService.getAll();
      if (!book) return;

      const children: (Paragraph | TableOfContents | Table)[] = [];

      if (prefs.includeCover && assets['cover']) {
        const coverBlob = this.dataUrlToBlob(assets['cover']);
        const coverBuf = await coverBlob.arrayBuffer();
        const ext = this.imageExt(assets['cover']);
        children.push(new this._docx.Paragraph({
          alignment: 'center',
          spacing: { before: 3000, after: 100 },
          children: [new this._docx.ImageRun({ type: ext as any, data: coverBuf, transformation: { width: 400, height: 600 } })],
        }));
      }

      if (prefs.includeTOC) {
        children.push(new this._docx.TableOfContents('Table of Contents', { hyperlink: true }));
      }

      const bodyFont = t.customBookFont || this.fontName(t.bookFont);
      const titleFont = t.customTitleFont || this.fontName(t.titleFont);
      const tAlign = this.align(t.titleAlignment);
      const bodyAlign = (t.justifyText ? 'both' : 'left') as any;
      const fs = Math.round(t.fontSize * 2);
      const ts = Math.round(t.titleFontSize * 2);
      const lsp = Math.round(t.lineHeight * 240);
      const pg = Math.round(t.paragraphSpacing * 20);
      const ind = t.indentFirstLine ? Math.round(t.indentSize * 567) : 0;
      const glyph = this.sceneGlyphText(t.sceneBreakType);

      const allFootnoteDefs: { id: number; text: string }[] = [];

      for (const ch of chapters) {
        if (ch.forceOddPage && children.length > 0) {
          children.push(new this._docx.Paragraph({ children: [], pageBreakBefore: true }));
        }
        
        let prevIsBody = false;

        const chapterFns = sortFootnotesByPosition(ch.footnotes, ch.body);
        const fnIdToNum: Record<string, number> = {};
        const fnContents: Record<string, string> = {};
        if (chapterFns.length) {
          chapterFns.forEach((fn: any, fi: number) => {
            fnIdToNum[fn.id] = fi + 1;
            fnContents[fn.id] = fn.content || '';
            allFootnoteDefs.push({ id: fi + 1, text: fn.content || '' });
          });
        }

        for (const b of ch.body) {
          switch (b.type) {
            case 'halftitle':
              children.push(this.p(b, { font: titleFont, size: Math.round(ts * 1.2), bold: t.titleBold, italics: t.titleItalic, underline: t.titleUnderline }, tAlign, 1200));
              prevIsBody = false;
              break;
            case 'title':
              children.push(this.p(b, { font: titleFont, size: Math.round(ts * 1.8), bold: t.titleBold, italics: t.titleItalic, underline: t.titleUnderline }, tAlign, 0, 200));
              prevIsBody = false;
              break;
            case 'subtitle':
              children.push(this.p(b, { font: bodyFont, size: Math.round(fs * 0.9), italics: true }, tAlign, 0, 600));
              prevIsBody = false;
              break;
            case 'author':
              children.push(this.p(b, { font: bodyFont, size: Math.round(fs * 0.85) }, 'center', 0, 200));
              prevIsBody = false;
              break;
            case 'publisher':
              children.push(this.p(b, { font: bodyFont, size: Math.round(fs * 0.7) }, 'center', 1200, 0));
              prevIsBody = false;
              break;
            case 'dedication': {
              const lines = (b.text ?? '').split('\n');
              for (const line of lines) {
                children.push(new this._docx.Paragraph({
                  alignment: 'center',
                  spacing: { after: 100 },
                  children: [new this._docx.TextRun({ text: line || ' ', font: bodyFont, size: fs, italics: true })],
                }));
              }
              prevIsBody = false;
              break;
            }
            case 'chapter-num':
              children.push(this.p(b, { font: titleFont, size: Math.round(ts * 0.7), bold: t.titleBold, italics: t.titleItalic }, tAlign, 0, 80));
              prevIsBody = false;
              break;
            case 'chapter-title':
              children.push(this.p(b, { font: titleFont, size: ts, bold: t.titleBold, italics: t.titleItalic, underline: t.titleUnderline }, tAlign, 0, 400, fnIdToNum));
              prevIsBody = false;
              break;
            case 'h1':
              children.push(this.p(b, { font: titleFont, size: Math.round(ts * 0.85), bold: t.titleBold, italics: t.titleItalic }, tAlign, 400, 200, fnIdToNum));
              prevIsBody = false;
              break;
            case 'h2':
              children.push(this.p(b, { font: titleFont, size: Math.round(ts * 0.72), bold: t.titleBold, italics: t.titleItalic }, tAlign, 300, 150, fnIdToNum));
              prevIsBody = false;
              break;
            case 'h3':
              children.push(this.p(b, { font: titleFont, size: Math.round(ts * 0.62), bold: t.titleBold, italics: t.titleItalic }, tAlign, 200, 100, fnIdToNum));
              prevIsBody = false;
              break;
            case 'first-p':
              children.push(new this._docx.Paragraph({
                alignment: bodyAlign,
                spacing: { line: lsp, after: pg },
                indent: { firstLine: 0 },
                children: fnIdToNum ? this.blockToChildren(b, { font: bodyFont, size: fs, smallCaps: true }, fnIdToNum) : this.htmlToTextRuns(b, { font: bodyFont, size: fs, smallCaps: true }),
              }));
              prevIsBody = true;
              break;
            case 'p':
              children.push(new this._docx.Paragraph({
                alignment: bodyAlign,
                spacing: { line: lsp, after: pg },
                indent: { firstLine: prevIsBody ? ind : 0 },
                children: fnIdToNum ? this.blockToChildren(b, { font: bodyFont, size: fs }, fnIdToNum) : this.htmlToTextRuns(b, { font: bodyFont, size: fs }),
              }));
              prevIsBody = true;
              break;
            case 'blockquote':
              children.push(new this._docx.Paragraph({
                alignment: 'left',
                indent: { left: 720 },
                spacing: { line: lsp, before: 200, after: 200 },
                children: fnIdToNum ? this.blockToChildren(b, { font: bodyFont, size: fs, italics: true }, fnIdToNum) : this.htmlToTextRuns(b, { font: bodyFont, size: fs, italics: true }),
              }));
              prevIsBody = false;
              break;
            case 'epigraph':
              children.push(new this._docx.Paragraph({
                alignment: 'center',
                spacing: { line: lsp, before: 300, after: 60 },
                children: fnIdToNum ? this.blockToChildren(b, { font: bodyFont, size: fs, italics: true }, fnIdToNum) : this.htmlToTextRuns(b, { font: bodyFont, size: fs, italics: true }),
              }));
              if (b.attribution) {
                children.push(new this._docx.Paragraph({
                  alignment: 'center',
                  spacing: { before: 0, after: 300 },
                  indent: { left: 1440 },
                  children: [new this._docx.TextRun({ text: `— ${b.attribution}`, font: bodyFont, size: Math.round(fs * 0.85), color: '555555' })],
                }));
              }
              prevIsBody = false;
              break;
            case 'verse':
              children.push(new this._docx.Paragraph({
                alignment: 'left',
                spacing: { line: lsp, before: 200, after: 200 },
                children: fnIdToNum ? this.blockToChildren(b, { font: 'Courier New', size: fs }, fnIdToNum) : this.htmlToTextRuns(b, { font: 'Courier New', size: fs }),
              }));
              prevIsBody = false;
              break;
            case 'code':
              children.push(new this._docx.Paragraph({
                alignment: 'left',
                spacing: { line: lsp, before: 200, after: 200 },
                indent: { left: 360, right: 360 },
                shading: { type: 'clear', fill: 'F5F3F1' },
                children: fnIdToNum ? this.blockToChildren(b, { font: 'Courier New', size: Math.round(fs * 0.85) }, fnIdToNum) : this.htmlToTextRuns(b, { font: 'Courier New', size: Math.round(fs * 0.85) }),
              }));
              prevIsBody = false;
              break;
            case 'scene-break':
              children.push(new this._docx.Paragraph({
                alignment: 'center',
                spacing: { before: 400, after: 400 },
                children: [new this._docx.TextRun({ text: glyph, font: bodyFont, size: fs, color: '888888' })],
              }));
              prevIsBody = false;
              break;
            case 'page-break':
              children.push(new this._docx.Paragraph({ children: [], pageBreakBefore: true }));
              prevIsBody = false;
              break;
            case 'image': {
              const imgKey = b.src;
              if (imgKey && assets[imgKey]) {
                const imgBlob = this.dataUrlToBlob(assets[imgKey]);
                const imgBuf = await imgBlob.arrayBuffer();
                const ext = this.imageExt(assets[imgKey]);
                const dims = b.width && b.height
                  ? { width: b.width, height: b.height }
                  : { width: 460, height: 600 };
                const transformation: IMediaTransformation = {
                  width: dims.width,
                  height: dims.height,
                  ...(b.rotation ? { rotation: b.rotation } : {}),
                  ...(b.flipH || b.flipV ? { flip: { horizontal: !!b.flipH, vertical: !!b.flipV } } : {}),
                };
                children.push(new this._docx.Paragraph({
                  alignment: 'center',
                  spacing: { before: 200, after: b.caption ? 0 : 200 },
                  children: [new this._docx.ImageRun({ type: ext as any, data: imgBuf, transformation })],
                }));
                if (b.caption) {
                  children.push(new this._docx.Paragraph({
                    alignment: 'center',
                    spacing: { before: 60, after: 200 },
                    children: [new this._docx.TextRun({ text: b.caption, size: 20, color: '555555' })],
                  }));
                }
              }
              prevIsBody = false;
              break;
            }
            case 'list-unordered':
            case 'list-ordered': {
              const items = (b.html || b.text || '').split('</li>').filter(s => s.trim());
              for (const item of items) {
                const itemText = item.replace(/<[^>]+>/g, '').trim();
                if (!itemText) continue;
                children.push(new this._docx.Paragraph({
                  alignment: 'left',
                  spacing: { line: lsp, after: 60 },
                  indent: { left: 720, hanging: 360 },
                  bullet: b.type === 'list-unordered' ? { level: 0 } : undefined,
                  children: [new this._docx.TextRun({ text: itemText, font: bodyFont, size: fs })],
                }));
              }
              prevIsBody = false;
              break;
            }
            case 'table': {
              const rows = (b.html || '').match(/<tr>.*?<\/tr>/gi) || [];
              const tableRows: TableRow[] = [];
              for (const rowHtml of rows) {
                const cells = rowHtml.match(/<t[dh][^>]*>.*?<\/t[dh]>/gi) || [];
                const rowChildren: TableCell[] = [];
                for (const cellHtml of cells) {
                  const cellText = cellHtml.replace(/<[^>]+>/g, '').trim();
                  rowChildren.push(new this._docx.TableCell({
                    children: [new this._docx.Paragraph({
                      alignment: 'left',
                      children: [new this._docx.TextRun({ text: cellText || ' ', font: bodyFont, size: fs })],
                    })],
                  }));
                }
                if (rowChildren.length) {
                  tableRows.push(new this._docx.TableRow({ children: rowChildren }));
                }
              }
              if (tableRows.length) {
                children.push(new this._docx.Table({
                  rows: tableRows,
                  width: { size: 100, type: this._docx.WidthType.PERCENTAGE },
                }));
              }
              prevIsBody = false;
              break;
            }
            default:
              prevIsBody = false;
              break;
          }
        }
      }

      const doc = new this._docx.Document({
        title: book.title,
        description: book.subtitle || '',
        creator: book.author || '',
        styles: {
          default: {
            document: {
              run: { font: bodyFont, size: fs },
            },
          },
        },
        sections: [{ children }],
      });

      await this.addFootnotesToDoc(doc, allFootnoteDefs);
      const blob = await this._docx.Packer.toBlob(doc);
      this.downloadFile(blob, `${book.title}.docx`);
    } finally {
      this.store.setExporting(false);
    }
  }

  private async addFootnotesToDoc(doc: any, footnoteDefs: { id: number; text: string }[]) {
    if (!footnoteDefs.length) return;
    try {
      const fnView = doc.FootNotes?.View;
      if (!fnView?.createFootNote) return;
      for (const fn of footnoteDefs) {
        fnView.createFootNote(fn.id, [
          new this._docx.Paragraph({
            children: [new this._docx.TextRun({ text: fn.text, size: 20 })],
          }),
        ]);
      }
    } catch {
      // footnote API not available in this docx version — silently skip
    }
  }

  private p(b: { text?: string; html?: string }, opts: {
    font: string; size: number; bold?: boolean; italics?: boolean; underline?: boolean;
  }, align: string, before = 0, after = 0, fnIdToNum?: Record<string, number>): Paragraph {
    return new this._docx.Paragraph({
      alignment: align as any,
      spacing: { before, after },
      children: fnIdToNum ? this.blockToChildren(b, opts, fnIdToNum) : this.htmlToTextRuns(b, opts),
    });
  }

  private sceneGlyphText(type: string): string {
    const m: Record<string, string> = {
      asterisks: '✦ ✦ ✦',
      asterisks3: '* * *',
      dots: '· · ·',
      flourish: '— o —',
      none: '',
    };
    return m[type] ?? '* * *';
  }

  private imageStyle(b: Block): string {
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

  private tableHtml(html: string): string {
    if (!html) return '';
    return html.startsWith('<table') ? html : '<table>' + html + '</table>';
  }

  private fontName(key: string): string {
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

  private imageExt(dataUrl: string) {
    const m = dataUrl.match(/^data:image\/(\w+);/);
    const ext = m?.[1] ?? 'png';
    if (ext === 'jpeg') return 'jpg';
    if (ext === 'svg+xml') return 'png';
    return ext;
  }

  private align(val: string) {
    if (val === 'left') return 'left';
    if (val === 'right') return 'right';
    if (val === 'justify') return 'both';
    return 'center';
  }

  private htmlToTextRuns(b: { text?: string; html?: string }, opts: {
    font: string; size: number; bold?: boolean; italics?: boolean; underline?: boolean; smallCaps?: boolean;
  }): TextRun[] {
    const raw = b.html || this.escapeHtml(b.text ?? '');
    if (!raw) return [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];

    const runs: TextRun[] = [];
    const re = /<(\/?)(\w+)(?:\s[^>]*)?\/?>|([^<]+)/g;
    let m: RegExpExecArray | null;

    let bold = !!opts.bold;
    let italic = !!opts.italics;
    let uline = !!opts.underline;

    while ((m = re.exec(raw)) !== null) {
      if (m[3] !== undefined) {
        const text = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, '\u00A0');
        runs.push(new this._docx.TextRun({
          text,
          font: opts.font,
          size: opts.size,
          bold,
          italics: italic,
          underline: uline ? { type: this._docx.UnderlineType.SINGLE } : undefined,
          smallCaps: opts.smallCaps && runs.length === 0,
        }));
      } else if (m[1] === '' && m[2] !== 'br') {
        const tag = m[2];
        if (tag === 'b' || tag === 'strong') bold = true;
        if (tag === 'i' || tag === 'em') italic = true;
        if (tag === 'u' || tag === 'ins') uline = true;
      } else if (m[1] === '/') {
        const tag = m[2];
        if (tag === 'b' || tag === 'strong') bold = !!opts.bold;
        if (tag === 'i' || tag === 'em') italic = !!opts.italics;
        if (tag === 'u' || tag === 'ins') uline = !!opts.underline;
      }
    }

    return runs.length ? runs : [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];
  }

  private blockToChildren(b: { text?: string; html?: string }, opts: {
    font: string; size: number; bold?: boolean; italics?: boolean; underline?: boolean; smallCaps?: boolean;
  }, fnIdToNum: Record<string, number>): (TextRun | FootnoteReferenceRun)[] {
    const raw = b.html || this.escapeHtml(b.text ?? '');
    if (!raw) return [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];

    const children: (TextRun | FootnoteReferenceRun)[] = [];
    const re = /<(\/?)(\w+)(?:\s[^>]*)?\/?>|([^<]+)/g;
    let m: RegExpExecArray | null;

    let bold = !!opts.bold;
    let italic = !!opts.italics;
    let uline = !!opts.underline;

    while ((m = re.exec(raw)) !== null) {
      if (m[3] !== undefined) {
        const text = m[3].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, '\u00A0');
        children.push(new this._docx.TextRun({
          text,
          font: opts.font,
          size: opts.size,
          bold,
          italics: italic,
          underline: uline ? { type: this._docx.UnderlineType.SINGLE } : undefined,
          smallCaps: opts.smallCaps && children.length === 0,
        }));
      } else if (m[1] === '' && m[2] !== 'br') {
        const tag = m[2];
        if (tag === 'b' || tag === 'strong') bold = true;
        if (tag === 'i' || tag === 'em') italic = true;
        if (tag === 'u' || tag === 'ins') uline = true;
        if (tag === 'sup') {
          const mid = m[0];
          const fnMatch = mid.match(/data-fn="([^"]+)"/);
          if (fnMatch && fnIdToNum[fnMatch[1]]) {
            children.push(new this._docx.FootnoteReferenceRun(fnIdToNum[fnMatch[1]]));
          }
        }
      } else if (m[1] === '/') {
        const tag = m[2];
        if (tag === 'b' || tag === 'strong') bold = !!opts.bold;
        if (tag === 'i' || tag === 'em') italic = !!opts.italics;
        if (tag === 'u' || tag === 'ins') uline = !!opts.underline;
      }
    }

    return children.length ? children : [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];
  }

  private async downloadFile(blob: Blob, filename: string) {
    if (!this._saveAs) this._saveAs = (await import('file-saver')).saveAs;
    this._saveAs(blob, filename);
  }

  private dataUrlToBlob(dataUrl: string): Blob {
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
}
