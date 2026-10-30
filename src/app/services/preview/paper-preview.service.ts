import { Injectable, inject, signal } from '@angular/core';
import type { CoreViewer } from '@vivliostyle/core';
import { Book, Chapter, Tweaks } from '../../models/book.models';
import { PrintHtmlService } from '../export/print-html.service';
import { ChapterPagination } from './chapter-pagination';

export interface PaperPreviewInput {
  book: Book;
  chapters: Chapter[];
  tweaks: Tweaks;
  bodyFont: string;
  titleFont: string;
  assets: Record<string, string>;
}

export interface PaperPage {
  chapterId: string | null;
  source: HTMLElement;
}

export interface PaperLayout {
  pages: PaperPage[];
  chapters: Record<string, { startPage: number; pages: number; hasBlankBefore: boolean }>;
  blockPages: Record<string, Record<number, number>>;
}

/** One persistent compositor, immutable cached chapter pages, one visible page.
 * It never changes the PDF export path, which still composes a whole book. */
@Injectable()
export class PaperPreviewService {
  private readonly html = inject(PrintHtmlService);
  private readonly cache = new ChapterPagination<HTMLElement>();
  readonly layout = signal<PaperLayout | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly stats = signal({ rendered: 0, reused: 0, fallback: false });
  private doc?: Document;
  private viewer?: CoreViewer;
  private fontsPromise?: Promise<string>;
  private fontsCss = '';
  private fontsStylesheetUrl = '';
  private pending?: PaperPreviewInput;
  private running = false;
  private generation = 0;
  private lifetime = 0;
  private cancelRender?: () => void;
  private pageIndex = 0;
  private displayed?: PaperPage;
  private blank?: { html: string; page: HTMLElement };
  private navigation?: (page: number) => void;

  async initialize(doc: Document, navigate: (page: number) => void): Promise<void> {
    this.detach();
    const lifetime = this.lifetime;
    this.doc = doc;
    this.navigation = navigate;
    const [coreModule, css] = await Promise.all([
      import('@vivliostyle/core'),
      (this.fontsPromise ??= this.loadFonts()),
    ]);
    if (lifetime !== this.lifetime) return;
    const core = (
      'default' in coreModule ? coreModule.default : coreModule
    ) as typeof import('@vivliostyle/core');
    this.fontsCss = css;
    if (css && !this.fontsStylesheetUrl) {
      this.fontsStylesheetUrl = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
    }
    if (css) {
      const style = doc.createElement('style');
      style.textContent = css;
      doc.head.appendChild(style);
    }
    this.viewer = new core.CoreViewer(
      {
        viewportElement: doc.getElementById('paper-worker')!,
        window: doc.defaultView!,
      },
      { renderAllPages: true, autoResize: false, fitToScreen: false, zoom: 1, allowScripts: false },
    );
    doc.addEventListener('click', (event) => {
      const anchor = (event.target as Element).closest?.('a');
      const target = anchor?.getAttribute('data-libria-chapter-target');
      const match = anchor?.getAttribute('href')?.match(/libria-chapter-(\d+)$/);
      const id = target ?? (match && this.latestInput?.chapters[Number(match[1]) - 1]?.id);
      if (!id) return;
      const start = this.layout()?.chapters[id]?.startPage;
      if (start !== undefined) {
        event.preventDefault();
        this.navigation?.(start - 1);
      }
    });
    this.displayed = undefined;
    this.showPage(this.pageIndex);
  }

  private async loadFonts(): Promise<string> {
    try {
      const css = window.desktopAPI
        ? await window.desktopAPI.getFontsCss()
        : await fetch(new URL('fonts.css', document.baseURI)).then((response) =>
            response.ok ? response.text() : '',
          );
      const base = new URL('fonts.css', document.baseURI);
      return css
        .replace(/font-display:\s*swap/g, 'font-display: block')
        .replace(
          /url\(\s*(?:(['"])(.*?)\1|([^)]*))\s*\)/g,
          (_match, _quote, quoted, raw) => `url("${new URL((quoted ?? raw).trim(), base).href}")`,
        );
    } catch {
      // The normal fonts.css link and installed system fonts remain available.
      return '';
    }
  }

  private latestInput?: PaperPreviewInput;
  update(input: PaperPreviewInput): void {
    this.latestInput = input;
    this.pending = input;
    this.generation++;
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    this.busy.set(true);
    try {
      while (this.pending && this.viewer) {
        const input = this.pending;
        this.pending = undefined;
        const generation = this.generation;
        const current = () => generation === this.generation && !!this.viewer;
        try {
          const layout = await this.compose(input, current);
          if (!current()) continue;
          this.error.set('');
          this.layout.set(layout);
          this.showPage(this.pageIndex);
        } catch (error) {
          if (!current() || (error as Error).name === 'AbortError') continue;
          console.error('Paper preview composition failed', error);
          this.error.set('No se pudo actualizar la vista previa.');
        }
      }
    } finally {
      this.running = false;
      this.busy.set(false);
    }
  }

  private async compose(input: PaperPreviewInput, current: () => boolean): Promise<PaperLayout> {
    const { book, chapters, tweaks, bodyFont, titleFont, assets } = input;
    const fontsHref = new URL('fonts.css', document.baseURI).href;
    const makeHtml = (
      selected: Chapter[],
      t = tweaks,
      starts?: Record<string, number>,
      index?: number,
    ) => {
      const html = this.html.buildPrintHtml(
        book,
        selected,
        t,
        bodyFont,
        titleFont,
        fontsHref,
        assets,
        starts,
        true,
        index === undefined ? undefined : { allChapters: chapters, chapterIndex: index },
      );
      // Desktop CSS embeds binary fonts. Share it once instead of retaining
      // a multi-megabyte copy inside every chapter's cache key.
      return this.fontsStylesheetUrl
        ? html.replace(`href="${fontsHref}"`, `href="${this.fontsStylesheetUrl}"`)
        : html;
    };
    if (!chapters.length) {
      const pages = await this.render(makeHtml([]), 1);
      return this.makeLayout(
        pages.map((source) => ({ chapterId: null, source })),
        {},
      );
    }
    let result;
    try {
      result = await this.cache.compose(
        chapters.map((chapter, index) => ({
          id: chapter.id,
          forceOddPage: index > 0 && chapter.forceOddPage,
          isContents: chapter.templateId === 'toc',
          html: (starts) =>
            makeHtml(
              [chapter],
              index === 0 ? tweaks : { ...tweaks, hideFirstPageHeaderFooter: false },
              starts,
              index,
            ),
        })),
        (html, parity) => this.render(html, parity),
        current,
      );
    } catch (error) {
      if (!current() || (error as Error).message !== 'Contents pagination did not converge')
        throw error;
      // Rare cyclic contents layouts use the authoritative full-book engine.
      const sources = await this.render(makeHtml(chapters), 1);
      const placements: PaperLayout['chapters'] = {};
      const pages = sources.map((source, index) => {
        const first = source.querySelector<HTMLElement>('[data-id]')?.dataset['id'];
        if (first && !placements[first])
          placements[first] = { startPage: index + 1, pages: 0, hasBlankBefore: false };
        return { source, chapterId: first ?? null };
      });
      const starts = Object.entries(placements);
      starts.forEach(([id, placement], index) => {
        placement.pages =
          (starts[index + 1]?.[1].startPage ?? pages.length + 1) - placement.startPage;
      });
      this.stats.set({ rendered: 1, reused: 0, fallback: true });
      return this.makeLayout(pages, placements);
    }
    const pages: PaperPage[] = [];
    const placements: PaperLayout['chapters'] = {};
    for (const chapter of result.chapters) {
      if (!current()) throw new DOMException('Superseded composition', 'AbortError');
      if (chapter.hasBlankBefore) {
        const html = makeHtml([], { ...tweaks, hideFirstPageHeaderFooter: false });
        if (!this.blank || this.blank.html !== html)
          this.blank = { html, page: (await this.render(html, 2))[0] };
        pages.push({ chapterId: null, source: this.blank.page });
      }
      placements[chapter.id] = {
        startPage: chapter.startPage,
        pages: chapter.pages.length,
        hasBlankBefore: chapter.hasBlankBefore,
      };
      pages.push(...chapter.pages.map((source) => ({ chapterId: chapter.id, source })));
    }
    this.stats.set({ rendered: result.rendered, reused: result.reused, fallback: false });
    return this.makeLayout(pages, placements);
  }

  private makeLayout(pages: PaperPage[], chapters: PaperLayout['chapters']): PaperLayout {
    const blockPages: PaperLayout['blockPages'] = {};
    for (const [page, entry] of pages.entries()) {
      entry.source.querySelectorAll<HTMLElement>('[data-libria-block]').forEach((block) => {
        const [chapterIndex, blockIndex] = block.dataset['libriaBlock']!.split(':').map(Number);
        const id = this.latestInput?.chapters[chapterIndex]?.id;
        if (id) (blockPages[id] ??= {})[blockIndex] ??= page;
      });
    }
    return { pages, chapters, blockPages };
  }

  private render(html: string, parity: number): Promise<HTMLElement[]> {
    const viewer = this.viewer!;
    const doc = this.doc!;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    return new Promise((resolve, reject) => {
      const clean = () => {
        clearTimeout(timeout);
        viewer.removeListener('readystatechange', done);
        viewer.removeListener('error', failed);
        this.cancelRender = undefined;
        URL.revokeObjectURL(url);
      };
      const failed = (error: unknown) => {
        clean();
        reject(error);
      };
      const done = () => {
        if (viewer.readyState !== 'complete') return;
        const pages = Array.from(
          doc
            .getElementById('paper-worker')!
            .querySelectorAll<HTMLElement>('[data-vivliostyle-page-container]'),
        ).map((page) => {
          // The cache belongs to the parent document, so closing the iframe
          // releases its compositor and styles instead of retaining its window.
          const snapshot = document.importNode(page, true);
          const computed = doc.defaultView!.getComputedStyle(page);
          for (const name of Array.from(computed))
            if (name.startsWith('--viv-'))
              snapshot.style.setProperty(name, computed.getPropertyValue(name));
          return snapshot;
        });
        clean();
        resolve(pages);
      };
      const timeout = setTimeout(() => failed(new Error('Chapter composition timed out')), 60000);
      this.cancelRender = () => failed(new DOMException('Preview closed', 'AbortError'));
      viewer.addListener('readystatechange', done);
      viewer.addListener('error', failed);
      try {
        viewer.loadDocument({ url, startPage: parity });
      } catch (error) {
        failed(error);
      }
    });
  }

  showPage(index: number): void {
    this.pageIndex = index;
    const page = this.layout()?.pages[index];
    const display = this.doc?.getElementById('paper-display');
    if (!display || !page) return;
    if (page === this.displayed) return;
    const copy = this.doc!.importNode(page.source, true);
    copy.style.display = 'block';
    copy.style.visibility = 'visible';
    copy.setAttribute('data-libria-global-page', String(index + 1));
    copy.querySelectorAll('[data-vivliostyle-page-counter]').forEach((counter) => {
      counter.textContent = String(index + 1);
    });
    display.replaceChildren(copy);
    this.displayed = page;
    if (this.latestInput?.book.lang) display.lang = this.latestInput.book.lang;
  }

  detach(): void {
    this.generation++;
    this.lifetime++;
    this.pending = undefined;
    this.cancelRender?.();
    this.viewer = undefined;
    this.doc = undefined;
    this.displayed = undefined;
  }

  suspend(): void {
    this.generation++;
    this.pending = undefined;
  }

  destroy(): void {
    this.detach();
    this.cache.clear();
    this.blank = undefined;
    this.layout.set(null);
    if (this.fontsStylesheetUrl) URL.revokeObjectURL(this.fontsStylesheetUrl);
    this.fontsStylesheetUrl = '';
  }
}
