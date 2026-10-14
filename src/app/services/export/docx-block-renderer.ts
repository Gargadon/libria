import { sanitizeRichHtml } from '../../utils/block-html';

import type { Paragraph, TextRun, FootnoteReferenceRun } from 'docx';

import { align, escapeHtml } from './export-utils';

export class DocxBlockRenderer {
  constructor(private readonly _docx: any) {}
  async addFootnotesToDoc(doc: any, footnoteDefs: { id: number; text: string }[]) {
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

  p(
    b: { text?: string; html?: string },
    opts: {
      font: string;
      size: number;
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
    },
    align: string,
    before = 0,
    after = 0,
    fnIdToNum?: Record<string, number>,
  ): Paragraph {
    return new this._docx.Paragraph({
      alignment: align as any,
      spacing: { before, after },
      children: fnIdToNum ? this.blockToChildren(b, opts, fnIdToNum) : this.htmlToTextRuns(b, opts),
    });
  }

  htmlToTextRuns(
    b: { text?: string; html?: string },
    opts: {
      font: string;
      size: number;
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      smallCaps?: boolean;
    },
  ): TextRun[] {
    const raw = b.html ? sanitizeRichHtml(b.html) : escapeHtml(b.text ?? '');
    if (!raw) return [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];

    const runs: TextRun[] = [];
    const re = /<(\/?)(\w+)(?:\s[^>]*)?\/?>|([^<]+)/g;
    let m: RegExpExecArray | null;

    let bold = !!opts.bold;
    let italic = !!opts.italics;
    let uline = !!opts.underline;

    while ((m = re.exec(raw)) !== null) {
      if (m[3] !== undefined) {
        const text = m[3]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&nbsp;/g, '\u00A0');
        runs.push(
          new this._docx.TextRun({
            text,
            font: opts.font,
            size: opts.size,
            bold,
            italics: italic,
            underline: uline ? { type: this._docx.UnderlineType.SINGLE } : undefined,
            smallCaps: opts.smallCaps && runs.length === 0,
          }),
        );
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

    return runs.length
      ? runs
      : [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];
  }

  blockToChildren(
    b: { text?: string; html?: string },
    opts: {
      font: string;
      size: number;
      bold?: boolean;
      italics?: boolean;
      underline?: boolean;
      smallCaps?: boolean;
    },
    fnIdToNum: Record<string, number>,
  ): (TextRun | FootnoteReferenceRun)[] {
    const raw = b.html ? sanitizeRichHtml(b.html) : escapeHtml(b.text ?? '');
    if (!raw) return [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];

    const children: (TextRun | FootnoteReferenceRun)[] = [];
    const re = /<(\/?)(\w+)(?:\s[^>]*)?\/?>|([^<]+)/g;
    let m: RegExpExecArray | null;

    let bold = !!opts.bold;
    let italic = !!opts.italics;
    let uline = !!opts.underline;

    while ((m = re.exec(raw)) !== null) {
      if (m[3] !== undefined) {
        const text = m[3]
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&nbsp;/g, '\u00A0');
        children.push(
          new this._docx.TextRun({
            text,
            font: opts.font,
            size: opts.size,
            bold,
            italics: italic,
            underline: uline ? { type: this._docx.UnderlineType.SINGLE } : undefined,
            smallCaps: opts.smallCaps && children.length === 0,
          }),
        );
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

    return children.length
      ? children
      : [new this._docx.TextRun({ text: '', font: opts.font, size: opts.size })];
  }
}
