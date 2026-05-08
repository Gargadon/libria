import { Injectable, inject } from '@angular/core';
import { BookStore } from '../store/book.store';
import JSZip from 'jszip';
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  AlignmentType,
  PageBreak
} from 'docx';
import { saveAs } from 'file-saver';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly store = inject(BookStore);

  /**
   * Generates an EPUB 3.0 file.
   * EPUB is a ZIP container with a specific structure: mimetype, META-INF/container.xml, and OEBPS/ content.
   */
  async exportEpub() {
    const zip = new JSZip();
    const book = this.store.book();
    const chapters = this.store.chapters();
    const assets = this.store.assets();
    const prefs = this.store.exportPrefs();
    const tweaks = this.store.tweaks();

    if (!book) return;

    // 1. Mimetype (must be first and uncompressed)
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 2. META-INF/container.xml
    zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    // 3. Assets (Cover Image)
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

    // 4. OEBPS/content.opf (The manifest and spine)
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

    // 5. OEBPS/styles.css (EPUB basic styling)
    const dropCapStyles = tweaks.dropCap ? `.first-p::first-letter { float: left; font-size: ${Math.max(2, tweaks.dropCapLines) * 1.2}em; line-height: 0.85; padding-right: 4px; font-weight: normal; color: #a8623d; }` : '';
    const hyphenStyles = tweaks.hyphenation ? `p, .first-p { -webkit-hyphens: auto; -moz-hyphens: auto; hyphens: auto; }` : '';

    zip.file('OEBPS/styles.css', `body { font-family: serif; padding: 5%; line-height: 1.5; }
h1, h2 { text-align: center; margin-top: 2em; margin-bottom: 1em; }
p { text-indent: 1.5em; margin: 0; text-align: justify; }
.first-p, .subtitle, .author, .publisher, .dedication { text-indent: 0; text-align: center; }
${dropCapStyles}
${hyphenStyles}
.author { font-style: italic; margin-top: 1em; }
.subtitle { margin-bottom: 2em; }
.dedication { margin-top: 5em; font-style: italic; }
.scene-break { text-align: center; margin: 2em 0; }
.chapter-num { font-size: 1.2em; text-transform: uppercase; letter-spacing: 0.1em; }
.chapter-title { font-size: 2em; }
.noteref { font-size: 0.7em; vertical-align: super; text-decoration: none; padding: 0 2px; }
.notes { font-size: 0.9em; margin-top: 3em; border-top: 1px solid #ccc; padding-top: 1em; }
.reply { margin-left: 1.5em; font-size: 0.85em; color: #555; }`);

    // 6. OEBPS/nav.xhtml (Navigation)
    let navLinks = '';
    if (prefs.includeCover && assets['cover']) {
      navLinks += `      <li><a href="cover.xhtml">Portada</a></li>\n`;
    }
    chapters.forEach((c) => {
      navLinks += `      <li><a href="chapters/${c.id}.xhtml">${c.title}</a></li>\n`;
    });

    zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Tabla de Contenidos</title></head>
<body>
  <nav epub:type="toc">
    <h1>Contenidos</h1>
    <ol>
${navLinks}
    </ol>
  </nav>
</body>
</html>`);

    // 7. OEBPS/toc.ncx (Legacy support for older e-readers)
    let ncxNav = '';
    let navCounter = 1;
    if (prefs.includeCover && assets['cover']) {
      ncxNav += `    <navPoint id="navPoint-${navCounter}" playOrder="${navCounter}">
      <navLabel><text>Portada</text></navLabel>
      <content src="cover.xhtml"/>
    </navPoint>\n`;
      navCounter++;
    }
    chapters.forEach((c, i) => {
      ncxNav += `    <navPoint id="navPoint-${navCounter}" playOrder="${navCounter}">
      <navLabel><text>${c.title}</text></navLabel>
      <content src="chapters/${c.id}.xhtml"/>
    </navPoint>\n`;
      navCounter++;
    });

    zip.file('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${book.isbn || 'libria-' + Date.now()}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${book.title}</text></docTitle>
  <navMap>
${ncxNav}
  </navMap>
</ncx>`);

    // 8. Chapters
    const allNotes = this.store.notes();
    chapters.forEach((c) => {
      let content = '';
      const chapterNotes = prefs.includeNotes ? allNotes.filter(n => n.chapterId === c.id) : [];
      
      c.body.forEach((b, bIdx) => {
        let blockText = b.text || '';
        if (b.type === 'first-p' && b.drop && !blockText.startsWith(b.drop)) {
          blockText = b.drop + blockText;
        }
        const blockNotes = chapterNotes.filter(n => n.blockIndex === bIdx);
        
        if (blockNotes.length > 0) {
          blockNotes.forEach(bn => {
            blockText += `<a class="noteref" href="#note-${bn.id}" id="ref-${bn.id}">[*]</a>`;
          });
        }

        switch (b.type) {
          case 'halftitle': content += `<h1 class="halftitle">${blockText}</h1>`; break;
          case 'title': content += `<h1 class="title">${blockText}</h1>`; break;
          case 'subtitle': content += `<p class="subtitle">${blockText}</p>`; break;
          case 'author': content += `<p class="author">${blockText}</p>`; break;
          case 'publisher': content += `<p class="publisher">${blockText}</p>`; break;
          case 'dedication': content += `<p class="dedication">${blockText.replace(/\\n/g, '<br/>')}</p>`; break;
          case 'chapter-num': content += `<h1 class="chapter-num">${blockText}</h1>`; break;
          case 'chapter-title': content += `<h2 class="chapter-title">${blockText}</h2>`; break;
          case 'first-p': content += `<p class="first-p">${blockText}</p>`; break;
          case 'p': content += `<p>${blockText}</p>`; break;
          case 'scene-break': content += `<div class="scene-break">***</div>`; break;
          case 'page-break': content += `<div style="page-break-after: always;"></div>`; break;
        }
      });

      // Add notes section if any
      if (prefs.includeNotes && chapterNotes.length > 0) {
        content += `<section class="notes"><hr/><h3>Marginalia</h3>`;
        chapterNotes.forEach(n => {
          content += `<div class="note" id="note-${n.id}">
            <p><strong><a href="#ref-${n.id}">[*]</a> ${n.authorName} (${n.role}):</strong> ${n.content}</p>`;
          n.replies.forEach(r => {
            content += `<p class="reply"><em>— ${r.authorName} (${r.role}):</em> ${r.content}</p>`;
          });
          content += `</div>`;
        });
        content += `</section>`;
      }

      zip.file(`OEBPS/chapters/${c.id}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${c.title}</title>
  <link rel="stylesheet" type="text/css" href="../styles.css"/>
</head>
<body>
${content}
</body>
</html>`);
    });

    // 9. Generate and download
    const content = await zip.generateAsync({ type: 'blob' });
    this.downloadFile(content, `${book.title.replace(/\s+/g, '_')}.epub`);
  }

  /**
   * Generates a DOCX file using the 'docx' library.
   */
  async exportDocx() {
    const book = this.store.book();
    const chapters = this.store.chapters();
    const allNotes = this.store.notes();
    const assets = this.store.assets();
    const prefs = this.store.exportPrefs();
    if (!book) return;

    const sections: any[] = [];

    if (prefs.includeTOC) {
      const tocChildren: any[] = [
        new Paragraph({
          text: 'Contenidos',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 }
        })
      ];
      
      chapters.forEach(c => {
        if (c.kind !== 'front' && c.kind !== 'back') {
          tocChildren.push(new Paragraph({
            children: [
              new TextRun({ text: c.title, size: 24 })
            ],
            spacing: { before: 120, after: 120 }
          }));
        }
      });
      
      tocChildren.push(new Paragraph({ children: [new PageBreak()] }));

      sections.push({
        properties: {},
        children: tocChildren
      });
    }

    const chapterSections = chapters.map(c => {
      const children: any[] = [];
      const chapterNotes = prefs.includeNotes ? allNotes.filter(n => n.chapterId === c.id) : [];

      // Add Chapter Title
      children.push(new Paragraph({
        text: c.title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }));

      // Add Blocks
      c.body.forEach((b, bIdx) => {
        const blockNotes = chapterNotes.filter(n => n.blockIndex === bIdx);
        let text = b.text || '';
        if (b.type === 'first-p' && b.drop && !text.startsWith(b.drop)) {
          text = b.drop + text;
        }
        
        const runs: any[] = [new TextRun(text)];
        if (blockNotes.length > 0) {
          blockNotes.forEach(() => {
            runs.push(new TextRun({
              text: '[*]',
              superScript: true,
            }));
          });
        }

        if (b.type === 'p' || b.type === 'first-p') {
          children.push(new Paragraph({
            children: runs,
          }));
        } else if (b.type === 'chapter-title' || b.type === 'chapter-num') {
          children.push(new Paragraph({
            text: b.text,
            heading: b.type === 'chapter-title' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            alignment: AlignmentType.CENTER,
          }));
        } else if (b.type === 'scene-break') {
          children.push(new Paragraph({
            text: '***',
            alignment: AlignmentType.CENTER,
          }));
        } else if (b.type === 'page-break') {
          children.push(new Paragraph({
            children: [new PageBreak()],
          }));
        }
      });

      // Add Marginalia section if any
      if (prefs.includeNotes && chapterNotes.length > 0) {
        children.push(new Paragraph({
          text: '',
          spacing: { before: 400 },
        }));
        children.push(new Paragraph({
          text: 'MARGINALIA',
          heading: HeadingLevel.HEADING_2,
        }));

        chapterNotes.forEach(n => {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `[*] ${n.authorName} (${n.role}): `, bold: true }),
              new TextRun(n.content),
            ],
            spacing: { before: 200 },
          }));
          n.replies.forEach(r => {
            children.push(new Paragraph({
              children: [
                new TextRun({ text: `    — ${r.authorName} (${r.role}): `, italics: true }),
                new TextRun(r.content),
              ],
            }));
          });
        });
      }

      return {
        properties: {},
        children: children,
      };
    });

    sections.push(...chapterSections);

    const doc = new Document({
      sections: sections
    });

    const blob = await Packer.toBlob(doc);
    this.downloadFile(blob, `${book.title.replace(/\s+/g, '_')}.docx`);
  }

  /**
   * Triggers the browser's print dialog.
   * Combined with '@media print' CSS and 'full-print' mode, this creates a high-quality PDF.
   */
  async exportPdf() {
    // We assume the component is already in 'full-print' mode because setNav('export') triggers it.
    // However, we wait a bit for rendering to complete.
    setTimeout(() => {
      window.print();
    }, 500);
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
