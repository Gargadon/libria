import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { Chapter, tocEntries } from '../../models/book.models';
import { PrintHtmlService } from './print-html.service';
import { HyphenService } from '../hyphen.service';

const chapters: Chapter[] = [
  { id: 'front', kind: 'front', title: 'Créditos', words: 0, body: [] },
  { id: 'toc', kind: 'front', title: 'Contenido', templateId: 'toc', words: 0, body: [] },
  { id: 'body', kind: 'chapter', title: 'Capítulo largo', number: 1, words: 0, body: [] },
  { id: 'back', kind: 'back', title: 'Apéndice', words: 0, body: [] },
];

describe('table of contents options', () => {
  it('preserves existing books and excludes only the selected matter', () => {
    expect(tocEntries(chapters).map(c => c.id)).toEqual(['front', 'body', 'back']);
    expect(tocEntries(chapters, { includeFrontMatter: false }).map(c => c.id)).toEqual(['body', 'back']);
    expect(tocEntries(chapters, { includeBackMatter: false }).map(c => c.id)).toEqual(['front', 'body']);
  });

  it('starts printed folios at the body and leaves preliminary index entries unnumbered', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: HyphenService, useValue: { hyphenateHtml: (html: string) => html } },
    ] });
    const html = TestBed.inject(PrintHtmlService).buildPrintHtml(
      { paperSize: '5x8' }, chapters, { pageNumberingStart: 'body', showPageNumbers: true, pageNumberPosition: 'bottom-center' },
      'serif', 'serif', 'https://libria.test/fonts.css', {}, { front: 1, toc: 2, body: 5, back: 9 }, true,
      { allChapters: chapters, chapterIndex: 0 },
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(html).toContain('counter(libria-folio)');
    expect(doc.querySelector('[data-id="front"]')?.getAttribute('style')).toContain('libria-front');
    expect(doc.querySelector('[data-libria-chapter-target="body"]')?.getAttribute('data-libria-page')).toBe('1');
    expect(doc.querySelector('[data-libria-chapter-target="back"]')?.getAttribute('data-libria-page')).toBe('5');
    expect(doc.querySelector('[data-libria-chapter-target="front"]')?.classList.contains('kp-toc-link--no-pages')).toBe(true);
    TestBed.resetTestingModule();
  });

  it('applies filters and number visibility to paper output without removing book chapters', () => {
    TestBed.configureTestingModule({ providers: [
      { provide: HyphenService, useValue: { hyphenateHtml: (html: string) => html } },
    ] });
    const configured = chapters.map(c => c.templateId === 'toc' ? { ...c, tocOptions: {
      includeFrontMatter: false, includeBackMatter: false,
      showChapterNumbers: false, showPageNumbers: false,
    } } : c);
    const html = TestBed.inject(PrintHtmlService).buildPrintHtml(
      { paperSize: '5x8' }, configured, {}, 'serif', 'serif', 'https://libria.test/fonts.css', {}, { body: 3 },
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = doc.querySelectorAll('.kp-toc-link');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toBe('Capítulo largo');
    expect(links[0].classList.contains('kp-toc-link--no-pages')).toBe(true);
    expect(doc.querySelector('.kp-toc-num')).toBeNull();
    expect(doc.querySelector('.kp-toc-pg')).toBeNull();
    expect(doc.querySelectorAll('.ch').length).toBe(4);
    TestBed.resetTestingModule();
  });
});
