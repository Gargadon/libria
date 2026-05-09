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
   */
  async exportEpub() {
    const zip = new JSZip();
    const book = this.store.book();
    const chapters = this.store.chapters();
    const assets = this.store.assets();
    const prefs = this.store.exportPrefs();
    const tweaks = this.store.tweaks();

    if (!book) return;

    // 1. Mimetype
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

    // 2. META-INF/container.xml
    zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    // 3. Assets
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

    // 4. content.opf
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

    // 5. styles.css
    const dropCapStyles = tweaks.dropCap ? `.first-p::first-letter { float: left; font-size: 3.5em; line-height: 0.8; padding-right: 8px; font-weight: bold; }` : '';
    zip.file('OEBPS/styles.css', `body { font-family: serif; padding: 5%; line-height: 1.5; }
h1, h2 { text-align: center; }
p { text-indent: 1.5em; margin: 0; text-align: justify; }
.first-p { text-indent: 0; }
${dropCapStyles}`);

    // 6. Chapters & Navigation
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

  /**
   * Generates a DOCX file.
   */
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

  /**
   * Digital PDF
   */
  async exportPdfDigital() {
    document.body.classList.add('print-digital');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('print-digital');
    }, 500);
  }

  /**
   * Physical PDF
   */
  async exportPdfPhysical() {
    document.body.classList.add('print-physical');
    setTimeout(() => {
      window.print();
      document.body.classList.remove('print-physical');
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
