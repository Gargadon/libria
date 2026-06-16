import { Block, Footnote, Chapter, Tweaks, sortFootnotesByPosition } from '../models/book.models';
import { sceneBreakGlyph, escapeHtml, imageTransform } from './block-maps';

export interface RenderBlockOptions {
  tweaks: Tweaks;
  assets: Record<string, string>;
  hyphenateHtml?: (s: string) => string;
}

function rawText(b: Block): string {
  return b.html ?? escapeHtml(b.text ?? '');
}

export function blockToHtml(b: Block, opts: RenderBlockOptions): string {
  const raw = rawText(b);
  const hyph = opts.hyphenateHtml ?? ((s: string) => s);

  switch (b.type) {
    case 'halftitle':
    case 'title':
    case 'subtitle':
    case 'author':
    case 'publisher':
    case 'chapter-num':
    case 'chapter-title':
    case 'h1':
    case 'h2':
    case 'h3':
      return blockTitleHtml(b, raw);
    case 'first-p': {
      const dc = opts.tweaks.dropCap ? ' has-dropcap' : '';
      const text = (b.drop && !b.text?.startsWith(b.drop) ? b.drop : '') + b.text;
      return `<p class="kp-first${dc}">${hyph(b.html || escapeHtml(text))}</p>`;
    }
    case 'p':
      return `<p class="kp-p">${hyph(raw)}</p>`;
    case 'blockquote':
      return `<blockquote class="kp-quote">${hyph(raw)}</blockquote>`;
    case 'epigraph': {
      const att = b.attribution ? escapeHtml(b.attribution) : '';
      return `<div class="kp-epigraph"><blockquote class="kp-epigraph__q">${hyph(raw)}</blockquote>${att ? `<cite class="kp-epigraph__att">— ${att}</cite>` : ''}</div>`;
    }
    case 'verse':
      return `<pre class="kp-verse"><code>${raw}</code></pre>`;
    case 'code':
      return `<pre class="kp-code"><code>${raw}</code></pre>`;
    case 'scene-break':
      return `<div class="kp-break">${sceneBreakGlyph(opts.tweaks.sceneBreakType)}</div>`;
    case 'page-break':
      return `<div class="kp-page-break"></div>`;
    case 'image':
      return imageBlockHtml(b, opts.assets);
    case 'list-unordered':
      return `<ul class="kp-list">${raw}</ul>`;
    case 'list-ordered':
      return `<ol class="kp-list">${raw}</ol>`;
    case 'table':
      return `<div class="kp-table-wrap">${tableHtml(raw)}</div>`;
    default:
      return '';
  }
}

function blockTitleHtml(b: Block, raw: string): string {
  const clsMap: Record<string, string> = {
    halftitle: 'kp-halftitle',
    title: 'kp-title',
    subtitle: 'kp-sub',
    author: 'kp-author',
    publisher: 'kp-pub',
    dedication: 'kp-ded',
    'chapter-num': 'kp-chnum',
    'chapter-title': 'kp-chtitle',
    h1: 'kp-h1',
    h2: 'kp-h2',
    h3: 'kp-h3',
  };
  const cls = clsMap[b.type] || 'kp-p';
  const tag = (b.type === 'chapter-title' || b.type === 'h1') ? 'h2'
    : b.type === 'h2' ? 'h3'
    : b.type === 'h3' ? 'h4'
    : b.type === 'halftitle' || b.type === 'title' ? 'h1'
    : 'div';
  return `<${tag} class="${cls}">${raw}</${tag}>`;
}

function imageBlockHtml(b: Block, assets: Record<string, string>): string {
  const imgSrc = b.src ? (assets[b.src] ?? '') : '';
  if (!imgSrc) return '';
  const style = imageStyle(b);
  const cap = b.caption
    ? `<figcaption style="text-align:center;font-size:0.85em;margin-top:0.5em;color:#555">${escapeHtml(b.caption)}</figcaption>`
    : '';
  return `<figure class="kp-image"><img src="${imgSrc}" style="${style}" alt="">${cap}</figure>`;
}

function imageStyle(b: Block): string {
  const parts = ['max-width:100%;display:block;margin:0 auto'];
  if (b.width && b.height) {
    parts.push(`width:${b.width}px;height:${b.height}px`);
  } else {
    parts.push('height:auto');
  }
  parts.push(imageTransform(b.rotation, b.flipH, b.flipV));
  return parts.join(';');
}

function tableHtml(html: string): string {
  if (!html) return '';
  return html.startsWith('<table') ? html : '<table>' + html + '</table>';
}

export function chapterFootnotesHtml(footnotes: Footnote[] | undefined, body: Block[]): string {
  if (!footnotes?.length) return '';
  const sorted = sortFootnotesByPosition(footnotes, body);
  let html = '<div class="kp-fnpanel"><hr class="kp-fnpanel-rule">';
  sorted.forEach((fn: Footnote, fi: number) => {
    html += `<div class="kp-fnpanel-item"><span class="kp-fnpanel-num">${fi + 1}.</span> <span class="kp-fnpanel-text">${escapeHtml(fn.content || '')}</span></div>`;
  });
  html += '</div>';
  return html;
}

export function chapterToHtml(chapter: Chapter, opts: RenderBlockOptions): string {
  const body = chapter.body.map(b => blockToHtml(b, opts)).join('\n');
  return body + '\n' + chapterFootnotesHtml(chapter.footnotes, chapter.body);
}
