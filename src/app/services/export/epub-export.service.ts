import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';
import { sortFootnotesByPosition } from '../../models/book.models';

import { AssetService } from '../asset.service';

import { sanitizeRichHtml } from '../../utils/block-html';

import type JSZip from 'jszip';

import { ExportFileService } from './export-file.service';
import {
  resolveChapters,
  imageStyle,
  tableHtml,
  dataUrlToBlob,
  escapeHtml,
  sceneGlyphText,
  imageExt,
  xhtmlSafe,
} from './export-utils';
import { EpubFontService } from './epub-font.service';

@Injectable({ providedIn: 'root' })
export class EpubExportService {
  private readonly store = inject(BookStore);
  private readonly ts = inject(TranslateService);
  private readonly assetService = inject(AssetService);
  private readonly files = inject(ExportFileService);
  private _jszip: any;
  private readonly fonts = inject(EpubFontService);

  async exportEpub() {
    this.store.setExporting(true, this.ts.instant('sidebar.exportingEpub'));
    try {
      if (!this._jszip)
        this._jszip = ((await import('jszip')) as any).default ?? (await import('jszip'));
      const JSZip = this._jszip;
      const zip = new JSZip();
      const book = this.store.book();
      const prefs = this.store.exportPrefs();
      const allChapters = this.store.chapters();
      const chapters = resolveChapters(allChapters, prefs);
      const assets = this.assetService.getAll();
      const tweaks = this.store.tweaks();
      const bodyFontFamily = this.store.bookFontFamily();
      const titleFontFamily = this.store.titleFontFamily();

      if (!book) return;

      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

      this.store.setExporting(true, this.ts.instant('sidebar.exportingFonts'));
      const { fontFaceCss, fontManifest: epubFontManifest } = await this.fonts.loadEpubFonts(
        zip,
        tweaks.bookFont ?? '',
        tweaks.titleFont ?? '',
        tweaks.customBookFont,
        tweaks.customTitleFont,
      );
      zip.file(
        'META-INF/container.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      );

      let coverManifest = '';
      let coverSpine = '';
      if (prefs.includeCover && assets['cover']) {
        const coverData = assets['cover'];
        const mime = coverData.split(';')[0].split(':')[1];
        const ext = mime.split('/')[1];
        const coverBlob = dataUrlToBlob(coverData);
        zip.file(`OEBPS/images/cover.${ext}`, coverBlob);
        coverManifest = `    <item id="cover-image" href="images/cover.${ext}" media-type="${mime}" properties="cover-image"/>\n`;
        coverManifest += `    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n`;
        coverSpine = `    <itemref idref="cover"/>\n`;

        zip.file(
          'OEBPS/cover.xhtml',
          `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Portada</title><style>body { margin: 0; padding: 0; text-align: center; } img { max-width: 100%; height: auto; }</style></head>
<body><img src="images/cover.${ext}" alt="Portada"/></body>
</html>`,
        );
      }

      const manifestParts: string[] = [];
      const spineParts: string[] = [];
      chapters.forEach((c, i) => {
        manifestParts.push(
          `    <item id="chapter_${i}" href="chapters/${c.id}.xhtml" media-type="application/xhtml+xml"/>\n`,
        );
        spineParts.push(`    <itemref idref="chapter_${i}"/>\n`);
      });
      const manifest = manifestParts.join('');
      const spine = spineParts.join('');

      const imageKeys = new Set<string>();
      chapters.forEach((c) =>
        c.body.forEach((b) => {
          if (b.type === 'image' && b.src && assets[b.src]) imageKeys.add(b.src);
        }),
      );
      const imageManifestParts: string[] = [];
      imageKeys.forEach((key) => {
        const ext = imageExt(assets[key]);
        const blob = dataUrlToBlob(assets[key]);
        zip.file(`OEBPS/images/img-${key}.${ext}`, blob);
        imageManifestParts.push(
          `    <item id="img-${key}" href="images/img-${key}.${ext}" media-type="image/${ext === 'jpg' ? 'jpeg' : ext}"/>\n`,
        );
      });
      const imageManifest = imageManifestParts.join('');

      const esc = (s: string) => escapeHtml(s);
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
    <itemref idref="nav"/>
${spine}
  </spine>
</package>`;
      zip.file('OEBPS/content.opf', opf);

      const dropCapStyles = tweaks.dropCap
        ? `.first-p::first-letter { float: left; font-size: 3.5em; line-height: 0.8; padding-right: 8px; font-weight: bold; }`
        : '';
      zip.file(
        'OEBPS/styles.css',
        `${fontFaceCss}body { font-family: ${bodyFontFamily}, serif; padding: 5%; line-height: 1.5; }
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
.kp-toc { list-style: none; padding: 0; margin: 1em 0; }
.kp-toc-item { padding: 0.35em 0; font-size: 1em; }
.kp-toc-item a { text-decoration: none; color: inherit; }
.kp-toc-item--front { color: #555; }
.kp-toc-item--back { color: #555; }
.kp-toc-num { font-variant-numeric: tabular-nums; margin-right: 0.4em; }
${dropCapStyles}`,
      );

      const navLinkParts: string[] = [];
      chapters.forEach((c, i) => {
        navLinkParts.push(`<li><a href="chapters/${c.id}.xhtml">${escapeHtml(c.title)}</a></li>`);
        const contentParts: string[] = [];

        if (c.templateId === 'toc') {
          const tocBody = chapters
            .filter((ch) => ch.templateId !== 'toc')
            .map((ch) => {
              const num =
                ch.kind === 'chapter' && ch.number != null
                  ? `<span class="kp-toc-num">${ch.number}.</span> `
                  : '';
              return `<li class="kp-toc-item kp-toc-item--${ch.kind}"><a href="${ch.id}.xhtml">${num}${escapeHtml(ch.title)}</a></li>`;
            })
            .join('');
          contentParts.push(
            `<h1 class="kp-h1">${escapeHtml(c.title)}</h1><nav epub:type="toc"><ol class="kp-toc">${tocBody}</ol></nav>`,
          );
        } else {
          c.body.forEach((b) => {
            const raw = xhtmlSafe(b.html ? sanitizeRichHtml(b.html) : escapeHtml(b.text || ''));
            switch (b.type) {
              case 'halftitle':
                contentParts.push(`<h1 class="kp-halftitle">${raw}</h1>`);
                break;
              case 'title':
                contentParts.push(`<h1 class="kp-title">${raw}</h1>`);
                break;
              case 'subtitle':
                contentParts.push(`<div class="kp-sub">${raw}</div>`);
                break;
              case 'author':
                contentParts.push(`<div class="kp-author">${raw}</div>`);
                break;
              case 'publisher':
                contentParts.push(`<div class="kp-pub">${raw}</div>`);
                break;
              case 'dedication':
                contentParts.push(`<div class="kp-ded">${raw}</div>`);
                break;
              case 'chapter-num':
                contentParts.push(`<div class="kp-chnum">${raw}</div>`);
                break;
              case 'chapter-title':
                contentParts.push(`<h2>${raw}</h2>`);
                break;
              case 'h1':
                contentParts.push(`<h2 class="kp-h1">${raw}</h2>`);
                break;
              case 'h2':
                contentParts.push(`<h3 class="kp-h2">${raw}</h3>`);
                break;
              case 'h3':
                contentParts.push(`<h4 class="kp-h3">${raw}</h4>`);
                break;
              case 'first-p':
                contentParts.push(`<p class="first-p">${raw}</p>`);
                break;
              case 'p':
                contentParts.push(`<p>${raw}</p>`);
                break;
              case 'blockquote':
                contentParts.push(`<blockquote>${raw}</blockquote>`);
                break;
              case 'epigraph': {
                const att = escapeHtml(b.attribution || '');
                contentParts.push(
                  `<div class="kp-epigraph"><blockquote>${raw}</blockquote>${att ? `<cite>— ${att}</cite>` : ''}</div>`,
                );
                break;
              }
              case 'verse':
                contentParts.push(`<pre class="kp-verse"><code>${raw}</code></pre>`);
                break;
              case 'code':
                contentParts.push(`<pre class="kp-code"><code>${raw}</code></pre>`);
                break;
              case 'scene-break':
                contentParts.push(
                  `<p style="text-align:center;margin:1em 0;color:#888">${sceneGlyphText(tweaks.sceneBreakType) || '* * *'}</p>`,
                );
                break;
              case 'page-break':
                contentParts.push(`<div style="page-break-after:always"></div>`);
                break;
              case 'image': {
                if (b.src && assets[b.src]) {
                  const imgStyle = imageStyle(b);
                  const ext = imageExt(assets[b.src]);
                  const cap = b.caption
                    ? `<figcaption style="text-align:center;font-size:0.85em;margin-top:0.5em;color:#555">${escapeHtml(b.caption)}</figcaption>`
                    : '';
                  contentParts.push(
                    `<figure style="text-align:center;margin:1em 0"><img src="../images/img-${b.src}.${ext}" style="${imgStyle}" alt=""/>${cap}</figure>`,
                  );
                }
                break;
              }
              case 'list-unordered':
                contentParts.push(`<ul class="kp-list">${raw}</ul>`);
                break;
              case 'list-ordered':
                contentParts.push(`<ol class="kp-list">${raw}</ol>`);
                break;
              case 'table':
                contentParts.push(`<div class="kp-table-wrap">${tableHtml(raw)}</div>`);
                break;
              default:
                contentParts.push(`<p>[${b.type}]</p>`);
                break;
            }
          });
        } // end if templateId !== 'toc'
        const sortedFns = sortFootnotesByPosition(c.footnotes, c.body);
        if (sortedFns.length) {
          contentParts.push(`<div class="kp-fnpanel"><hr class="kp-fnpanel-rule">`);
          sortedFns.forEach((fn: any, fi: number) => {
            const fnText = escapeHtml(fn.content || '');
            contentParts.push(
              `<div class="kp-fnpanel-item"><span class="kp-fnpanel-num">${fi + 1}.</span> <span class="kp-fnpanel-text">${fnText}</span></div>`,
            );
          });
          contentParts.push(`</div>`);
        }
        const content = contentParts.join('');
        zip.file(
          `OEBPS/chapters/${c.id}.xhtml`,
          `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>${escapeHtml(c.title)}</title><link rel="stylesheet" type="text/css" href="../styles.css"/></head>
<body>${content}</body></html>`,
        );
      });
      const navLinks = navLinkParts.join('');

      const tocLabelMap: Record<string, string> = {
        es: 'Contenidos',
        en: 'Contents',
        fr: 'Table des matières',
        it: 'Indice',
        pt: 'Sumário',
      };
      const tocLabel = tocLabelMap[(book.lang ?? 'es').slice(0, 2)] ?? 'Contents';
      zip.file(
        'OEBPS/nav.xhtml',
        `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${tocLabel}</title></head>
<body><nav epub:type="toc"><h1>${tocLabel}</h1><ol>${navLinks}</ol></nav></body></html>`,
      );

      this.store.setExporting(true, this.ts.instant('sidebar.exportingEpub'));
      const content = await zip.generateAsync({ type: 'blob' });
      await this.files.downloadFile(content, `${book.title}.epub`);
    } finally {
      this.store.setExporting(false);
    }
  }
}
