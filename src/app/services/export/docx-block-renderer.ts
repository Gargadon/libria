import { sanitizeRichHtml } from '../../utils/block-html';

import type { Paragraph, TextRun, FootnoteReferenceRun } from 'docx';

import { escapeHtml } from './export-utils';

export interface DocxRevisionContext {
  author: string;
  date: string;
}

interface RunStyle {
  font: string;
  size: number;
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
}

export class DocxBlockRenderer {
  private revisionId = 0;

  constructor(
    private readonly _docx: any,
    private readonly revision?: DocxRevisionContext,
  ) {}

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
    opts: RunStyle,
    align: string,
    before = 0,
    after = 0,
    fnIdToNum?: Record<string, number>,
  ): Paragraph {
    return new this._docx.Paragraph({
      alignment: align as any,
      spacing: { before, after },
      children: this.parse(b, opts, fnIdToNum),
    });
  }

  htmlToTextRuns(b: { text?: string; html?: string }, opts: RunStyle): TextRun[] {
    return this.parse(b, opts) as TextRun[];
  }

  blockToChildren(
    b: { text?: string; html?: string },
    opts: RunStyle,
    fnIdToNum: Record<string, number>,
  ): (TextRun | FootnoteReferenceRun)[] {
    return this.parse(b, opts, fnIdToNum);
  }

  /**
   * Convierte el HTML enriquecido en ejecuciones de DOCX. Las marcas de revisión
   * (`ins`/`del`) se convierten en revisiones nativas de Word cuando hay contexto de
   * revisión; sin él se descartan como formato normal.
   */
  private parse(
    b: { text?: string; html?: string },
    opts: RunStyle,
    fnIdToNum?: Record<string, number>,
  ): (TextRun | FootnoteReferenceRun)[] {
    const raw = b.html ? sanitizeRichHtml(b.html) : escapeHtml(b.text ?? '');
    if (!raw) return [this.emptyRun(opts)];

    const runs: (TextRun | FootnoteReferenceRun)[] = [];
    const re = /<(\/?)(\w+)(?:\s[^>]*)?\/?>|([^<]+)/g;
    let m: RegExpExecArray | null;

    let bold = !!opts.bold;
    let italic = !!opts.italics;
    let uline = !!opts.underline;
    let inserted = false;
    let deleted = false;

    while ((m = re.exec(raw)) !== null) {
      if (m[3] !== undefined) {
        runs.push(this.textRun(decodeEntities(m[3]), {
          ...opts,
          bold,
          italics: italic,
          underline: uline,
        }, deleted ? 'del' : inserted ? 'ins' : null, opts.smallCaps && runs.length === 0));
        continue;
      }

      const closing = m[1] === '/';
      const tag = m[2];

      if (!closing && tag === 'sup' && fnIdToNum) {
        const fnMatch = m[0].match(/data-fn="([^"]+)"/);
        if (fnMatch && fnIdToNum[fnMatch[1]]) {
          runs.push(new this._docx.FootnoteReferenceRun(fnIdToNum[fnMatch[1]]));
        }
      }
      if (tag === 'br') continue;

      const active = closing ? false : true;
      if (tag === 'b' || tag === 'strong') bold = active;
      if (tag === 'i' || tag === 'em') italic = active;
      if (tag === 'u') uline = active;
      if (tag === 'ins') inserted = active;
      if (tag === 'del') deleted = active;
    }

    return runs.length ? runs : [this.emptyRun(opts)];
  }

  private emptyRun(opts: RunStyle): TextRun {
    return new this._docx.TextRun({ text: '', font: opts.font, size: opts.size });
  }

  private textRun(
    text: string,
    style: RunStyle,
    revision: 'ins' | 'del' | null,
    smallCaps: boolean | undefined,
  ): TextRun {
    const base = {
      text,
      font: style.font,
      size: style.size,
      bold: style.bold,
      italics: style.italics,
      underline: style.underline ? { type: this._docx.UnderlineType.SINGLE } : undefined,
      smallCaps,
    };
    if (!revision || !this.revision) return new this._docx.TextRun(base);
    if (!this._docx.InsertedTextRun || !this._docx.DeletedTextRun) return new this._docx.TextRun(base);

    const changed = {
      id: ++this.revisionId,
      author: this.revision.author,
      date: this.revision.date,
    };
    return revision === 'ins'
      ? new this._docx.InsertedTextRun({ ...base, ...changed })
      : new this._docx.DeletedTextRun({ ...base, ...changed });
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, '\u00A0');
}
