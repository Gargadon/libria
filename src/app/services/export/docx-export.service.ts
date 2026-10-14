import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';
import { sortFootnotesByPosition } from '../../models/book.models';

import { AssetService } from '../asset.service';

import { sanitizeRichHtml } from '../../utils/block-html';

import type {
  Paragraph,
  TextRun,
  TableOfContents,
  Table,
  TableRow,
  TableCell,
  IMediaTransformation,
} from 'docx';

import { ExportFileService } from './export-file.service';
import {
  resolveChapters,
  fontName,
  align,
  dataUrlToBlob,
  sceneGlyphText,
  imageExt,
} from './export-utils';
import { DocxBlockRenderer } from './docx-block-renderer';

@Injectable({ providedIn: 'root' })
export class DocxExportService {
  private readonly store = inject(BookStore);
  private readonly ts = inject(TranslateService);
  private readonly assetService = inject(AssetService);
  private readonly files = inject(ExportFileService);
  private _docx: any;

  async exportDocx() {
    this.store.setExporting(true, this.ts.instant('sidebar.exportingDocx'));
    if (!this._docx) this._docx = await import('docx');
    const renderer = new DocxBlockRenderer(this._docx);
    try {
      const book = this.store.book();
      const prefs = this.store.exportPrefs();
      const chapters = resolveChapters(this.store.chapters(), prefs);
      const t = this.store.tweaks();
      const assets = this.assetService.getAll();
      if (!book) return;

      const children: (Paragraph | TableOfContents | Table)[] = [];

      if (prefs.includeCover && assets['cover']) {
        const coverBlob = dataUrlToBlob(assets['cover']);
        const coverBuf = await coverBlob.arrayBuffer();
        const ext = imageExt(assets['cover']);
        children.push(
          new this._docx.Paragraph({
            alignment: 'center',
            spacing: { before: 3000, after: 100 },
            children: [
              new this._docx.ImageRun({
                type: ext as any,
                data: coverBuf,
                transformation: { width: 400, height: 600 },
              }),
            ],
          }),
        );
      }

      const bodyFont = t.customBookFont || fontName(t.bookFont);
      const titleFont = t.customTitleFont || fontName(t.titleFont);
      const tAlign = align(t.titleAlignment);
      const bodyAlign = (t.justifyText ? 'both' : 'left') as any;
      const fs = Math.round(t.fontSize * 2);
      const ts = Math.round(t.titleFontSize * 2);
      const lsp = Math.round(t.lineHeight * 240);
      const pg = Math.round(t.paragraphSpacing * 20);
      const ind = t.indentFirstLine ? Math.round(t.indentSize * 567) : 0;
      const glyph = sceneGlyphText(t.sceneBreakType);

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
              children.push(
                renderer.p(
                  b,
                  {
                    font: titleFont,
                    size: Math.round(ts * 1.2),
                    bold: t.titleBold,
                    italics: t.titleItalic,
                    underline: t.titleUnderline,
                  },
                  tAlign,
                  1200,
                ),
              );
              prevIsBody = false;
              break;
            case 'title':
              children.push(
                renderer.p(
                  b,
                  {
                    font: titleFont,
                    size: Math.round(ts * 1.8),
                    bold: t.titleBold,
                    italics: t.titleItalic,
                    underline: t.titleUnderline,
                  },
                  tAlign,
                  0,
                  200,
                ),
              );
              prevIsBody = false;
              break;
            case 'subtitle':
              children.push(
                renderer.p(
                  b,
                  { font: bodyFont, size: Math.round(fs * 0.9), italics: true },
                  tAlign,
                  0,
                  600,
                ),
              );
              prevIsBody = false;
              break;
            case 'author':
              children.push(
                renderer.p(b, { font: bodyFont, size: Math.round(fs * 0.85) }, 'center', 0, 200),
              );
              prevIsBody = false;
              break;
            case 'publisher':
              children.push(
                renderer.p(b, { font: bodyFont, size: Math.round(fs * 0.7) }, 'center', 1200, 0),
              );
              prevIsBody = false;
              break;
            case 'dedication': {
              const lines = (b.text ?? '').split('\n');
              for (const line of lines) {
                children.push(
                  new this._docx.Paragraph({
                    alignment: 'center',
                    spacing: { after: 100 },
                    children: [
                      new this._docx.TextRun({
                        text: line || ' ',
                        font: bodyFont,
                        size: fs,
                        italics: true,
                      }),
                    ],
                  }),
                );
              }
              prevIsBody = false;
              break;
            }
            case 'chapter-num':
              children.push(
                renderer.p(
                  b,
                  {
                    font: titleFont,
                    size: Math.round(ts * 0.7),
                    bold: t.titleBold,
                    italics: t.titleItalic,
                  },
                  tAlign,
                  0,
                  80,
                ),
              );
              prevIsBody = false;
              break;
            case 'chapter-title':
              children.push(
                renderer.p(
                  b,
                  {
                    font: titleFont,
                    size: ts,
                    bold: t.titleBold,
                    italics: t.titleItalic,
                    underline: t.titleUnderline,
                  },
                  tAlign,
                  0,
                  400,
                  fnIdToNum,
                ),
              );
              prevIsBody = false;
              break;
            case 'h1':
              children.push(
                renderer.p(
                  b,
                  {
                    font: titleFont,
                    size: Math.round(ts * 0.85),
                    bold: t.titleBold,
                    italics: t.titleItalic,
                  },
                  tAlign,
                  400,
                  200,
                  fnIdToNum,
                ),
              );
              prevIsBody = false;
              break;
            case 'h2':
              children.push(
                renderer.p(
                  b,
                  {
                    font: titleFont,
                    size: Math.round(ts * 0.72),
                    bold: t.titleBold,
                    italics: t.titleItalic,
                  },
                  tAlign,
                  300,
                  150,
                  fnIdToNum,
                ),
              );
              prevIsBody = false;
              break;
            case 'h3':
              children.push(
                renderer.p(
                  b,
                  {
                    font: titleFont,
                    size: Math.round(ts * 0.62),
                    bold: t.titleBold,
                    italics: t.titleItalic,
                  },
                  tAlign,
                  200,
                  100,
                  fnIdToNum,
                ),
              );
              prevIsBody = false;
              break;
            case 'first-p':
              children.push(
                new this._docx.Paragraph({
                  alignment: bodyAlign,
                  spacing: { line: lsp, after: pg },
                  indent: { firstLine: 0 },
                  children: fnIdToNum
                    ? renderer.blockToChildren(
                        b,
                        { font: bodyFont, size: fs, smallCaps: true },
                        fnIdToNum,
                      )
                    : renderer.htmlToTextRuns(b, { font: bodyFont, size: fs, smallCaps: true }),
                }),
              );
              prevIsBody = true;
              break;
            case 'p':
              children.push(
                new this._docx.Paragraph({
                  alignment: bodyAlign,
                  spacing: { line: lsp, after: pg },
                  indent: { firstLine: prevIsBody ? ind : 0 },
                  children: fnIdToNum
                    ? renderer.blockToChildren(b, { font: bodyFont, size: fs }, fnIdToNum)
                    : renderer.htmlToTextRuns(b, { font: bodyFont, size: fs }),
                }),
              );
              prevIsBody = true;
              break;
            case 'blockquote':
              children.push(
                new this._docx.Paragraph({
                  alignment: 'left',
                  indent: { left: 720 },
                  spacing: { line: lsp, before: 200, after: 200 },
                  children: fnIdToNum
                    ? renderer.blockToChildren(
                        b,
                        { font: bodyFont, size: fs, italics: true },
                        fnIdToNum,
                      )
                    : renderer.htmlToTextRuns(b, { font: bodyFont, size: fs, italics: true }),
                }),
              );
              prevIsBody = false;
              break;
            case 'epigraph':
              children.push(
                new this._docx.Paragraph({
                  alignment: 'center',
                  spacing: { line: lsp, before: 300, after: 60 },
                  children: fnIdToNum
                    ? renderer.blockToChildren(
                        b,
                        { font: bodyFont, size: fs, italics: true },
                        fnIdToNum,
                      )
                    : renderer.htmlToTextRuns(b, { font: bodyFont, size: fs, italics: true }),
                }),
              );
              if (b.attribution) {
                children.push(
                  new this._docx.Paragraph({
                    alignment: 'center',
                    spacing: { before: 0, after: 300 },
                    indent: { left: 1440 },
                    children: [
                      new this._docx.TextRun({
                        text: `— ${b.attribution}`,
                        font: bodyFont,
                        size: Math.round(fs * 0.85),
                        color: '555555',
                      }),
                    ],
                  }),
                );
              }
              prevIsBody = false;
              break;
            case 'verse':
              children.push(
                new this._docx.Paragraph({
                  alignment: 'left',
                  spacing: { line: lsp, before: 200, after: 200 },
                  children: fnIdToNum
                    ? renderer.blockToChildren(b, { font: 'Courier New', size: fs }, fnIdToNum)
                    : renderer.htmlToTextRuns(b, { font: 'Courier New', size: fs }),
                }),
              );
              prevIsBody = false;
              break;
            case 'code':
              children.push(
                new this._docx.Paragraph({
                  alignment: 'left',
                  spacing: { line: lsp, before: 200, after: 200 },
                  indent: { left: 360, right: 360 },
                  shading: { type: 'clear', fill: 'F5F3F1' },
                  children: fnIdToNum
                    ? renderer.blockToChildren(
                        b,
                        { font: 'Courier New', size: Math.round(fs * 0.85) },
                        fnIdToNum,
                      )
                    : renderer.htmlToTextRuns(b, {
                        font: 'Courier New',
                        size: Math.round(fs * 0.85),
                      }),
                }),
              );
              prevIsBody = false;
              break;
            case 'scene-break':
              children.push(
                new this._docx.Paragraph({
                  alignment: 'center',
                  spacing: { before: 400, after: 400 },
                  children: [
                    new this._docx.TextRun({
                      text: glyph,
                      font: bodyFont,
                      size: fs,
                      color: '888888',
                    }),
                  ],
                }),
              );
              prevIsBody = false;
              break;
            case 'page-break':
              children.push(new this._docx.Paragraph({ children: [], pageBreakBefore: true }));
              prevIsBody = false;
              break;
            case 'image': {
              const imgKey = b.src;
              if (imgKey && assets[imgKey]) {
                const imgBlob = dataUrlToBlob(assets[imgKey]);
                const imgBuf = await imgBlob.arrayBuffer();
                const ext = imageExt(assets[imgKey]);
                const dims =
                  b.width && b.height
                    ? { width: b.width, height: b.height }
                    : { width: 460, height: 600 };
                const transformation: IMediaTransformation = {
                  width: dims.width,
                  height: dims.height,
                  ...(b.rotation ? { rotation: b.rotation } : {}),
                  ...(b.flipH || b.flipV
                    ? { flip: { horizontal: !!b.flipH, vertical: !!b.flipV } }
                    : {}),
                };
                children.push(
                  new this._docx.Paragraph({
                    alignment: 'center',
                    spacing: { before: 200, after: b.caption ? 0 : 200 },
                    children: [
                      new this._docx.ImageRun({ type: ext as any, data: imgBuf, transformation }),
                    ],
                  }),
                );
                if (b.caption) {
                  children.push(
                    new this._docx.Paragraph({
                      alignment: 'center',
                      spacing: { before: 60, after: 200 },
                      children: [
                        new this._docx.TextRun({ text: b.caption, size: 20, color: '555555' }),
                      ],
                    }),
                  );
                }
              }
              prevIsBody = false;
              break;
            }
            case 'list-unordered':
            case 'list-ordered': {
              const items = (b.html ? sanitizeRichHtml(b.html) : b.text || '')
                .split('</li>')
                .filter((s) => s.trim());
              for (const item of items) {
                const itemText = item.replace(/<[^>]+>/g, '').trim();
                if (!itemText) continue;
                children.push(
                  new this._docx.Paragraph({
                    alignment: 'left',
                    spacing: { line: lsp, after: 60 },
                    indent: { left: 720, hanging: 360 },
                    bullet: b.type === 'list-unordered' ? { level: 0 } : undefined,
                    children: [
                      new this._docx.TextRun({ text: itemText, font: bodyFont, size: fs }),
                    ],
                  }),
                );
              }
              prevIsBody = false;
              break;
            }
            case 'table': {
              const rows = (b.html ? sanitizeRichHtml(b.html) : '').match(/<tr>.*?<\/tr>/gi) || [];
              const tableRows: TableRow[] = [];
              for (const rowHtml of rows) {
                const cells = rowHtml.match(/<t[dh][^>]*>.*?<\/t[dh]>/gi) || [];
                const rowChildren: TableCell[] = [];
                for (const cellHtml of cells) {
                  const cellText = cellHtml.replace(/<[^>]+>/g, '').trim();
                  rowChildren.push(
                    new this._docx.TableCell({
                      children: [
                        new this._docx.Paragraph({
                          alignment: 'left',
                          children: [
                            new this._docx.TextRun({
                              text: cellText || ' ',
                              font: bodyFont,
                              size: fs,
                            }),
                          ],
                        }),
                      ],
                    }),
                  );
                }
                if (rowChildren.length) {
                  tableRows.push(new this._docx.TableRow({ children: rowChildren }));
                }
              }
              if (tableRows.length) {
                children.push(
                  new this._docx.Table({
                    rows: tableRows,
                    width: { size: 100, type: this._docx.WidthType.PERCENTAGE },
                  }),
                );
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

      await renderer.addFootnotesToDoc(doc, allFootnoteDefs);
      const blob = await this._docx.Packer.toBlob(doc);
      await this.files.downloadFile(blob, `${book.title}.docx`);
    } finally {
      this.store.setExporting(false);
    }
  }
}
