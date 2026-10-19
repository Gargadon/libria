import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import JSZip from 'jszip';
import { TranslateService } from '@ngx-translate/core';
import { ExportService } from './export.service';
import { BookStore } from '../store/book.store';
import { AssetService } from './asset.service';
import { HyphenService } from './hyphen.service';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDPsAAAAASUVORK5CYII=';

describe('export format regression', () => {
  let store: InstanceType<typeof BookStore>;
  let service: ExportService;
  let saved: { filename: string; bytes: Uint8Array };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
    vi.stubGlobal('Blob', NodeBlob);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false })),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
        { provide: HyphenService, useValue: { hyphenateHtml: (html: string) => html } },
      ],
    });
    window.desktopAPI = {
      setSpellCheckerLanguage: vi.fn(async () => {}),
      saveExport: vi.fn(async (filename, bytes) => {
        saved = { filename, bytes };
      }),
      printFromHTML: vi.fn(async () => new Uint8Array([37, 80, 68, 70])),
    } as unknown as DesktopAPI;
    store = TestBed.inject(BookStore);
    store.createNewProject();
    store.loadDocument(
      {
        libriaVersion: '2.0.0',
        metadata: {
          ...store.book()!,
          title: 'Libro de prueba',
          author: 'Autora',
          authors: ['Autora'],
          isbn: '123',
          lang: 'es-MX',
        },
        preferences: { ...store.tweaks(), hyphenation: false },
        session: { lastActiveChapterId: 'one' },
        chapters: [
          {
            id: 'one',
            kind: 'chapter',
            title: 'Primero',
            number: 1,
            words: 10,
            forceOddPage: true,
            body: [
              { type: 'chapter-title', text: 'Primero' },
              {
                type: 'first-p',
                text: 'Texto con estilo',
                html: '<strong>Texto</strong> con <em>estilo</em>',
              },
              { type: 'p', text: 'Nota', html: 'Nota<sup data-fn="fn-one">[1]</sup>' },
              { type: 'scene-break' },
              { type: 'list-unordered', text: 'Uno Dos', html: '<li>Uno</li><li>Dos</li>' },
              { type: 'table', text: 'Celda', html: '<table><tr><td>Celda</td></tr></table>' },
              {
                type: 'image',
                src: 'img-test',
                width: 80,
                height: 80,
                caption: 'Imagen',
                rotation: 90,
                flipH: true,
              },
              { type: 'page-break' },
            ],
            footnotes: [{ id: 'fn-one', blockIndex: 2, content: 'Texto de nota' }],
          },
          {
            id: 'two',
            kind: 'chapter',
            title: 'Segundo',
            number: 2,
            words: 1,
            body: [{ type: 'p', text: 'Final' }],
          },
        ],
        assets: { 'img-test': png, cover: png },
      },
      TestBed.inject(AssetService),
    );
    service = TestBed.inject(ExportService);
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    delete window.desktopAPI;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps the print composition used by preview and PDF', () => {
    const html = service.buildPrintHtml(
      store.book(),
      store.chapters(),
      store.tweaks(),
      store.bookFontFamily(),
      store.titleFontFamily(),
      undefined,
      TestBed.inject(AssetService).getAll(),
    );
    expect(html).toMatchSnapshot();
  });

  it.each(['epub', 'docx', 'odt'] as const)('keeps the %s archive contents', async (format) => {
    await {
      epub: () => service.exportEpub(),
      docx: () => service.exportDocx(),
      odt: () => service.exportOdt(),
    }[format]();
    expect(saved.filename).toBe(`Libro de prueba.${format}`);
    const zip = await JSZip.loadAsync(saved.bytes);
    const contents: Record<string, string> = {};
    for (const path of Object.keys(zip.files).sort()) {
      if (!zip.files[path].dir && /\.(?:xml|xhtml|opf|css)$/.test(path)) {
        contents[path] = (await zip.file(path)!.async('string')).replace(
          /rId[a-zA-Z0-9_-]+/g,
          'rId-STABLE',
        );
      }
    }
    expect(contents).toMatchSnapshot();
    expect(store.isExporting()).toBe(false);
  });

  it('sends the composed HTML and options to the native PDF engine', async () => {
    await service.exportPdf();
    expect(window.desktopAPI!.printFromHTML).toHaveBeenCalledWith(
      expect.stringContaining('Texto'),
      expect.objectContaining({ printBackground: true, displayHeaderFooter: false, author: 'Autora', title: 'Libro de prueba' }),
    );
    expect(saved.filename).toBe('Libro de prueba.pdf');
    expect([...saved.bytes]).toEqual([37, 80, 68, 70]);
    expect(store.isExporting()).toBe(false);
  });

  it('composes document choices for small caps and first-page furniture', () => {
    const compose = () => service.buildPrintHtml(store.book(), store.chapters(), store.tweaks(), store.bookFontFamily(), store.titleFontFamily());
    const original = compose();
    expect(original).toContain('font-variant: small-caps;');
    expect(original).toContain('@page :first');
    expect(original).toContain('.has-dropcap { display: flow-root; }');
    store.updateTweak('firstParagraphSmallCaps', false);
    store.updateTweak('hideFirstPageHeaderFooter', false);
    const changed = compose();
    expect(changed).toContain('font-variant: normal;');
    expect(changed).not.toContain('@page :first');
    expect(changed).toContain('content: counter(page)');
    // Loading an older document must restore its historical appearance,
    // rather than inheriting the previously opened document's switches.
    const legacyDocument = { libriaVersion: '2.1.0', metadata: store.book(), preferences: {}, chapters: store.chapters() };
    store.loadDocument(legacyDocument as any, TestBed.inject(AssetService));
    expect(store.tweaks.firstParagraphSmallCaps()).toBe(true);
    expect(store.tweaks.hideFirstPageHeaderFooter()).toBe(true);
  });

  it('passes all authors to PDF export and falls back to the legacy author field', async () => {
    store.updateBookMetadata({ authors: ['Autora', 'Coautor'] });
    await service.exportPdf();
    expect(window.desktopAPI!.printFromHTML).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ author: 'Autora, Coautor' }));
    expect(window.desktopAPI!.printFromHTML).toHaveBeenLastCalledWith(expect.stringContaining('<meta name="author" content="Autora, Coautor">'), expect.anything());
    store.updateBookMetadata({ authors: [], author: 'Autor antiguo' });
    await service.exportPdf();
    expect(window.desktopAPI!.printFromHTML).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ author: 'Autor antiguo' }));
    expect(window.desktopAPI!.printFromHTML).toHaveBeenLastCalledWith(expect.stringContaining('<meta name="author" content="Autor antiguo">'), expect.anything());
  });

  it('honors chapter selection', async () => {
    store.updateExportPrefs({ exportMode: 'selection', selectedChapterIds: ['two'] });
    await service.exportEpub();
    const zip = await JSZip.loadAsync(saved.bytes);
    expect(zip.file('OEBPS/chapters/one.xhtml')).toBeNull();
    expect(zip.file('OEBPS/chapters/two.xhtml')).not.toBeNull();
  });
});
