import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { BookStore } from '../../store/book.store';
import type { Chapter } from '../../models/book.models';
import { PrintHtmlService } from '../export/print-html.service';
import { PaperPreviewService } from './paper-preview.service';

afterEach(() => TestBed.resetTestingModule());

it('reuses hyphenated chapter HTML and local block indexes at new book offsets', async () => {
  const buildPrintHtml = vi.fn((_book, [chapter]: Chapter[]) =>
    JSON.stringify([chapter.body.length, chapter.id]));
  TestBed.configureTestingModule({
    providers: [PaperPreviewService, { provide: PrintHtmlService, useValue: { buildPrintHtml } }],
  });
  const store = TestBed.inject(BookStore);
  const preview = TestBed.inject(PaperPreviewService);
  store.createNewProject();

  const first: Chapter = { id: 'a', title: 'A', kind: 'chapter', words: 1, body: [{ type: 'p', text: 'A' }] };
  const second: Chapter = { ...first, id: 'b', title: 'B' };
  const input = {
    book: store.book()!, chapters: [first, second], tweaks: store.tweaks(),
    bodyFont: 'Spectral', titleFont: 'Spectral', assets: {}, hyphenationContext: 'es:1',
  };
  expect(input.tweaks.hyphenation).toBe(true);

  preview['render'] = vi.fn(async (html: string) => {
    const [length, id] = JSON.parse(html);
    return Array.from({ length }, () => {
      const page = document.createElement('div');
      page.innerHTML = `<p data-libria-block="${id === 'a' ? 0 : 1}:0"></p>`;
      return page;
    });
  });

  const original = await preview['compose'](input, () => true);
  const cachedPage = vi.spyOn(original.pages[1].source, 'querySelectorAll');
  buildPrintHtml.mockClear();
  const longer = { ...first, body: [...first.body, ...first.body, ...first.body] };
  const updated = { ...input, chapters: [longer, second] };
  const next = await preview['compose'](updated, () => true);

  expect(buildPrintHtml).toHaveBeenCalledTimes(1);
  expect(cachedPage).not.toHaveBeenCalled();
  expect(next.blockPages['b']).toEqual({ offset: 3, pages: { 0: 0 } });
  expect(next.blockPages['b'].pages).toBe(original.blockPages['b'].pages);

  buildPrintHtml.mockClear();
  await preview['compose']({ ...updated, hyphenationContext: 'es:2' }, () => true);
  expect(buildPrintHtml).toHaveBeenCalledTimes(2);
});
