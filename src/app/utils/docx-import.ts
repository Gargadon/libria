import { Block, Chapter } from '../models/book.models';
import { sanitizeRichHtml } from './block-html';

export interface DocxImportResult {
  chapters: Chapter[];
  assets: Record<string, string>;
  warnings: string[];
}

/** Convert Mammoth semantic HTML to editor blocks without flattening rich text. */
export function parseDocxHtml(html: string): DocxImportResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const result: DocxImportResult = { chapters: [], assets: {}, warnings: [] };
  const definitions = new Map<string, string>();
  doc.querySelectorAll('li[id]').forEach(el => {
    if (!/^(footnote|endnote)-/.test(el.id)) return;
    el.querySelectorAll('a[href^="#footnote-ref"], a[href^="#endnote-ref"]').forEach(link => link.remove());
    definitions.set(el.id, el.textContent?.trim() || '');
    el.remove();
  });
  const chapterHeading = doc.querySelector('h1') ? 'h1' : 'h2';
  let chapter: Chapter | undefined;
  const startChapter = (title: string) => {
    chapter = { id: 'ch-' + crypto.randomUUID(), kind: 'chapter', title, words: 0,
      number: result.chapters.length + 1, status: 'draft', body: [] };
    result.chapters.push(chapter);
  };
  const add = (block: Block) => {
    if (!chapter) startChapter('Inicio');
    const index = chapter!.body.length;
    if (block.html) {
      const fragment = doc.createElement('div');
      fragment.innerHTML = block.html;
      fragment.querySelectorAll<HTMLAnchorElement>('a[href^="#footnote-"], a[href^="#endnote-"]').forEach(link => {
        const target = link.getAttribute('href')!.slice(1);
        const content = definitions.get(target);
        if (content === undefined) { result.warnings.push('No se encontró una nota al pie: ' + target); return; }
        const id = 'fn-' + crypto.randomUUID();
        const ref = doc.createElement('sup');
        ref.setAttribute('data-fn', id);
        ref.textContent = `[${(chapter!.footnotes?.length || 0) + 1}]`;
        if (link.parentElement?.tagName === 'SUP') link.parentElement.replaceWith(ref);
        else link.replaceWith(ref);
        (chapter!.footnotes ??= []).push({ id, blockIndex: index, content });
      });
      block.html = sanitizeRichHtml(fragment.innerHTML);
      fragment.innerHTML = block.html;
      const textCopy = fragment.cloneNode(true) as HTMLElement;
      textCopy.querySelectorAll('p,li,tr,td,th,br').forEach(el => el.append(doc.createTextNode(' ')));
      block.text = textCopy.textContent?.replace(/\s+/g, ' ').trim() || '';
    }
    if (block.type === 'p' && chapter!.body.length === 1 && chapter!.body[0].type === 'chapter-title') block.type = 'first-p';
    chapter!.body.push(block);
  };
  const image = (img: HTMLImageElement) => {
    const source = img.getAttribute('src') || '';
    if (!/^data:image\/(png|jpe?g|gif|webp);base64,[a-z0-9+/=\r\n]+$/i.test(source)) {
      result.warnings.push('Imagen omitida: formato no compatible o recurso externo.');
      if (img.alt) add({ type: 'p', text: img.alt });
      return;
    }
    const key = 'img-' + crypto.randomUUID();
    result.assets[key] = source;
    add({ type: 'image', src: key, caption: img.alt || undefined });
  };
  const richBlock = (el: HTMLElement, type: string) => {
    const images = Array.from(el.querySelectorAll('img'));
    if (!images.length) { add({ type, text: el.textContent?.trim() || '', html: el.innerHTML }); return; }
    if (type === 'table' || type.startsWith('list-')) {
      // Keep list/table semantics; store embedded images as adjacent image blocks.
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('img').forEach(img => img.replaceWith(doc.createTextNode(img.alt || '')));
      add({ type, html: type === 'table' ? clone.outerHTML : clone.innerHTML });
      images.forEach(image);
      result.warnings.push('Las imágenes de listas o tablas se colocaron después del bloque.');
      return;
    }
    const range = doc.createRange();
    range.setStart(el, 0);
    for (const img of images) {
      range.setEndBefore(img);
      const wrapper = doc.createElement('div');
      wrapper.append(range.cloneContents());
      if (wrapper.textContent?.trim() || wrapper.querySelector('br')) add({ type, html: wrapper.innerHTML });
      image(img);
      range.setStartAfter(img);
    }
    range.setEnd(el, el.childNodes.length);
    const wrapper = doc.createElement('div');
    wrapper.append(range.cloneContents());
    if (wrapper.textContent?.trim() || wrapper.querySelector('br')) add({ type, html: wrapper.innerHTML });
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) add({ type: 'p', text: node.textContent.trim() });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const text = el.textContent?.trim() || '';
    if (['script', 'style'].includes(tag)) return;
    if (!text && !el.querySelector('img,br') && !['img', 'br'].includes(tag)) return;
    const plainChapterTitle = tag === 'p' && /^(?:cap[ií]tulo|chapter)\s+(?:\d+|[ivxlcdm]+)(?:\s*[:.—-]?\s+.{1,160})?$/i.test(text);
    if (tag === chapterHeading || plainChapterTitle) {
      startChapter(text);
      richBlock(el, 'chapter-title');
    } else if (/^h[1-6]$/.test(tag)) {
      richBlock(el, tag === 'h2' ? 'h2' : 'h3');
    } else if (tag === 'img') image(el as HTMLImageElement);
    else if (tag === 'p' || tag === 'blockquote') richBlock(el, tag);
    else if (tag === 'ul' || tag === 'ol') richBlock(el, tag === 'ul' ? 'list-unordered' : 'list-ordered');
    else if (tag === 'table') {
      const clone = el.cloneNode(true) as HTMLElement;
      if (!el.querySelector('img')) add({ type: 'table', html: clone.outerHTML });
      else richBlock(el, 'table');
    } else if (tag === 'br') add({ type: 'p', html: '<br>', text: '' });
    else Array.from(el.childNodes).forEach(visit);
  };
  Array.from(doc.body.childNodes).forEach(visit);
  for (const ch of result.chapters) {
    ch.words = ch.body.reduce((sum, b) => sum + (b.text?.split(/\s+/).filter(Boolean).length || 0), 0);
    ch.readMin = Math.max(1, Math.ceil(ch.words / 200));
  }
  result.warnings = [...new Set(result.warnings)];
  return result;
}
