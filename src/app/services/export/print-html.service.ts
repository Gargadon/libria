import { Injectable, inject } from '@angular/core';

import { HyphenService } from '../hyphen.service';

import { blockToHtml, chapterFootnotesHtml } from '../../utils/block-html';
import { pageSizeCss, sceneBreakGlyph } from '../../utils/block-maps';

import { align, escapeHtml } from './export-utils';

@Injectable({ providedIn: 'root' })
export class PrintHtmlService {
  private readonly hyphenService = inject(HyphenService);
  buildPrintHtml(
    book: any,
    chapters: any[],
    t: any,
    bodyFontFamily: string,
    titleFontFamily: string,
    fontsHref?: string,
    assets: Record<string, string> = {},
    pageMap?: Record<string, number>,
    pagedPreview = false,
  ): string {
    const pageSize = pageSizeCss(book.paperSize || '5x8');
    const screenPreview = !!fontsHref && !pagedPreview;

    // Fonts are injected by the main process from public/fonts.css (local WOFF2).
    const brk = sceneBreakGlyph(t.sceneBreakType);

    const pGap = `${(t.paragraphSpacing / t.fontSize).toFixed(3)}em`;
    const indent = t.indentFirstLine ? `${t.indentSize}cm` : '0';
    const align = t.justifyText ? 'justify' : 'left';
    const hyphens = t.hyphenation ? '-webkit-hyphens:manual;hyphens:manual;' : '';
    const dropLines = t.dropCapLines ?? 3;

    const titleW = t.titleBold ? 'bold' : 'normal';
    const titleS = t.titleItalic ? 'italic' : 'normal';
    const titleD = t.titleUnderline ? 'underline' : 'none';
    const tAlign = t.titleAlignment ?? 'center';

    const screenCss = screenPreview
      ? `
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
.kp-quote { margin-left: 0.5px; }`
      : '';

    let marginBoxesCss = '';
    if (!fontsHref || pagedPreview) {
      const showHdr = t.showHeader;
      const showPN = t.showPageNumbers;
      const pnp = t.pageNumberPosition;
      const esc = (s: string) => escapeHtml(s);
      const headerVal = esc(t.headerText || book.title);

      const headerFooterStyle = `
        font-family: ${bodyFontFamily};
        font-size: 9pt;
        color: #555;
        font-weight: normal;
        font-style: normal;
      `;

      marginBoxesCss = t.hideFirstPageHeaderFooter !== false ? `
@page :first {
  @top-left { content: none !important; }
  @top-center { content: none !important; }
  @top-right { content: none !important; }
  @bottom-left { content: none !important; }
  @bottom-center { content: none !important; }
  @bottom-right { content: none !important; }
}
      ` : '';

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
  margin-top: ${t.marginTop}mm;
  margin-bottom: ${t.marginBottom}mm;
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
.ch { break-before: ${screenPreview ? 'column' : 'page'}; break-inside: auto; }
.ch:first-child { break-before: auto; }
.ch--recto { break-before: ${screenPreview ? 'column' : 'recto'}; }

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
  font-variant: ${t.firstParagraphSmallCaps !== false ? 'small-caps' : 'normal'};
  letter-spacing: ${t.firstParagraphSmallCaps !== false ? '.04em' : 'normal'};
}
${
  t.dropCap
    ? `
/* Vivliostyle needs a regular block to split ::first-line from the rest
   of the paragraph. flow-root bypasses its line styling layout. */
.has-dropcap { display: ${screenPreview ? 'flow-root' : 'block'}; }
.has-dropcap::first-letter {
  font-family: ${titleFontFamily};
  float: left;
  /* Match the float's height to the requested lines, including leading.
     Subtract the top padding and a half-point rounding allowance. */
  font-size: ${((dropLines * t.lineHeight * t.fontSize - 2.5) / .85).toFixed(4)}pt;
  line-height: .85;
  padding: 2pt 4pt 0 0;
}
`
    : ''
}

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
  break-after: ${screenPreview ? 'column' : 'page'};
  ${!screenPreview ? 'page-break-after: always;' : ''}
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
.kp-toc-heading {
  text-align: center;
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 1.4em;
}
.kp-toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.kp-toc-li {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding: 3px 0;
  border-bottom: 1px dotted #ccc;
}
.kp-toc-link {
  color: inherit;
  display: flex;
  align-items: baseline;
  width: 100%;
  text-decoration: none;
}
.kp-toc-link::after {
  content: ${screenPreview ? "''" : "leader('.') target-counter(attr(href), page)"};
  flex: 1;
  margin-left: 0.45em;
  text-align: right;
  font-size: 0.85em;
  color: #555;
  font-variant-numeric: tabular-nums;
}
.kp-toc-li--front,
.kp-toc-li--back {
  font-size: 0.85em;
  color: #555;
  padding-left: 8px;
}
.kp-toc-name {
  flex: 1;
}
.kp-toc-num {
  min-width: 18px;
  color: #888;
  font-size: 0.85em;
  font-variant-numeric: tabular-nums;
}
.kp-toc-pg {
  min-width: 28px;
  text-align: right;
  font-size: 0.85em;
  color: #555;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
`;

    const printIds = new Map(
      chapters.map((ch: any, idx: number) => [ch.id, `libria-chapter-${idx + 1}`]),
    );
    const chaptersHtml = chapters
      .map((ch: any, idx: number) => {
        const cls = ['ch', idx > 0 && ch.forceOddPage ? 'ch--recto' : ''].filter(Boolean).join(' ');

        let body: string;
        if (ch.templateId === 'toc') {
          const tocItems = chapters
            .filter((c: any) => c.templateId !== 'toc')
            .map((c: any) => {
              const page = pageMap?.[c.id];
              const pgCell =
                screenPreview && page != null ? `<span class="kp-toc-pg">${page}</span>` : '';
              const num =
                c.kind === 'chapter' && c.number != null
                  ? `<span class="kp-toc-num">${c.number}.</span> `
                  : '';
              return `<li class="kp-toc-li kp-toc-li--${c.kind}"><a class="kp-toc-link" href="#${printIds.get(c.id)}"><span class="kp-toc-name">${num}${escapeHtml(c.title)}</span>${pgCell}</a></li>`;
            })
            .join('\n');
          body = `<h2 class="kp-toc-heading" style="font-family:${titleFontFamily}">${escapeHtml(ch.title)}</h2>\n<ol class="kp-toc-list">${tocItems}</ol>`;
        } else {
          body = ch.body
            .map((b: any, blockIndex: number) =>
              blockToHtml(b, {
                tweaks: t,
                assets,
                hyphenateHtml: (s: string) => this.hyphenService.hyphenateHtml(s),
              }).replace(/^(\s*<[a-z][a-z0-9-]*)/i, `$1 data-libria-block="${idx}:${blockIndex}"`),
            )
            .join('\n');
        }

        const fnHtml = ch.templateId === 'toc' ? '' : chapterFootnotesHtml(ch.footnotes, ch.body);
        return `<div id="${printIds.get(ch.id)}" class="${cls}" data-id="${ch.id}">\n${body}\n${fnHtml}</div>`;
      })
      .join('\n\n');

    let fontTags = '';
    if (fontsHref) {
      const base = new URL('.', fontsHref).href;
      fontTags = `  <base href="${base}">\n  <link rel="stylesheet" href="fonts.css">\n`;
    }
    const bodyContent = screenPreview
      ? `<div class="pv-clip"><div class="pv-slider"><div class="pv-flow">\n${chaptersHtml}\n</div></div></div>`
      : chaptersHtml;
    return `<!DOCTYPE html>
<html lang="${escapeHtml(book.lang ?? 'es')}">
<head>
  <meta charset="UTF-8">
  <meta name="author" content="${escapeHtml(book.authors?.filter((name: string) => name.trim()).join(', ') || book.author || '')}">
  <title>${escapeHtml(book.title)}</title>
${fontTags}  <style>${css}${screenCss}</style>
  <script id="libria-cfg" type="application/json">{"mi":${t.marginInner},"mo":${t.marginOuter}}</script>
</head>
<body>
${bodyContent}
</body>
</html>`;
  }
}
