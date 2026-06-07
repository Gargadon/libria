import { Component, inject, computed, signal, effect, untracked, ElementRef, ViewChild, OnDestroy, AfterViewInit } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { CommonModule } from '@angular/common';
import { Chapter, Footnote, Block, sortFootnotesByPosition } from '../../models/book.models';
import { HyphenService } from '../../services/hyphen.service';
import { ExportService } from '../../services/export.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-preview',
  standalone: true,
  imports: [CommonModule],
  template: `
    <style [innerHTML]="printStyles()"></style>

    <section class="pv" [class.app--sb-right]="store.tweaks.sidebar() === 'right'">
      <!-- PROFESSIONAL PDF GENERATOR (Hidden on screen, visible on print) -->
      <div class="print-generator" [style.--pw]="pageSize().w" [style.--ph]="pageSize().h">
        @for (chapter of store.chapters(); track chapter.id; let idx = $index) {
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

          <!-- THE PAPEL (Single Page Preview) -->
          <div class="print__page" *ngIf="mode() === 'print'"
            [style.transform]="'scale(' + printZoom() + ')'"
            [style.transform-origin]="'top left'"
            [style.padding-top.px]="0"
            [style.padding-bottom.px]="0"
            [style.padding-left.mm]="isEvenPage() ? store.tweaks.marginOuter() : store.tweaks.marginInner()"
            [style.padding-right.mm]="isEvenPage() ? store.tweaks.marginInner() : store.tweaks.marginOuter()">

            @let showHdr2 = store.tweaks.showHeader();
            @let showPN2 = store.tweaks.showPageNumbers();
            @let pnp2 = store.tweaks.pageNumberPosition();
            @let isEven2 = isEvenPage();
            @if (showHdr2 || (showPN2 && pnp2 === 'top-edges')) {
              <div class="print__header"
                [style.height.mm]="store.tweaks.marginTop()"
                [class.print__header--edge-even]="showPN2 && pnp2 === 'top-edges' && isEven2"
                [class.print__header--edge-odd]="showPN2 && pnp2 === 'top-edges' && !isEven2"
                style="margin:0;flex-shrink:0;">
                @if (showPN2 && pnp2 === 'top-edges') {
                  <span class="print__hdr-pagenum">{{ globalPage() + 1 }}</span>
                }
                @if (showHdr2) {
                  <span class="print__hdr-text">{{ store.tweaks.headerText() || store.book()?.title }}</span>
                }
                @if (showPN2 && pnp2 === 'top-edges' && !isEven2) {
                  <span class="print__hdr-pagenum">{{ globalPage() + 1 }}</span>
                }
              </div>
            }

            <div class="print__content" style="flex: 1; position: relative; overflow: hidden;">
              <iframe #printIframe
                [srcdoc]="printIframeHtml()"
                scrolling="no"
                style="width:100%;height:100%;border:none;display:block;"
                (load)="onIframeLoad()"
              ></iframe>
            </div>

            @if (showPN2 && pnp2 !== 'top-edges') {
              <div class="print__footer"
                [style.height.mm]="store.tweaks.marginBottom()"
                [class.print__footer--edge-even]="pnp2 === 'bottom-edges' && isEven2"
                [class.print__footer--edge-odd]="pnp2 === 'bottom-edges' && !isEven2"
                style="margin:0;flex-shrink:0;">
                <span>{{ globalPage() + 1 }}</span>
              </div>
            }
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
                @for (c of store.chapters(); track c.id; let idx = $index) {
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
          
          @for (b of chapter.body; track $index) {
            @let bIdx = $index;
            @switch (b.type) {
              @case ('halftitle') { <h1 class="kp-halftitle"
                [style.font-family]="store.titleFontFamily()"
                [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                [style.text-align]="store.tweaks.titleAlignment()">{{ b.text }}</h1> }
              @case ('title') { <h1 class="kp-title"
                [style.font-family]="store.titleFontFamily()"
                [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                [style.text-align]="store.tweaks.titleAlignment()">{{ b.text }}</h1> }
              @case ('subtitle') { <div class="kp-sub">{{ b.text }}</div> }
              @case ('author') { <div class="kp-author">{{ b.text }}</div> }
              @case ('publisher') { <div class="kp-pub">{{ b.text }}</div> }
              @case ('dedication') { 
                <div class="kp-ded">
                  @for (line of b.text?.split('\\n'); track $index) {
                    <div>{{ line }}</div>
                  }
                </div> 
              }
              @case ('chapter-num') { <div class="kp-chnum" 
                [style.font-family]="store.titleFontFamily()"
                [style.font-size.px]="ptToPx(store.tweaks.titleFontSize()) * 0.8"
                [style.text-align]="store.tweaks.titleAlignment()"
                [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ b.text }}</div> }
              @case ('chapter-title') { <h2 class="kp-chtitle" 
                [style.font-family]="store.titleFontFamily()"
                [style.font-size.px]="ptToPx(store.tweaks.titleFontSize())"
                [style.text-align]="store.tweaks.titleAlignment()"
                [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ b.text }}</h2> }
              @case ('h1') { <h2 class="kp-h1" 
                [style.font-family]="store.titleFontFamily()"
                [style.text-align]="store.tweaks.titleAlignment()"
                [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ b.text }}</h2> }
              @case ('first-p') { 
                <p class="kp-first" [attr.lang]="store.domLang()" [class.has-dropcap]="store.tweaks.dropCap()">
                  @if (b.html) {<span [innerHTML]="hyphenService.hyphenateHtml(b.html)"></span>} @else {<span [innerHTML]="hyphenService.hyphenateHtml((b.drop && !b.text?.startsWith(b.drop) ? b.drop : '') + b.text)"></span>} <ng-container *ngTemplateOutlet="noteRefTpl; context: { chapter, bIdx, showNotes }"></ng-container>
                </p> 
              }
              @case ('p') { <p class="kp-p" [attr.lang]="store.domLang()">@if (b.html) {<span [innerHTML]="hyphenService.hyphenateHtml(b.html)"></span>} @else {<span [innerHTML]="hyphenService.hyphenateHtml(b.text || '')"></span>} <ng-container *ngTemplateOutlet="noteRefTpl; context: { chapter, bIdx, showNotes }"></ng-container></p> }
              @case ('blockquote') { <blockquote class="kp-quote">@if (b.html) {<span [innerHTML]="b.html"></span>} @else {{{ b.text }}}</blockquote> }
              @case ('scene-break') { <div class="kp-break">{{ sceneBreakGlyph() }}</div> }
              @case ('page-break') { <div class="kp-page-break"><span></span></div> }
              @case ('image') {
                @if (b.src && store.assets()[b.src]) {
                  <figure class="kp-image"><img [src]="store.assets()[b.src]" alt="" style="max-width:100%;height:auto;display:block;margin:0 auto;"></figure>
                }
              }
              @case ('list-unordered') {
                <ul class="kp-list" [innerHTML]="b.html || b.text"></ul>
              }
              @case ('list-ordered') {
                <ol class="kp-list" [innerHTML]="b.html || b.text"></ol>
              }
              @case ('table') {
                <div class="kp-table-wrap" [innerHTML]="b.html || b.text"></div>
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

      <ng-template #noteRefTpl let-chapter="chapter" let-bIdx="bIdx" let-showNotes="showNotes">
        @if (showNotes) {
          @for (n of blockNotes(chapter.id, bIdx); track n.id) {
            <span class="kp-note-ref">[*]</span>
          }
        }
      </ng-template>
    </section>
  `,
})
export class PreviewComponent implements AfterViewInit, OnDestroy {
  readonly store = inject(BookStore);
  readonly hyphenService = inject(HyphenService);
  readonly exportService = inject(ExportService);
  readonly sanitizer = inject(DomSanitizer);
  readonly mode = signal<'kindle' | 'iphone' | 'print'>('kindle');
  readonly sortFootnotesByPosition = sortFootnotesByPosition;

  @ViewChild('kpFlow', { static: false }) kpFlowEl?: ElementRef<HTMLElement>;
  @ViewChild('pvStage', { static: false }) pvStageEl?: ElementRef<HTMLElement>;
  @ViewChild('printIframe', { static: false }) printIframeEl?: ElementRef<HTMLIFrameElement>;

  private resizeObserver?: ResizeObserver;
  private measureTimeout?: any;
  private printHtmlTimeout?: any;

  printIframeHtml = signal<SafeHtml>('');
  iframeContentHeight = signal(0);

  measuredTotalPages = signal(1);
  realPageOffsets = signal<Record<string, number>>({});
  realChapterPages = signal<Record<string, number>>({});

  readonly bookLayout = computed(() => {
    const chapters = this.store.chapters();
    const layout: Record<string, { startPage: number, pages: number, hasBlankBefore: boolean }> = {};
    let currentP = 1;

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const realPages = this.realChapterPages()[ch.id];
      const pages = realPages !== undefined ? realPages : this.estimateChapterPages(ch);
      let blank = false;

      // Force Odd: if current page is even (2, 4, 6...), add a blank
      if (ch.forceOddPage && currentP % 2 === 0) {
        blank = true;
        currentP++;
      }

      layout[ch.id] = {
        startPage: currentP,
        pages: pages,
        hasBlankBefore: blank
      };

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
      this.store.chapters();
      this.store.tweaks();
      this.pageSize();
      this.mode();
      untracked(() => {
        // Only clear if essential settings changed, otherwise just schedule
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

    // Print iframe HTML generation (debounced 300ms)
    effect(() => {
      const m = this.mode();
      if (m !== 'print') return;

      const book = this.store.book();
      const chapters = this.store.chapters();
      const t = this.store.tweaks();
      const bodyFont = this.store.bookFontFamily();
      const titleFont = this.store.titleFontFamily();
      const assets = this.store.assets();

      if (!book) return;

      untracked(() => {
        clearTimeout(this.printHtmlTimeout);
        this.printHtmlTimeout = setTimeout(() => {
          const fontsHref = new URL('fonts.css', document.baseURI).href;
          const html = this.exportService.buildPrintHtml(book, chapters, t, bodyFont, titleFont, fontsHref, assets);
          this.printIframeHtml.set(this.sanitizer.bypassSecurityTrustHtml(html));
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
  }

  onIframeLoad() {
    const iframe = this.printIframeEl?.nativeElement;
    if (!iframe?.contentDocument || !iframe?.contentWindow) return;

    const measure = () => {
      const flow = iframe.contentDocument?.querySelector('.pv-flow') as HTMLElement | null;
      if (!flow) return;
      const pageW = iframe.contentWindow!.innerWidth;
      if (pageW <= 0) return;
      this.fixRectoChapters(flow, pageW);
      const total = Math.max(1, Math.ceil(flow.scrollWidth / pageW));
      this.measuredTotalPages.set(total);
      this.scrollIframeToPage(this.globalPage());
    };

    measure();
    iframe.contentDocument.fonts?.ready.then(() => measure());
  }

  private fixRectoChapters(flow: HTMLElement, pageW: number) {
    // Remove previously auto-inserted blank pages
    Array.from(flow.querySelectorAll('.ch--auto-blank')).forEach(el => el.remove());

    // Process recto chapters in document order; accessing offsetLeft forces synchronous layout
    const rectoChapters = Array.from(flow.querySelectorAll('.ch--recto')) as HTMLElement[];
    for (const el of rectoChapters) {
      // Column 0 = page 1 (odd/recto), col 1 = page 2 (even/verso), etc.
      const col = Math.round((el.offsetLeft - flow.offsetLeft) / pageW);
      if (col % 2 !== 0) {
        const blank = flow.ownerDocument!.createElement('div');
        blank.className = 'ch ch--auto-blank';
        flow.insertBefore(blank, el);
      }
    }
  }

  private scrollIframeToPage(page: number) {
    const iframe = this.printIframeEl?.nativeElement;
    if (!iframe?.contentDocument) return;
    const slider = iframe.contentDocument.querySelector('.pv-slider') as HTMLElement | null;
    if (!slider) return;
    slider.style.setProperty('--pi', String(page));
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

    this.realPageOffsets.set(chapterOffsets);
    this.realChapterPages.set(chapterPages);
    this.measuredTotalPages.set(Math.max(1, Math.ceil(flow.scrollWidth / cw)));
  }

  readonly sceneBreakGlyph = computed(() => {
    const t = this.store.tweaks.sceneBreakType();
    return t === 'asterisks' ? '✦ ✦ ✦' : t === 'asterisks3' ? '* * *' : t === 'dots' ? '· · ·' : t === 'flourish' ? '— o —' : '';
  });

  isEvenPage() { return (this.globalPage() + 1) % 2 === 0; }

  private estimateChapterPages(c: Chapter): number {
    const m = this.mode();
    const paperSize = this.store.book()?.paperSize || '5x8';
    const wppBase = m === 'kindle' ? 180 : m === 'iphone' ? 140 :
      (paperSize === '6x9' ? 350 : (paperSize === 'A4' || paperSize === 'Letter') ? 500 : paperSize === 'A6' ? 150 : 250);
    const fs = (m === 'kindle' || m === 'iphone') ? (this.store.tweaks.fontSize() + this.deviceFontSizeOffset()) : this.store.tweaks.fontSize();
    const fsFactor = 12 / fs;
    const wpp = wppBase * fsFactor;
    const wordPages = Math.ceil((c.words || 1) / wpp);
    const pageBreaks = c.body.filter(b => b.type === 'page-break').length;
    return Math.max(1, wordPages, pageBreaks + 1);
  }

  shouldInsertBlankPage(chapterIdx: number): boolean {
    const ch = this.store.chapters()[chapterIdx];
    if (!ch) return false;
    return this.bookLayout().chapters[ch.id]?.hasBlankBefore || false;
  }

  isChapterEven(chapterIdx: number): boolean {
    const ch = this.store.chapters()[chapterIdx];
    if (!ch) return false;

    // Prefer real measurement if available
    const offset = this.realPageOffsets()[ch.id];
    if (offset !== undefined) {
      return (offset + 1) % 2 === 0;
    }

    return this.bookLayout().chapters[ch.id]?.startPage % 2 === 0;
  }

  chapterStartPage(chapterIdx: number): number {
    const ch = this.store.chapters()[chapterIdx];
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
        this.scrollIframeToPage(this.globalPage());
      } else {
        this.syncActiveChapter();
      }
    }
  }
  prevPage() {
    if (this.globalPage() > 0) {
      this.globalPage.update(p => p - 1);
      if (this.mode() === 'print') {
        this.scrollIframeToPage(this.globalPage());
      } else {
        this.syncActiveChapter();
      }
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
