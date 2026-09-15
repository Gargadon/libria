import { Component, inject, computed, signal, effect, untracked, ElementRef, ViewChild, OnDestroy, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { AssetService } from '../../services/asset.service';
import { CommonModule } from '@angular/common';
import { Chapter, sortFootnotesByPosition } from '../../models/book.models';
import { ExportService } from '../../services/export.service';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { BlockViewComponent } from '../block-view/block-view.component';

@Component({
  selector: 'app-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, BlockViewComponent],
  template: `
    <style [innerHTML]="printStyles()"></style>

    <section class="pv" [class.app--sb-right]="store.tweaks.sidebar() === 'right'">
      <!-- PROFESSIONAL PDF GENERATOR (Hidden on screen, visible on print) -->
      @if (mode() === 'print') {
      <div class="print-generator" [style.--pw]="pageSize().w" [style.--ph]="pageSize().h">
        @for (chapter of chapters(); track chapter.id; let idx = $index) {
          @if (shouldInsertBlankPage(idx)) {
            <div class="print__page print__page--blank"></div>
          }
          <div class="print__page"
            [style.padding-top.mm]="store.tweaks.marginTop()"
            [style.padding-bottom.mm]="store.tweaks.marginBottom()"
            [style.padding-left.mm]="isChapterEven(idx) ? store.tweaks.marginOuter() : store.tweaks.marginInner()"
            [style.padding-right.mm]="isChapterEven(idx) ? store.tweaks.marginInner() : store.tweaks.marginOuter()">
            
            @let showHdr = store.tweaks.showHeader();
            @let showPN = store.tweaks.showPageNumbers();
            @let pnp = store.tweaks.pageNumberPosition();
            @let isEven = isChapterEven(idx);
            @if (showHdr || (showPN && pnp === 'top-edges')) {
              <div class="print__header"
                [class.print__header--edge-even]="showPN && pnp === 'top-edges' && isEven"
                [class.print__header--edge-odd]="showPN && pnp === 'top-edges' && !isEven">
                @if (showPN && pnp === 'top-edges') {
                  <span class="print__hdr-pagenum">{{ chapterStartPage(idx) }}</span>
                }
                @if (showHdr) {
                  <span class="print__hdr-text">{{ store.tweaks.headerText() || store.book()?.title }}</span>
                }
                @if (showPN && pnp === 'top-edges' && !isEven) {
                  <span class="print__hdr-pagenum">{{ chapterStartPage(idx) }}</span>
                }
              </div>
            }
            <div class="print__content">
                <ng-container *ngTemplateOutlet="contentTpl; context: { $implicit: chapter, showNotes: store.exportPrefs.includeNotes(), fsOverride: ptToPx(store.tweaks.fontSize()) }"></ng-container>
            </div>
            @if (showPN && pnp !== 'top-edges') {
              <div class="print__footer"
                [class.print__footer--edge-even]="pnp === 'bottom-edges' && isEven"
                [class.print__footer--edge-odd]="pnp === 'bottom-edges' && !isEven">
                <span>Pág. {{ chapterStartPage(idx) }}</span>
              </div>
            }
          </div>
        }
      </div>
      } <!-- end @if mode === 'print' for print-generator -->

      <div class="pv__head">
        <div class="pv__tabs">
          <button class="pv__tab" [class.pv__tab--on]="mode() === 'kindle'" (click)="mode.set('kindle')">Kindle</button>
          <button class="pv__tab" [class.pv__tab--on]="mode() === 'iphone'" (click)="mode.set('iphone')">iPhone</button>
          <button class="pv__tab" [class.pv__tab--on]="mode() === 'print'" (click)="mode.set('print')">Papel</button>
        </div>
        
        <div class="pv__zoom" *ngIf="mode() === 'print'">
          <button (click)="zoomOut()">－</button>
          <span (click)="resetZoom()" style="cursor:pointer" title="Reiniciar zoom">{{ (printZoom() * 100) | number:'1.0-0' }}%</span>
          <button (click)="zoomIn()">＋</button>

        </div>
        
        <div class="pv__zoom" *ngIf="mode() === 'kindle' || mode() === 'iphone'">
          <button (click)="decreaseFontSize()" style="font-size:12px;">A</button>
          <span (click)="resetFontSize()" style="cursor:pointer" title="Reiniciar tamaño">Aa</span>
          <button (click)="increaseFontSize()" style="font-size:16px;">A</button>
        </div>
      </div>

      <div class="pv__stage" #pvStage [style.align-items]="'center'">
        <button class="pv__nav-btn pv__nav-btn--left" (click)="prevPage()">‹</button>
        <button class="pv__nav-btn pv__nav-btn--right" (click)="nextPage()">›</button>

        <div class="pv__page-jump" role="group" aria-label="Ir a una página">
          <label for="pv-page-number">Página</label>
          <input id="pv-page-number" type="number" min="1" [max]="measuredTotalPages()"
                 [value]="globalPage() + 1"
                 (change)="goToPage($any($event.target).value)"
                 (keydown.enter)="goToPage($any($event.target).value)"
                 aria-label="Número de página">
          <span>/ {{ measuredTotalPages() }}</span>
        </div>

        <!-- DEVICE VIEWS (Kindle, iPhone, Papel Tab) -->
        <div [class]="mode()" [style.--pw]="pageSize().w" [style.--ph]="pageSize().h"
             [style.width.px]="mode() === 'print' ? toPixels(pageSize().w) * printZoom() : null"
             [style.height.px]="mode() === 'print' ? toPixels(pageSize().h) * printZoom() : null"
             [style.overflow]="mode() === 'print' ? 'hidden' : null">
          
          <div [class]="mode() + '__bezel'" *ngIf="mode() !== 'print'">
            <div [class]="mode() + '__screen'">
              @if (mode() === 'kindle') {
                <div class="kindle__statusbar">
                  <div class="kindle__bookname">{{ store.book()?.title }}</div>
                  <div class="kindle__icons">
                    <svg viewBox="0 0 24 12" width="22" height="10"><rect x="0.5" y="0.5" width="20" height="11" rx="1.5" fill="none" stroke="currentColor"/><rect x="21.5" y="3.5" width="2" height="5" fill="currentColor"/><rect x="2" y="2" width="13" height="8" fill="currentColor"/></svg>
                  </div>
                </div>
              } @else if (mode() === 'iphone') {
                <div class="iphone__notch"></div>
                <div class="iphone__statusbar">
                  <span>9:41</span>
                  <span>
                    <svg viewBox="0 0 24 24" width="14" height="14"><path d="M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z" fill="currentColor"/></svg>
                  </span>
                </div>
              }

              <ng-container *ngTemplateOutlet="paginatedTpl"></ng-container>

              @if (mode() === 'kindle') {
                <div class="kindle__footer">
                  <span>Pos. {{ globalPage() + 1 }}</span>
                  <div class="kindle__progress">
                    <span class="kindle__pfill" [style.width.%]="(globalPage() + 1) / (measuredTotalPages() || 1) * 100"></span>
                  </div>
                  <span>{{ ((globalPage() + 1) / (measuredTotalPages() || 1) * 100) | number:'1.0-0' }}%</span>
                </div>
              } @else if (mode() === 'iphone') {
                <div class="iphone__footer">Página {{ globalPage() + 1 }} de {{ measuredTotalPages() }}</div>
                <div class="iphone__homebar"></div>
              }
            </div>
            
            @if (mode() === 'kindle') {
              <div class="kindle__chinrow">
                <div class="kindle__pageBtn" (click)="prevPage()" style="cursor:pointer"></div>
                <div class="kindle__home"></div>
                <div class="kindle__pageBtn" (click)="nextPage()" style="cursor:pointer"></div>
              </div>
            }
          </div>

          <!-- THE PAPEL: Vivliostyle owns the complete page, including
               mirrored margins, headers, footers and page numbers. -->
          <div class="print__page" *ngIf="mode() === 'print'"
            [style.transform]="'scale(' + printZoom() + ')'"
            [style.transform-origin]="'top left'"
            [style.padding-top.px]="0"
            [style.padding-bottom.px]="0"
            [style.padding-left.px]="0"
            [style.padding-right.px]="0">
            <div class="print__content print__content--vivliostyle" style="position: relative; overflow: hidden;">
              <iframe *ngIf="vivliostyleViewerUrl()" #printIframe
                [src]="vivliostyleViewerUrl()"
                scrolling="no"
                style="width:100%;height:100%;border:none;display:block;"
                (load)="onVivliostyleLoad()"
              ></iframe>
            </div>
          </div>
        </div>
      </div>

      <div class="pv__foot">
        <div class="pv__metric">
          <div class="pv__mN">{{ measuredTotalPages() }}</div>
          <div class="pv__mL">páginas</div>
        </div>
        <div class="pv__metric">
          <div class="pv__mN">{{ store.book()?.paperSize || '5×8″' }}</div>
          <div class="pv__mL">formato</div>
        </div>
      </div>

      <!-- PAGINATED CONTENT TEMPLATE -->
      <ng-template #paginatedTpl>
        <div [class]="mode() === 'print' ? 'pv-page-inner' : (mode() + '__page')">
          <div class="kp-wrapper" style="flex: 1; min-height: 0; position: relative;">
            <div class="kp-slider" [style.--page-index]="globalPage()">
              <div class="kp-flow" #kpFlow>
                @for (c of chapters(); track c.id; let idx = $index) {
                  @if (mode() === 'print' && shouldInsertBlankPage(idx)) {
                    <div class="kp kp--blank" style="break-before: column;"></div>
                  }
                  <div class="kp" [class]="'kp--' + c.kind" [attr.data-chapter]="c.id"
                       style="break-before: column;">
                    <ng-container *ngTemplateOutlet="contentTpl; context: { 
                      $implicit: c, 
                      showNotes: false,
                      fsOverride: ptToPx((mode() === 'kindle' || mode() === 'iphone') ? (store.tweaks.fontSize() + deviceFontSizeOffset()) : store.tweaks.fontSize())
                    }"></ng-container>
                  </div>
                }
              </div>
            </div>
          </div>
        </div>
      </ng-template>

      <!-- CHAPTER CONTENT RENDERER -->
      <ng-template #contentTpl let-chapter let-showNotes="showNotes" let-fsOverride="fsOverride">
        <div class="kp-content"
          [attr.lang]="store.domLang()"
          [style.font-family]="store.bookFontFamily()"
          [style.font-size.px]="fsOverride || store.tweaks.fontSize()"
          [style.line-height]="store.tweaks.lineHeight()"
          [style.--p-gap.px]="ptToPx(store.tweaks.paragraphSpacing())"
          [style.--indent-size]="store.tweaks.indentSize() + 'cm'"
          [style.--drop-lines]="store.tweaks.dropCapLines()"
          [class.kp--indent]="store.tweaks.indentFirstLine()"
          [class.kp--no-indent]="!store.tweaks.indentFirstLine()"
          [class.kp--justify]="store.tweaks.justifyText()"
          [class.kp-content--hyphen]="store.tweaks.hyphenation()">
          
          @if (chapter.templateId === 'toc') {
            <div class="kp-toc-wrap">
              <h2 class="kp-toc-heading" [style.font-family]="store.titleFontFamily()">{{ chapter.title }}</h2>
              <ol class="kp-toc-list">
                @for (c of tocChapters(); track c.id) {
                  <li class="kp-toc-li"
                      [class.kp-toc-li--front]="c.kind === 'front'"
                      [class.kp-toc-li--back]="c.kind === 'back'"
                      [class.kp-toc-li--link]="mode() !== 'print'"
                      (click)="navigateToChapter(c.id)">
                    @if (c.kind === 'chapter' && c.number != null) {
                      <span class="kp-toc-num">{{ c.number }}.</span>
                    }
                    <span class="kp-toc-title">{{ c.title }}</span>
                    @if (mode() === 'print') {
                      <span class="kp-toc-pg">{{ bookLayout().chapters[c.id]?.startPage }}</span>
                    }
                  </li>
                }
              </ol>
            </div>
          } @else {
          @for (b of chapter.body; track $index; let bIdx = $index) {
            <app-block-view [block]="b" [blockIndex]="bIdx" />
            @if (showNotes) {
              @for (n of blockNotes(chapter.id, bIdx); track n.id) {
                <span class="kp-note-ref">[*]</span>
              }
            }
          }
          }

          @if (showNotes) {
            @let cNotes = chapterNotes(chapter.id);
            @if (cNotes.length > 0) {
              <div class="kp-notes">
                <hr class="kp-notes-rule">
                @for (n of cNotes; track n.id) {
                  <div class="kp-note">
                    <p><strong>[*] {{ n.authorName }}:</strong> {{ n.content }}</p>
                  </div>
                }
              </div>
            }
          }
          @let fns = sortFootnotesByPosition(chapter.footnotes, chapter.body);
          @if (fns.length) {
            <div class="kp-fnpanel">
              <hr class="kp-fnpanel-rule">
              @for (fn of fns; track fn.id; let fi = $index) {
                <div class="kp-fnpanel-item">
                  <span class="kp-fnpanel-num">{{ fi + 1 }}.</span>
                  <span class="kp-fnpanel-text">{{ fn.content }}</span>
                </div>
              }
            </div>
          }
        </div>
      </ng-template>

    </section>
  `,
})
export class PreviewComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(BookStore);
  readonly assetService = inject(AssetService);
  readonly exportService = inject(ExportService);
  readonly sanitizer = inject(DomSanitizer);
  readonly mode = signal<'kindle' | 'iphone' | 'print'>('kindle');

  private _chaptersDebounce: any = null;
  readonly chapters = signal<Chapter[]>([]);

  @ViewChild('kpFlow', { static: false }) kpFlowEl?: ElementRef<HTMLElement>;
  @ViewChild('pvStage', { static: false }) pvStageEl?: ElementRef<HTMLElement>;
  @ViewChild('printIframe', { static: false }) printIframeEl?: ElementRef<HTMLIFrameElement>;

  private resizeObserver?: ResizeObserver;
  private measureTimeout?: any;
  private printHtmlTimeout?: any;

  printIframeHtml = signal<SafeHtml>('');
  vivliostyleViewerUrl = signal<SafeResourceUrl>('');
  iframeContentHeight = signal(0);
  private vivliostyleObjectUrl = '';
  private vivliostyleMeasureTimeout?: any;
  private vivliostyleLoadGeneration = 0;

  measuredTotalPages = signal(1);
  realPageOffsets = signal<Record<string, number>>({});
  realChapterPages = signal<Record<string, number>>({});
  // Chapter start pages measured from the print iframe DOM (0-indexed column = page - 1)
  printPageOffsets = signal<Record<string, number>>({});

  readonly tocChapters = computed(() =>
    this.chapters().filter(c => c.templateId !== 'toc')
  );

  readonly bookLayout = computed(() => {
    const chapters = this.store.chapters();
    const mode = this.mode();

    // Print mode: use real DOM measurements when the print iframe has been rendered
    if (mode === 'print') {
      const printOffsets = this.printPageOffsets();
      if (Object.keys(printOffsets).length > 0) {
        const layout: Record<string, { startPage: number, pages: number, hasBlankBefore: boolean }> = {};
        for (let i = 0; i < chapters.length; i++) {
          const ch = chapters[i];
          const off = printOffsets[ch.id];
          if (off !== undefined) {
            const nextOff = i < chapters.length - 1 ? printOffsets[chapters[i + 1].id] : undefined;
            const pages = nextOff !== undefined
              ? Math.max(1, nextOff - off)
              : Math.max(1, this.measuredTotalPages() - off);
            layout[ch.id] = { startPage: off + 1, pages, hasBlankBefore: false };
          } else {
            const prevEnd = i > 0
              ? (layout[chapters[i - 1].id]?.startPage ?? 1) + (layout[chapters[i - 1].id]?.pages ?? 1)
              : 1;
            layout[ch.id] = { startPage: prevEnd, pages: this.estimateChapterPages(ch), hasBlankBefore: false };
          }
        }
        return { chapters: layout, total: this.measuredTotalPages() };
      }
    }

    // Kindle/iPhone or no print measurements yet — use realChapterPages + estimates
    const realPagesMap = mode !== 'print' ? this.realChapterPages() : {};
    const layout: Record<string, { startPage: number, pages: number, hasBlankBefore: boolean }> = {};
    let currentP = 1;

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const realPages = realPagesMap[ch.id];
      const pages = realPages !== undefined ? realPages : this.estimateChapterPages(ch);
      let blank = false;

      if (ch.forceOddPage && currentP % 2 === 0) {
        blank = true;
        currentP++;
      }

      layout[ch.id] = { startPage: currentP, pages, hasBlankBefore: blank };
      currentP += pages;
    }
    return { chapters: layout, total: currentP - 1 };
  });

  readonly pageSize = computed(() => {
    const s = this.store.pageSize().split(' ');
    return { w: s[0], h: s[1] };
  });

  readonly chapterNotes = (id: string) => this.store.notes().filter(n => n.chapterId === id);
  readonly blockNotes = (id: string, idx: number) => this.store.notes().filter(n => n.chapterId === id && n.blockIndex === idx);
  readonly sortFootnotesByPosition = sortFootnotesByPosition;

  readonly printStyles = computed(() => {
    const size = this.store.pageSize();
    const t = this.store.tweaks;
    // @page rules must be at the top level — wrapping them in @media print
    // is invalid per CSS spec and Chromium may ignore them.
    return `
      @page {
        size: ${size};
        margin-top: ${t.marginTop()}mm;
        margin-bottom: ${t.marginBottom()}mm;
      }
      @page :left {
        margin-left: ${t.marginOuter()}mm;
        margin-right: ${t.marginInner()}mm;
      }
      @page :right {
        margin-left: ${t.marginInner()}mm;
        margin-right: ${t.marginOuter()}mm;
      }
    `;
  });

  printZoom = signal(0.8);
  deviceFontSizeOffset = signal(0);

  zoomIn() { this.printZoom.update(z => Math.min(z + 0.1, 2)); }
  zoomOut() { this.printZoom.update(z => Math.max(z - 0.1, 0.3)); }
  resetZoom() { this.autoZoom(); }

  increaseFontSize() { this.deviceFontSizeOffset.update(v => v + 1); }
  decreaseFontSize() { this.deviceFontSizeOffset.update(v => v - 1); }
  resetFontSize() { this.deviceFontSizeOffset.set(0); }

  constructor() {
    effect(() => {
      const id = this.store.activeChapterId();
      const m = this.mode();
      untracked(() => {
        // Sync Preview globalPage when ActiveChapterId changes externally
        const realOffset = this.realPageOffsets()[id];
        if (realOffset !== undefined) {
          this.globalPage.set(realOffset);
        } else {
          // If not measured yet (e.g. new chapter), use layout estimation
          const layout = this.bookLayout().chapters[id];
          if (layout) {
            this.globalPage.set(layout.startPage - 1);
          }
        }
      });
    });

    effect(() => {
      const nav = this.store.ui.activeNav();
      untracked(() => {
        if (nav === 'layout') this.mode.set('print');
        this.scheduleMeasure();
      });
    });

    effect(() => {
      const max = this.measuredTotalPages();
      if (this.globalPage() > max - 1 && max > 0) {
        untracked(() => this.globalPage.set(max - 1));
      }
    });

    effect(() => {
      this.chapters(); // debounced — not store.chapters() — avoids measureDOM on every keystroke
      this.store.tweaks();
      this.pageSize();
      this.mode();
      untracked(() => {
        this.scheduleMeasure();
      });
    });

    // Auto-zoom effect
    effect(() => {
      const m = this.mode();
      this.pageSize();
      untracked(() => {
        if (m === 'print') {
          setTimeout(() => this.autoZoom(), 50);
        }
      });
    });

    // Debounced chapters for preview (avoids re-render on every keystroke)
    effect(() => {
      const ch = this.store.chapters();
      untracked(() => {
        clearTimeout(this._chaptersDebounce);
        this._chaptersDebounce = setTimeout(() => this.chapters.set(ch), 200);
      });
    });

    // Print iframe HTML generation (debounced 300ms)
    effect(() => {
      const m = this.mode();
      if (m !== 'print') return;

      const book = this.store.book();
      const chapters = this.store.chapters();
      const t = this.store.tweaks();
      const bodyFont = this.store.bookFontFamily();
      const titleFont = this.store.titleFontFamily();
      const assets = this.assetService.getAll();

      if (!book) return;

      const layout = this.bookLayout();
      untracked(() => {
        clearTimeout(this.printHtmlTimeout);
        this.printHtmlTimeout = setTimeout(() => {
          const fontsHref = new URL('fonts.css', document.baseURI).href;
          const pageMap: Record<string, number> = {};
          for (const [id, info] of Object.entries(layout.chapters)) {
            pageMap[id] = info.startPage;
          }
          const html = this.exportService.buildPrintHtml(book, chapters, t, bodyFont, titleFont, fontsHref, assets, pageMap, true);
          const generation = ++this.vivliostyleLoadGeneration;
          clearTimeout(this.vivliostyleMeasureTimeout);
          const electronFontsCss = (window as any).electronAPI?.getFontsCss?.();
          const fontsCssPromise = electronFontsCss instanceof Promise
            ? electronFontsCss.catch(() => '')
            : fetch(fontsHref).then(response => response.ok ? response.text() : '').catch(() => '');
          fontsCssPromise.then((fontCss: string) => {
            if (generation !== this.vivliostyleLoadGeneration) return;
            const sourceHtml = fontCss
              ? html.replace('</head>', `<style id="libria-preview-fonts">${fontCss.replace(/font-display:\s*swap/g, 'font-display: block')}</style></head>`)
              : html;
            if (this.vivliostyleObjectUrl) URL.revokeObjectURL(this.vivliostyleObjectUrl);
            this.vivliostyleObjectUrl = URL.createObjectURL(new Blob([sourceHtml], { type: 'text/html' }));
            const viewerUrl = new URL('vivliostyle/index.html', document.baseURI);
            // Vivliostyle's viewer reads the hash parameters literally.
            viewerUrl.hash = `src=${this.vivliostyleObjectUrl}&bookMode=false&renderAllPages=true&spread=false`;
            this.vivliostyleViewerUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(viewerUrl.href));
          });
        }, 300);
      });
    });
  }

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleMeasure();
    });

    if (this.kpFlowEl) {
      this.resizeObserver.observe(this.kpFlowEl.nativeElement);
    }
    if (this.pvStageEl) {
      this.resizeObserver.observe(this.pvStageEl.nativeElement);
    }
  }

  ngOnDestroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    clearTimeout(this.measureTimeout);
    clearTimeout(this.printHtmlTimeout);
    clearTimeout(this.vivliostyleMeasureTimeout);
    if (this.vivliostyleObjectUrl) URL.revokeObjectURL(this.vivliostyleObjectUrl);
  }

  onVivliostyleLoad() {
    const iframe = this.printIframeEl?.nativeElement;
    if (!iframe?.contentDocument || !iframe?.contentWindow) return;
    const doc = iframe.contentDocument;
    let chromeStyle = doc.getElementById('libria-vivliostyle-preview-style');
    if (!chromeStyle) {
      chromeStyle = doc.createElement('style');
      chromeStyle.id = 'libria-vivliostyle-preview-style';
      chromeStyle.textContent = `
        /* Libria owns preview navigation; keep Vivliostyle's controls hidden. */
        #vivliostyle-menu-bar,
        #vivliostyle-page-slider-bar,
        #vivliostyle-page-navigation-up,
        #vivliostyle-page-navigation-down,
        #vivliostyle-page-navigation-left,
        #vivliostyle-page-navigation-right,
        #vivliostyle-welcome {
          display: none !important;
        }
        #vivliostyle-viewer-viewport {
          top: 0 !important;
          bottom: 0 !important;
          margin-top: 0 !important;
          margin-bottom: 0 !important;
        }
      `;
      doc.head.appendChild(chromeStyle);
    }
    const slider = doc.querySelector<HTMLInputElement>('#vivliostyle-page-slider');
    const total = Number(slider?.max || 1);
    this.measuredTotalPages.set(Math.max(1, total));
    this.globalPage.set(Math.max(0, Math.min(this.globalPage(), total - 1)));

    // A long document paginates asynchronously. Wait until the Viewer has
    // published its final page count instead of trusting the initial value 1.
    let attempts = 0;
    let stableCount = 0;
    let previousTotal = 0;
    const measure = () => {
      const currentIframe = this.printIframeEl?.nativeElement;
      const currentSlider = currentIframe?.contentDocument?.querySelector<HTMLInputElement>('#vivliostyle-page-slider');
      const currentTotal = Number(currentSlider?.max || 1);
      this.measuredTotalPages.set(Math.max(1, currentTotal));
      this.globalPage.set(Math.max(0, Math.min(this.globalPage(), currentTotal - 1)));
      stableCount = currentTotal === previousTotal ? stableCount + 1 : 0;
      previousTotal = currentTotal;
      // The Viewer first exposes a partial count (often 16) while it is still
      // composing. Keep polling until the count has stabilized or the safety
      // limit is reached.
      // Keep the initial partial value (commonly 16) from becoming the final
      // value. Large books may take several seconds to finish composition.
      if ((stableCount < 12 || attempts < 20) && attempts++ < 80) {
        this.vivliostyleMeasureTimeout = setTimeout(measure, 250);
      }
    };
    clearTimeout(this.vivliostyleMeasureTimeout);
    this.vivliostyleMeasureTimeout = setTimeout(measure, 250);
  }

  private navigateVivliostyle(direction: 'next' | 'previous') {
    const iframe = this.printIframeEl?.nativeElement;
    if (!iframe?.contentDocument) return;
    const selector = direction === 'next'
      ? '#vivliostyle-page-navigation-right'
      : '#vivliostyle-page-navigation-left';
    (iframe.contentDocument.querySelector(selector) as HTMLElement | null)?.click();
  }

  public toPixels(value: string): number {
    const num = parseFloat(value);
    const unit = value.replace(/[0-9.]/g, '');
    if (unit === 'in') return num * 96;
    if (unit === 'mm') return (num * 96) / 25.4;
    return num;
  }

  autoZoom() {
    if (this.mode() !== 'print' || !this.pvStageEl) return;

    const stage = this.pvStageEl.nativeElement;
    const availW = stage.clientWidth - 60; // padding
    const availH = stage.clientHeight - 60;

    if (availW <= 0 || availH <= 0) return;

    const pageW = this.toPixels(this.pageSize().w);
    const pageH = this.toPixels(this.pageSize().h);

    const zoom = Math.min(availW / pageW, availH / pageH);
    this.printZoom.set(Math.floor(zoom * 100) / 100);
  }

  scheduleMeasure() {
    clearTimeout(this.measureTimeout);
    this.measureTimeout = setTimeout(() => {
      if (!this.kpFlowEl) {
        const el = document.querySelector('.kp-flow') as HTMLElement;
        if (el) {
          this.kpFlowEl = new ElementRef(el);
          this.resizeObserver?.observe(el);
        }
      }
      this.measureDOM();
      // Second pass to ensure everything settled
      setTimeout(() => this.measureDOM(), 300);
    }, 150);
  }


  measureDOM() {
    if (!this.kpFlowEl) return;
    const flow = this.kpFlowEl.nativeElement;
    const style = getComputedStyle(flow);
    const gap = parseFloat(style.columnGap) || 0;
    const cw = flow.clientWidth + gap;
    if (cw <= 0) return;

    const allKps = Array.from(flow.querySelectorAll('.kp')) as HTMLElement[];
    const chapterOffsets: Record<string, number> = {};
    const chapterPages: Record<string, number> = {};

    for (let i = 0; i < allKps.length; i++) {
      const el = allKps[i];
      const id = el.getAttribute('data-chapter');
      if (id) {
        const left = el.offsetLeft - flow.offsetLeft;
        const currentOffset = Math.round(left / cw);
        chapterOffsets[id] = currentOffset;

        // Determine pages occupied by this chapter by looking at the next element (chapter or blank)
        const nextEl = allKps[i + 1];
        let nextOffset: number;
        if (nextEl) {
          nextOffset = Math.round((nextEl.offsetLeft - flow.offsetLeft) / cw);
        } else {
          nextOffset = Math.round(flow.scrollWidth / cw);
        }

        chapterPages[id] = Math.max(1, nextOffset - currentOffset);
      }
    }

    const prevOffsets = this.realPageOffsets();
    const offsetsChanged =
      Object.keys(chapterOffsets).length !== Object.keys(prevOffsets).length ||
      Object.keys(chapterOffsets).some(k => chapterOffsets[k] !== prevOffsets[k]);
    if (offsetsChanged) {
      this.realPageOffsets.set(chapterOffsets);
      this.realChapterPages.set(chapterPages);
    }
    this.measuredTotalPages.set(Math.max(1, Math.ceil(flow.scrollWidth / cw)));
  }

  navigateToChapter(chapterId: string): void {
    if (this.mode() === 'print') return;
    const offset = this.realPageOffsets()[chapterId];
    if (offset !== undefined) {
      this.globalPage.set(offset);
    } else {
      const startPage = this.bookLayout().chapters[chapterId]?.startPage ?? 1;
      this.globalPage.set(startPage - 1);
    }
  }

  isEvenPage() { return (this.globalPage() + 1) % 2 === 0; }

  private estimateChapterPages(c: Chapter): number {
    const m = this.mode();
    const paperSize = this.store.book()?.paperSize || '5x8';
    const fs = this.store.tweaks.fontSize();

    let wpp: number;
    if (m === 'kindle' || m === 'iphone') {
      const wppBase = m === 'kindle' ? 180 : 140;
      const deviceFs = fs + this.deviceFontSizeOffset();
      wpp = wppBase * (12 / deviceFs);
    } else {
      // Print: compute wpp from actual page geometry
      const pageDimMap: Record<string, [number, number]> = {
        '5x8': [5, 8], '6x9': [6, 9], 'A5': [5.83, 8.27],
        'A4': [8.27, 11.69], 'A6': [4.13, 5.83], 'Letter': [8.5, 11]
      };
      const [pw, ph] = pageDimMap[paperSize] ?? [5, 8];
      const t = this.store.tweaks;
      const textW = pw - (t.marginInner() + t.marginOuter()) / 25.4;
      const textH = ph - (t.marginTop() + t.marginBottom()) / 25.4;
      const lineHeightIn = (fs * t.lineHeight()) / 72;
      const linesPerPage = Math.floor(textH / lineHeightIn);
      // ~10 chars/inch at 12pt for serif fonts (Lora/Spectral); scales inversely with font size
      const charsPerLine = textW * (10 * (12 / fs));
      wpp = Math.max(30, (charsPerLine / 5.5) * linesPerPage);
    }

    const wordPages = Math.ceil((c.words || 1) / wpp);
    const pageBreaks = c.body.filter(b => b.type === 'page-break').length;
    return Math.max(1, wordPages, pageBreaks + 1);
  }

  shouldInsertBlankPage(chapterIdx: number): boolean {
    const ch = this.chapters()[chapterIdx];
    if (!ch) return false;
    return this.bookLayout().chapters[ch.id]?.hasBlankBefore || false;
  }

  isChapterEven(chapterIdx: number): boolean {
    const ch = this.chapters()[chapterIdx];
    if (!ch) return false;

    // Prefer real measurement if available
    const offset = this.realPageOffsets()[ch.id];
    if (offset !== undefined) {
      return (offset + 1) % 2 === 0;
    }

    return this.bookLayout().chapters[ch.id]?.startPage % 2 === 0;
  }

  chapterStartPage(chapterIdx: number): number {
    const ch = this.chapters()[chapterIdx];
    if (!ch) return 1;

    // Prefer real measurement if available
    const offset = this.realPageOffsets()[ch.id];
    if (offset !== undefined) {
      return offset + 1;
    }

    return this.bookLayout().chapters[ch?.id]?.startPage || 1;
  }

  globalPage = signal(0);
  nextPage() {
    const max = this.measuredTotalPages();
    if (this.globalPage() < max - 1) {
      this.globalPage.update(p => p + 1);
      if (this.mode() === 'print') {
        this.navigateVivliostyle('next');
      } else {
        this.syncActiveChapter();
      }
    }
  }
  prevPage() {
    if (this.globalPage() > 0) {
      this.globalPage.update(p => p - 1);
      if (this.mode() === 'print') {
        this.navigateVivliostyle('previous');
      } else {
        this.syncActiveChapter();
      }
    }
  }

  goToPage(value: string | number) {
    const requested = Number(value);
    if (!Number.isFinite(requested)) return;
    const page = Math.max(1, Math.min(this.measuredTotalPages(), Math.trunc(requested)));
    const target = page - 1;
    this.globalPage.set(target);
    if (this.mode() === 'print') {
      const slider = this.printIframeEl?.nativeElement.contentDocument
        ?.querySelector<HTMLInputElement>('#vivliostyle-page-slider');
      if (slider) {
        slider.value = String(target);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      this.syncActiveChapter();
    }
  }

  private syncActiveChapter() {
    const p = this.globalPage();
    const offsets = this.realPageOffsets();
    const chapters = this.store.chapters();

    let activeId = '';
    let maxStartCol = -1;

    // 1. Try real offsets first
    for (const [id, startCol] of Object.entries(offsets)) {
      if (startCol <= p && startCol > maxStartCol) {
        maxStartCol = startCol;
        activeId = id;
      }
    }

    // 2. Fallback to layout estimation if no real offset matches
    if (!activeId) {
      const layout = this.bookLayout().chapters;
      for (const id in layout) {
        const start = layout[id].startPage - 1;
        if (start <= p && start > maxStartCol) {
          maxStartCol = start;
          activeId = id;
        }
      }
    }

    if (activeId && this.store.activeChapterId() !== activeId) {
      untracked(() => this.store.setActiveChapter(activeId));
    }
  }

  ptToPx(pt: number): number { return pt * 96 / 72; }
}
