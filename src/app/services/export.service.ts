import { Injectable, inject } from '@angular/core';
import { BookStore } from '../store/book.store';
import { HyphenService } from './hyphen.service';
import JSZip from 'jszip';
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
} from 'docx';
import { saveAs } from 'file-saver';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly store = inject(BookStore);
  private readonly hyphenService = inject(HyphenService);

  async exportEpub() {
    const zip = new JSZip();
    const book = this.store.book();
    const chapters = this.store.chapters();
    const assets = this.store.assets();
    const prefs = this.store.exportPrefs();
    const tweaks = this.store.tweaks();

    if (!book) return;

    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
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

    let manifest = '';
    let spine = '';
    chapters.forEach((c, i) => {
      manifest += `    <item id="chapter_${i}" href="chapters/${c.id}.xhtml" media-type="application/xhtml+xml"/>\n`;
      spine += `    <itemref idref="chapter_${i}"/>\n`;
    });

    const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="pub-id" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${book.isbn || 'libria-' + Date.now()}</dc:identifier>
    <dc:title>${book.title}</dc:title>
    <dc:creator>${book.author}</dc:creator>
    <dc:language>es</dc:language>
    <dc:publisher>${book.publisher || 'Libria'}</dc:publisher>
    <dc:date>${book.year}-01-01</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${coverManifest}
${manifest}
  </manifest>
  <spine toc="ncx">
${coverSpine}
${prefs.includeTOC ? '    <itemref idref="nav"/>\n' : ''}${spine}
  </spine>
</package>`;
    zip.file('OEBPS/content.opf', opf);

    const dropCapStyles = tweaks.dropCap ? `.first-p::first-letter { float: left; font-size: 3.5em; line-height: 0.8; padding-right: 8px; font-weight: bold; }` : '';
    zip.file('OEBPS/styles.css', `body { font-family: serif; padding: 5%; line-height: 1.5; }
h1, h2 { text-align: center; }
p { text-indent: 1.5em; margin: 0; text-align: justify; }
.first-p { text-indent: 0; }
${dropCapStyles}`);

    let navLinks = '';
    chapters.forEach((c, i) => {
      navLinks += `<li><a href="chapters/${c.id}.xhtml">${c.title}</a></li>`;
      let content = '';
      c.body.forEach(b => {
        if (b.type === 'p' || b.type === 'first-p') {
          content += `<p class="${b.type}">${b.text}</p>`;
        } else if (b.type === 'chapter-title') {
          content += `<h2>${b.text}</h2>`;
        }
      });
      zip.file(`OEBPS/chapters/${c.id}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" type="text/css" href="../styles.css"/></head>
<body>${content}</body></html>`);
    });

    zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><h1>Contenidos</h1><ol>${navLinks}</ol></nav></body></html>`);

    const content = await zip.generateAsync({ type: 'blob' });
    this.downloadFile(content, `${book.title}.epub`);
  }

  async exportPdf() {
    const book = this.store.book();
    if (!book) return;

    const chapters = this.store.chapters();
    const t = this.store.tweaks();
    const bodyFontFamily = this.store.bookFontFamily();
    const titleFontFamily = this.store.titleFontFamily();

    const html = this.buildPrintHtml(book, chapters, t, bodyFontFamily, titleFontFamily);
    const pageSize = this.pageSizeToInches(book.paperSize || '5x8');

    const pdfOptions: Record<string, any> = {
      pageSize,
      printBackground: true,
      // Horizontal margins come from CSS @page :left/:right.
      // Vertical margins (with header/footer space) come from printToPDF options.
      margins: {
        marginType: 'custom',
        top: t.marginTop / 25.4,
        bottom: t.marginBottom / 25.4,
        left: 0,
        right: 0,
      },
    };

    if (t.showHeader || t.showPageNumbers) {
      pdfOptions['displayHeaderFooter'] = true;
      pdfOptions['headerTemplate'] = t.showHeader
        ? `<div style="font-size:9pt;font-style:italic;width:100%;height:${t.marginTop}mm;display:flex;align-items:center;justify-content:center;font-family:serif;color:#555;padding:0 1cm;">${this.escapeHtml(t.headerText || book.title)}</div>`
        : '<div></div>';
      pdfOptions['footerTemplate'] = t.showPageNumbers
        ? `<div style="font-size:9pt;width:100%;height:${t.marginBottom}mm;display:flex;align-items:center;justify-content:center;font-family:serif;padding:0 1cm;"><span class="pageNumber"></span></div>`
        : '<div></div>';
    }

    try {
      const pdfData = await (window as any).electronAPI.printFromHTML(html, pdfOptions);
      const blob = new Blob([pdfData], { type: 'application/pdf' });
      this.downloadFile(blob, `${book.title}.pdf`);
    } catch (error) {
      console.error('PDF export failed', error);
    }
  }

  private pageSizeToInches(size: string): { width: number; height: number } {
    const map: Record<string, { width: number; height: number }> = {
      '5x8':   { width: 5,     height: 8     },
      '6x9':   { width: 6,     height: 9     },
      'Letter':{ width: 8.5,   height: 11    },
      'A5':    { width: 5.827, height: 8.268 },
      'A4':    { width: 8.268, height: 11.693},
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
  ): string {
    const pageSizeCss: Record<string, string> = {
      '5x8':   '5in 8in',
      '6x9':   '6in 9in',
      'Letter':'8.5in 11in',
      'A5':    '148mm 210mm',
      'A4':    '210mm 297mm',
    };
    const pageSize = pageSizeCss[book.paperSize || '5x8'] || '5in 8in';

    // Fonts are injected by the main process from public/fonts.css (local WOFF2).
    const sceneGlyph: Record<string, string> = {
      asterisks: '✦ ✦ ✦',
      dots: '· · ·',
      flourish: '— o —',
      none: '',
    };
    const brk = sceneGlyph[t.sceneBreakType] ?? '✦ ✦ ✦';

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
}` : '';

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
  text-indent: ${indent};
  text-align: ${align};
  ${hyphens}
  break-inside: auto;
  widows: 2; orphans: 2;
  overflow-wrap: break-word;
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
  border-left: 2pt solid #a8623d;
  color: #5a554d;
  font-style: italic;
  break-inside: avoid;
}
.kp-page-break {
  display: block;
  height: 0;
  break-after: ${fontsHref ? 'column' : 'page'};
  ${!fontsHref ? 'page-break-after: always;' : ''}
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
          case 'first-p': {
            const dc = t.dropCap ? ' has-dropcap' : '';
            return `<p class="kp-first${dc}">${hyph(raw)}</p>`;
          }
          case 'p':             return `<p class="kp-p">${hyph(raw)}</p>`;
          case 'blockquote':    return `<blockquote class="kp-quote">${hyph(raw)}</blockquote>`;
          case 'scene-break':   return `<div class="kp-break">${brk}</div>`;
          case 'page-break':    return `<div class="kp-page-break"></div>`;
          default:              return '';
        }
      }).join('\n');

      return `<div class="${cls}" data-id="${ch.id}">\n${body}\n</div>`;
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

  private escapeHtml(str: string): string {
    return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async exportDocx() {
    const book = this.store.book();
    const chapters = this.store.chapters();
    if (!book) return;

    const doc = new Document({
      sections: [{
        children: chapters.flatMap(c => [
          new Paragraph({ text: c.title, heading: HeadingLevel.HEADING_1 }),
          ...c.body.filter(b => b.text).map(b => new Paragraph({ text: b.text }))
        ])
      }]
    });

    const blob = await Packer.toBlob(doc);
    this.downloadFile(blob, `${book.title}.docx`);
  }

  private downloadFile(blob: Blob, filename: string) {
    saveAs(blob, filename);
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
