import { describe, expect, it } from 'vitest';
import { parseDocxHtml } from './docx-import';
import { blockToHtml } from './block-html';
import { Tweaks } from '../models/book.models';

describe('DOCX semantic import', () => {
  it('preserves formatting, links, headings, nested lists and tables through rendering', () => {
    const result = parseDocxHtml(`<h1>Uno</h1><p>Texto <strong>fuerte</strong> <em>cursiva</em> <u>subrayado</u> <a href="https://example.org">enlace</a></p>
      <h2>Sección</h2><ul><li>A<ul><li>B</li></ul></li></ul><ol><li>C</li></ol>
      <table><tr><th colspan="2">Título</th></tr><tr><td><em>Celda</em></td><td>2</td></tr></table><h1>Dos</h1><p>Final</p>`);
    expect(result.chapters).toHaveLength(2);
    const body = result.chapters[0].body;
    expect(body.map(b => b.type)).toEqual(['chapter-title', 'first-p', 'h2', 'list-unordered', 'list-ordered', 'table']);
    expect(body[1].html).toContain('<strong>fuerte</strong>');
    expect(body[1].html).toContain('<em>cursiva</em>');
    expect(body[1].html).toContain('href="https://example.org"');
    const rendered = body.map(b => blockToHtml(b, { tweaks: {} as Tweaks, assets: {} })).join('');
    expect(rendered).toContain('<li>A<ul><li>B</li></ul></li>');
    expect(rendered).toContain('colspan="2"');
    expect(rendered).toContain('<em>Celda</em>');
  });

  it('recognizes plain chapter labels without splitting ordinary chapter mentions', () => {
    const result = parseDocxHtml('<p>Capítulo 1</p><p>El capítulo anterior terminó.</p><p>Chapter 2: Return</p><p>Final</p>');
    expect(result.chapters.map(ch => ch.title)).toEqual(['Capítulo 1', 'Chapter 2: Return']);
    expect(result.chapters[0].body[1].text).toBe('El capítulo anterior terminó.');
  });

  it('extracts image-only paragraphs and keeps inline image order and surrounding formatting', () => {
    const src = 'data:image/png;base64,aGVsbG8=';
    const result = parseDocxHtml(`<p><img src="${src}"></p><p><strong>Antes<img src="${src}">Después</strong></p>`);
    const body = result.chapters[0].body;
    expect(body.map(b => b.type)).toEqual(['image', 'p', 'image', 'p']);
    expect(body[1].html).toBe('<strong>Antes</strong>');
    expect(body[3].html).toBe('<strong>Después</strong>');
    expect(Object.values(result.assets)).toEqual([src, src]);
  });

  it('converts footnote references to native notes and removes the definitions list', () => {
    const result = parseDocxHtml(`<h1>Uno</h1><p>Texto<sup><a href="#footnote-1" id="footnote-ref-1">1</a></sup></p>
      <ol><li id="footnote-1"><p>Contenido de nota <a href="#footnote-ref-1">↑</a></p></li></ol>`);
    const chapter = result.chapters[0];
    expect(chapter.body).toHaveLength(2);
    expect(chapter.footnotes).toHaveLength(1);
    expect(chapter.footnotes![0]).toMatchObject({ blockIndex: 1, content: 'Contenido de nota' });
    expect(chapter.body[1].html).toContain(`data-fn="${chapter.footnotes![0].id}"`);
  });

  it('sanitizes unsafe HTML and reports unsupported images without fetching them', () => {
    const result = parseDocxHtml('<p><a href="javascript:alert(1)">Texto</a><script>alert(1)</script></p><p><img src="https://example.org/x.png" alt="Descripción"></p>');
    expect(result.chapters[0].body[0].html).not.toContain('javascript:');
    expect(result.chapters[0].body[0].html).not.toContain('<script');
    expect(result.assets).toEqual({});
    expect(result.warnings).toHaveLength(1);
    expect(result.chapters[0].body[1].text).toBe('Descripción');
  });
});
