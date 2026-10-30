import { Component, inject, computed, signal, effect, untracked, ElementRef, ViewChild, OnDestroy, AfterViewInit, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { AssetService } from '../../services/asset.service';
import { CommonModule } from '@angular/common';
import { Chapter, sortFootnotesByPosition } from '../../models/book.models';
import { PrintHtmlService } from '../../services/export/print-html.service';
import { BlockViewComponent } from '../block-view/block-view.component';
import { PaperPreviewService, PaperLayout } from '../../services/preview/paper-preview.service';
import { EditorPositionService } from '../../services/editor-position.service';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, BlockViewComponent, TranslateModule],
  providers: [PaperPreviewService],
  styles: `
    .pv__paper-loading {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(255, 255, 255, .85);
      color: #333;
      font: 14px/1.5 var(--ui);
      pointer-events: none;
    }
    .pv__paper-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid #ddd;
      border-top-color: currentColor;
      border-radius: 50%;
      animation: paper-spin .8s linear infinite;
    }
    @keyframes paper-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .pv__paper-spinner { animation: none; }
    }
  `,
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
          <span>/ {{ paperLoading() && !paperPreview.layout() ? '…' : measuredTotalPages() }}</span>
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

          <!-- THE PAPEL: Cached Vivliostyle pages include
               mirrored margins, headers, footers and page numbers. -->
          <div class="print__page" *ngIf="mode() === 'print' || paperReady()"
            [style.display]="mode() === 'print' ? null : 'none'"
            [style.transform]="'scale(' + printZoom() + ')'"
            [style.transform-origin]="'top left'"
            [style.padding-top.px]="0"
            [style.padding-bottom.px]="0"
            [style.padding-left.px]="0"
            [style.padding-right.px]="0">
            <div class="print__content print__content--vivliostyle" style="position: relative; overflow: hidden;">
              <iframe #printIframe src="paper-preview.html" title="Vista previa de papel"
                [attr.aria-busy]="paperLoading()"
                scrolling="no"
                style="width:100%;height:100%;border:none;display:block;"
                (load)="onPrintFrameLoad()"
              ></iframe>
              @if (paperLoading()) {
                <div class="pv__paper-loading" role="status" aria-live="polite" aria-atomic="true">
                  <span class="pv__paper-spinner" aria-hidden="true"></span>
                  <span>{{ 'preview.loadingPaper' | translate }}</span>
                </div>
              }
              @if (paperPreview.error()) {
                <p role="alert" style="position:absolute;inset:16px;background:white;color:#333;padding:12px;">{{ paperPreview.error() }}</p>
              }
            </div>
          </div>
        </div>
      </div>

      <div class="pv__foot">
        <div class="pv__metric">
          <div class="pv__mN">{{ paperLoading() && !paperPreview.layout() ? '…' : measuredTotalPages() }}</div>
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
          [style.--drop-leading]="store.tweaks.lineHeight()"
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
            <app-block-view [block]="b" [blockIndex]="bIdx" [attr.data-preview-block]="bIdx" />
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
  private readonly editorPosition = inject(EditorPositionService);
  readonly assetService = inject(AssetService);
  readonly printHtml = inject(PrintHtmlService);
  readonly paperPreview = inject(PaperPreviewService);
  readonly paperReady = signal(false);
  readonly paperLoading = computed(() => this.mode() === 'print' && !this.paperPreview.error()
    && (!this.paperReady() || !this.paperPreview.layout() || this.paperPreview.busy()));
  private previousPaperLayout: PaperLayout | null = null;
  private lastPrintAnchor = '';
  readonly mode = signal<'kindle' | 'iphone' | 'print'>('kindle');

  private _chaptersDebounce: any = null;
  readonly chapters = signal<Chapter[]>([]);

  @ViewChild('kpFlow', { static: false }) kpFlowEl?: ElementRef<HTMLElement>;
  @ViewChild('pvStage', { static: false }) pvStageEl?: ElementRef<HTMLElement>;
  @ViewChild('printIframe', { static: false }) printIframeEl?: ElementRef<HTMLIFrameElement>;

  private resizeObserver?: ResizeObserver;
  private measureTimeout?: any;
  private printHtmlTimeout?: any;


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

    const paper = this.paperPreview.layout();
    if (mode === 'print' && paper) return { chapters: paper.chapters, total: paper.pages.length };

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
      const position = this.editorPosition.position();
      const mode = this.mode();
      const renderedChapters = this.chapters();
      this.realPageOffsets();
      this.printPageOffsets();
      untracked(() => {
        // Wait until the debounced preview content exists. Otherwise the
        // first run happens against an empty flow and leaves the preview on
        // page one when it is opened from a later chapter.
        if (!id || renderedChapters.length === 0) return;
        if (mode === 'print') {
          const anchor = `${id}:${position?.blockIndex ?? 0}`;
          if (anchor === this.lastPrintAnchor) return;
          this.lastPrintAnchor = anchor;
        } else this.lastPrintAnchor = '';
        this.navigateToChapter(id);
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

    effect(() => {
      const mode = this.mode();
      if (mode !== 'print') {
        untracked(() => {
          clearTimeout(this.printHtmlTimeout);
          if (this.paperReady()) this.paperPreview.suspend();
          else this.paperPreview.detach();
        });
        return;
      }
      const ready = this.paperReady();
      const book = this.store.book();
      const input = book && {
        book, chapters: this.store.chapters(), tweaks: this.store.tweaks(),
        bodyFont: this.store.bookFontFamily(), titleFont: this.store.titleFontFamily(),
        assets: this.assetService.assets(),
      };
      untracked(() => {
        clearTimeout(this.printHtmlTimeout);
        if (ready && input) this.printHtmlTimeout = setTimeout(() => this.paperPreview.update(input), 300);
      });
    });

    effect(() => {
      const layout = this.paperPreview.layout();
      const mode = this.mode();
      if (!layout || mode !== 'print') return;
      untracked(() => {
        const previous = this.previousPaperLayout;
        const oldIndex = this.globalPage();
        const oldPage = previous?.pages[oldIndex];
        const oldChapter = oldPage?.chapterId;
        let target = Math.min(oldIndex, Math.max(0, layout.pages.length - 1));
        if (oldChapter && previous?.chapters[oldChapter] && layout.chapters[oldChapter]) {
          const local = oldIndex - previous.chapters[oldChapter].startPage + 1;
          const next = layout.chapters[oldChapter];
          target = next.startPage - 1 + Math.min(local, next.pages - 1);
        }
        this.measuredTotalPages.set(Math.max(1, layout.pages.length));
        this.printPageOffsets.set(Object.fromEntries(Object.entries(layout.chapters).map(([id, chapter]) => [id, chapter.startPage - 1])));
        this.globalPage.set(target);
        this.previousPaperLayout = layout;
        if (!previous) this.navigateToChapter(this.store.activeChapterId());
        this.paperPreview.showPage(this.globalPage());
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
    clearTimeout(this._chaptersDebounce);
    this.paperPreview.destroy();
  }

  async onPrintFrameLoad() {
    const iframe = this.printIframeEl?.nativeElement;
    const doc = iframe?.contentDocument;
    if (!doc) return;
    try {
      await this.paperPreview.initialize(doc, page => {
        this.globalPage.set(page);
        this.paperPreview.showPage(page);
      });
      if (this.printIframeEl?.nativeElement === iframe && this.mode() === 'print') this.paperReady.set(true);
    } catch (error) {
      console.error('Paper compositor initialization failed', error);
      this.paperPreview.error.set('No se pudo cargar la vista previa.');
    }
  }

  private setPrintPage(page: number) { this.paperPreview.showPage(page); }

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
    this.navigateToChapter(this.store.activeChapterId());
  }

  navigateToChapter(chapterId: string): void {
    const position = this.editorPosition.position();
    const blockIndex = position?.chapterId === chapterId ? position.blockIndex : 0;
    const isPrint = this.mode() === 'print';
    if (isPrint) {
      const layout = this.paperPreview.layout();
      const target = layout?.blockPages[chapterId]?.[blockIndex]
        ?? ((layout?.chapters[chapterId]?.startPage ?? 1) - 1);
      this.globalPage.set(target);
      this.setPrintPage(target);
      return;
    }
    const flow = this.kpFlowEl?.nativeElement;
    const chapter = Array.from(flow?.querySelectorAll<HTMLElement>('[data-chapter]') ?? [])
      .find(el => el.dataset['chapter'] === chapterId);
    const block = chapter?.querySelector<HTMLElement>(`[data-preview-block="${blockIndex}"]`);
    if (flow && block) {
      const width = flow.clientWidth + (parseFloat(getComputedStyle(flow).columnGap) || 0);
      if (width > 0) {
        this.globalPage.set(Math.max(0, Math.floor((block.getBoundingClientRect().left - flow.getBoundingClientRect().left) / width)));
        return;
      }
    }
    const offsetMap = isPrint ? this.printPageOffsets() : this.realPageOffsets();
    const offset = offsetMap[chapterId];
    let target: number;
    if (offset !== undefined) {
      target = offset;
    } else {
      const startPage = this.bookLayout().chapters[chapterId]?.startPage ?? 1;
      target = startPage - 1;
    }
    this.globalPage.set(Math.max(0, target));
    if (isPrint) this.setPrintPage(target);
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
        this.setPrintPage(this.globalPage());
      } else {
        this.syncActiveChapter();
      }
    }
  }
  prevPage() {
    if (this.globalPage() > 0) {
      this.globalPage.update(p => p - 1);
      if (this.mode() === 'print') {
        this.setPrintPage(this.globalPage());
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
      this.setPrintPage(target);
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
