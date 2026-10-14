import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';
import { sortFootnotesByPosition } from '../../models/book.models';

import { AssetService } from '../asset.service';

import { sanitizeRichHtml } from '../../utils/block-html';

import type JSZip from 'jszip';

import { ExportFileService } from './export-file.service';
import { resolveChapters, escapeHtml, sceneGlyphText } from './export-utils';

@Injectable({ providedIn: 'root' })
export class OdtExportService {
  private readonly store = inject(BookStore);
  private readonly ts = inject(TranslateService);
  private readonly assetService = inject(AssetService);
  private readonly files = inject(ExportFileService);
  private _jszip: any;

  async exportOdt() {
    this.store.setExporting(true, this.ts.instant('sidebar.exportingOdt'));
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

      if (!book) return;

      // 1. mimetype (MUST be first and uncompressed)
      zip.file('mimetype', 'application/vnd.oasis.opendocument.text', { compression: 'STORE' });

      // 2. META-INF/manifest.xml (ODT standard manifest)
      zip.file(
        'META-INF/manifest.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`,
      );

      const esc = (s: string) => escapeHtml(s);

      // 3. meta.xml
      zip.file(
        'meta.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<office:document-meta
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"
    office:version="1.2">
  <office:meta>
    <meta:generator>Libria</meta:generator>
    <dc:title>${esc(book.title)}</dc:title>
    <dc:creator>${esc(book.author)}</dc:creator>
    <meta:creation-date>${new Date().toISOString()}</meta:creation-date>
    <dc:language>${book.lang ?? 'es'}</dc:language>
  </office:meta>
</office:document-meta>`,
      );

      // 4. styles.xml (Minimal styles)
      zip.file(
        'styles.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
    office:version="1.2">
  <office:styles>
    <style:default-style style:family="paragraph">
      <style:paragraph-properties fo:line-height="150%" fo:margin-bottom="0.2in"/>
      <style:text-properties fo:font-size="12pt" fo:font-family="Liberation Serif"/>
    </style:default-style>
  </office:styles>
</office:document-styles>`,
      );

      const contentParts: string[] = [];

      const htmlToOdtXml = (
        htmlText: string,
        fnMap: Record<string, { num: number; content: string }>,
      ) => {
        if (!htmlText) return '';

        let xml = '';
        const re = /<(\/?)(\w+)(?:\s[^>]*)?\/?>|([^<]+)/g;
        let m: RegExpExecArray | null;

        let bold = false;
        let italic = false;
        let uline = false;

        while ((m = re.exec(htmlText)) !== null) {
          if (m[3] !== undefined) {
            // Text segment
            const text = esc(
              m[3]
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&nbsp;/g, '\u00A0'),
            );
            if (bold || italic || uline) {
              let styleName = '';
              if (bold && italic && uline) styleName = 'Bold_Italic_Underline';
              else if (bold && italic) styleName = 'Bold_Italic';
              else if (bold && uline) styleName = 'Bold_Underline';
              else if (italic && uline) styleName = 'Italic_Underline';
              else if (bold) styleName = 'Bold';
              else if (italic) styleName = 'Italic';
              else if (uline) styleName = 'Underline';

              xml += `<text:span text:style-name="${styleName}">${text}</text:span>`;
            } else {
              xml += text;
            }
          } else if (m[1] === '' && m[2] !== 'br') {
            const tag = m[2];
            if (tag === 'b' || tag === 'strong') bold = true;
            if (tag === 'i' || tag === 'em') italic = true;
            if (tag === 'u' || tag === 'ins') uline = true;
            if (tag === 'sup') {
              const mid = m[0];
              const fnMatch = mid.match(/data-fn="([^"]+)"/);
              if (fnMatch && fnMap[fnMatch[1]]) {
                const fnInfo = fnMap[fnMatch[1]];
                const fnContentXml = esc(fnInfo.content);
                xml += `<text:note text:id="ftn${fnInfo.num}" text:note-class="footnote"><text:note-citation>${fnInfo.num}</text:note-citation><text:note-body><text:p text:style-name="Footnote">${fnContentXml}</text:p></text:note-body></text:note>`;
              }
            }
          } else if (m[1] === '/') {
            const tag = m[2];
            if (tag === 'b' || tag === 'strong') bold = false;
            if (tag === 'i' || tag === 'em') italic = false;
            if (tag === 'u' || tag === 'ins') uline = false;
          } else if (m[2] === 'br') {
            xml += '<text:line-break/>';
          }
        }
        return xml;
      };

      chapters.forEach((c, index) => {
        // Add a page break before every chapter after the first one
        if (index > 0) {
          contentParts.push(`<text:p text:style-name="Page_Break"/>`);
        }

        const sortedFns = sortFootnotesByPosition(c.footnotes, c.body);
        const fnMap: Record<string, { num: number; content: string }> = {};
        sortedFns.forEach((fn, idx) => {
          fnMap[fn.id] = { num: idx + 1, content: fn.content || '' };
        });

        c.body.forEach((b) => {
          const rawText = b.text || '';
          const htmlText = b.html ? sanitizeRichHtml(b.html) : esc(rawText);
          const formatted = htmlToOdtXml(htmlText, fnMap);

          switch (b.type) {
            case 'halftitle':
            case 'title':
              contentParts.push(`<text:p text:style-name="Title">${formatted}</text:p>`);
              break;
            case 'subtitle':
              contentParts.push(`<text:p text:style-name="Subtitle">${formatted}</text:p>`);
              break;
            case 'author':
              contentParts.push(`<text:p text:style-name="Author">${formatted}</text:p>`);
              break;
            case 'chapter-title':
            case 'h1':
              contentParts.push(
                `<text:h text:outline-level="1" text:style-name="Heading_1">${formatted}</text:h>`,
              );
              break;
            case 'h2':
              contentParts.push(
                `<text:h text:outline-level="2" text:style-name="Heading_2">${formatted}</text:h>`,
              );
              break;
            case 'h3':
              contentParts.push(
                `<text:h text:outline-level="3" text:style-name="Heading_3">${formatted}</text:h>`,
              );
              break;
            case 'p':
            case 'first-p':
              contentParts.push(`<text:p text:style-name="Standard">${formatted}</text:p>`);
              break;
            case 'blockquote':
            case 'epigraph':
              contentParts.push(`<text:p text:style-name="Blockquote">${formatted}</text:p>`);
              break;
            case 'verse':
            case 'code':
              contentParts.push(`<text:p text:style-name="Preformatted">${formatted}</text:p>`);
              break;
            case 'list-unordered':
            case 'list-ordered': {
              const items = (b.html ? sanitizeRichHtml(b.html) : b.text || '')
                .split('</li>')
                .filter((s) => s.trim());
              let listXml = '';
              for (const item of items) {
                const rawItemContent = item.replace(/<li[^>]*>/i, '').trim();
                const formattedItem = htmlToOdtXml(rawItemContent, fnMap);
                if (formattedItem) {
                  listXml += `<text:list-item><text:p>${formattedItem}</text:p></text:list-item>`;
                }
              }
              contentParts.push(`<text:list>${listXml}</text:list>`);
              break;
            }
            case 'scene-break':
              contentParts.push(
                `<text:p text:style-name="Horizontal_Separator">${esc(sceneGlyphText(this.store.tweaks().sceneBreakType) || '* * *')}</text:p>`,
              );
              break;
            case 'page-break':
              contentParts.push(`<text:p text:style-name="Page_Break"/>`);
              break;
            default:
              contentParts.push(`<text:p>${formatted}</text:p>`);
              break;
          }
        });
      });

      const bodyContent = contentParts.join('\n');

      const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content
    xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:dc="http://purl.org/dc/elements/1.1/"
    office:version="1.2">
  <office:scripts/>
  <office:font-face-decls/>
  <office:automatic-styles>
    <style:style style:name="Bold" style:family="text">
      <style:text-properties fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Italic" style:family="text">
      <style:text-properties fo:font-style="italic"/>
    </style:style>
    <style:style style:name="Underline" style:family="text">
      <style:text-properties style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/>
    </style:style>
    <style:style style:name="Bold_Italic" style:family="text">
      <style:text-properties fo:font-weight="bold" fo:font-style="italic"/>
    </style:style>
    <style:style style:name="Bold_Underline" style:family="text">
      <style:text-properties fo:font-weight="bold" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/>
    </style:style>
    <style:style style:name="Italic_Underline" style:family="text">
      <style:text-properties fo:font-style="italic" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/>
    </style:style>
    <style:style style:name="Bold_Italic_Underline" style:family="text">
      <style:text-properties fo:font-weight="bold" fo:font-style="italic" style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"/>
    </style:style>
    <style:style style:name="Footnote" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-top="0in" fo:margin-bottom="0.05in"/>
      <style:text-properties fo:font-size="10pt"/>
    </style:style>
    <style:style style:name="Title" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="1in" fo:margin-bottom="0.5in"/>
      <style:text-properties fo:font-size="24pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Subtitle" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.3in"/>
      <style:text-properties fo:font-size="14pt" fo:font-style="italic"/>
    </style:style>
    <style:style style:name="Author" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:text-align="center" fo:margin-bottom="0.5in"/>
      <style:text-properties fo:font-size="14pt"/>
    </style:style>
    <style:style style:name="Heading_1" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0.4in" fo:margin-bottom="0.2in" fo:keep-with-next="always" fo:text-align="center"/>
      <style:text-properties fo:font-size="18pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Heading_2" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0.3in" fo:margin-bottom="0.15in" fo:keep-with-next="always"/>
      <style:text-properties fo:font-size="14pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Heading_3" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0.25in" fo:margin-bottom="0.1in" fo:keep-with-next="always"/>
      <style:text-properties fo:font-size="12pt" fo:font-weight="bold"/>
    </style:style>
    <style:style style:name="Blockquote" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:margin-left="0.5in" fo:margin-right="0.5in" fo:margin-top="0.1in" fo:margin-bottom="0.1in" fo:text-align="justify"/>
      <style:text-properties fo:font-size="11pt" fo:font-style="italic"/>
    </style:style>
    <style:style style:name="Preformatted" style:family="paragraph">
      <style:paragraph-properties fo:margin-top="0.1in" fo:margin-bottom="0.1in" fo:margin-left="0.2in"/>
      <style:text-properties fo:font-name="Courier New" fo:font-size="10pt" style:font-family-generic="modern"/>
    </style:style>
    <style:style style:name="Horizontal_Separator" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:text-align="center" fo:margin-top="0.2in" fo:margin-bottom="0.2in"/>
    </style:style>
    <style:style style:name="Page_Break" style:family="paragraph" style:parent-style-name="Standard">
      <style:paragraph-properties fo:break-before="page"/>
    </style:style>
  </office:automatic-styles>
  <office:body>
    <office:text>
      ${bodyContent}
    </office:text>
  </office:body>
</office:document-content>`;

      zip.file('content.xml', contentXml);

      const content = await zip.generateAsync({ type: 'blob' });
      await this.files.downloadFile(content, `${book.title}.odt`);
    } finally {
      this.store.setExporting(false);
    }
  }
}
