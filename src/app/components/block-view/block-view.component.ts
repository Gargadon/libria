import { Component, input, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Block, Chapter } from '../../models/book.models';
import { sceneBreakGlyph, imageTransform, escapeHtml } from '../../utils/block-maps';
import { BookStore } from '../../store/book.store';
import { AssetService } from '../../services/asset.service';
import { HyphenService } from '../../services/hyphen.service';

@Component({
  selector: 'app-block-view',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (block().type) {
      @case ('halftitle') { <h1 class="kp-halftitle"
        [style.font-family]="store.titleFontFamily()"
        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
        [style.text-align]="store.tweaks.titleAlignment()">{{ block().text }}</h1> }
      @case ('title') { <h1 class="kp-title"
        [style.font-family]="store.titleFontFamily()"
        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
        [style.text-align]="store.tweaks.titleAlignment()">{{ block().text }}</h1> }
      @case ('subtitle') { <div class="kp-sub">{{ block().text }}</div> }
      @case ('author') { <div class="kp-author">{{ block().text }}</div> }
      @case ('publisher') { <div class="kp-pub">{{ block().text }}</div> }
      @case ('dedication') {
        <div class="kp-ded">
          @for (line of (block().text ?? '').split('\\n'); track $index) {
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
        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ block().text }}</div> }
      @case ('chapter-title') { <h2 class="kp-chtitle"
        [style.font-family]="store.titleFontFamily()"
        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize())"
        [style.text-align]="store.tweaks.titleAlignment()"
        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ block().text }}</h2> }
      @case ('h1') { <h2 class="kp-h1"
        [style.font-family]="store.titleFontFamily()"
        [style.text-align]="store.tweaks.titleAlignment()"
        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ block().text }}</h2> }
      @case ('h2') { <h3 class="kp-h2"
        [style.font-family]="store.titleFontFamily()"
        [style.text-align]="store.tweaks.titleAlignment()"
        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ block().text }}</h3> }
      @case ('h3') { <h4 class="kp-h3"
        [style.font-family]="store.titleFontFamily()"
        [style.text-align]="store.tweaks.titleAlignment()"
        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'">{{ block().text }}</h4> }
      @case ('first-p') {
        <p class="kp-first" [class.has-dropcap]="store.tweaks.dropCap()">
          <span [innerHTML]="trustHtml(hyphenate(block()))"></span>
        </p>
      }
      @case ('p') {
        <p class="kp-p" [attr.lang]="store.domLang()">
          <span [innerHTML]="trustHtml(hyphenate(block()))"></span>
        </p>
      }
      @case ('blockquote') { <blockquote class="kp-quote">{{ block().text }}</blockquote> }
      @case ('epigraph') {
        <div class="kp-epigraph">
          <blockquote class="kp-epigraph__q">{{ block().text }}</blockquote>
          @if (block().attribution) { <cite class="kp-epigraph__att">— {{ block().attribution }}</cite> }
        </div>
      }
      @case ('verse') { <pre class="kp-verse"><code>{{ block().text }}</code></pre> }
      @case ('code') { <pre class="kp-code"><code>{{ block().text }}</code></pre> }
      @case ('scene-break') { <div class="kp-break">{{ sceneGlyph() }}</div> }
      @case ('page-break') { <div class="kp-page-break"><span></span></div> }
      @case ('image') {
        @let imgSrc = block().src ? assetService.assets()[block().src!] : null;
        @if (imgSrc) {
          <figure class="kp-image">
            <img [src]="imgSrc" alt=""
              [style.width.px]="block().width" [style.height.px]="block().height"
              [style.transform]="imgTransform()" style="max-width:100%;height:auto;display:block;margin:0 auto;">
            @if (block().caption) { <figcaption class="kp-image__cap">{{ block().caption }}</figcaption> }
          </figure>
        }
      }
      @case ('list-unordered') { <ul class="kp-list" [innerHTML]="safeHtml(block().html || block().text)"></ul> }
      @case ('list-ordered') { <ol class="kp-list" [innerHTML]="safeHtml(block().html || block().text)"></ol> }
      @case ('table') { <div class="kp-table-wrap" [innerHTML]="safeHtml(block().html || block().text)"></div> }
      @default { <div>[{{ block().type }}]</div> }
    }
  `,
})
export class BlockViewComponent {
  readonly block = input.required<Block>();
  readonly blockIndex = input<number>(0);

  readonly store = inject(BookStore);
  readonly assetService = inject(AssetService);
  readonly hyphenService = inject(HyphenService);
  readonly sanitizer = inject(DomSanitizer);

  private _safeHtmlCache = new Map<string, SafeHtml>();
  private _trustHtmlCache = new Map<string, SafeHtml>();

  readonly b = this.block;

  ptToPx(pt: number): number { return pt * 96 / 72; }

  readonly sceneGlyph = () => sceneBreakGlyph(this.store.tweaks.sceneBreakType());

  readonly imgTransform = () => {
    const b = this.block();
    return imageTransform(b.rotation, b.flipH, b.flipV);
  };

  hyphenate(b: Block): string {
    const raw = b.html || escapeHtml(b.text ?? '');
    if (b.type === 'first-p') {
      const text = (b.drop && !b.text?.startsWith(b.drop) ? b.drop : '') + b.text;
      return this.hyphenService.hyphenateHtml(b.html || escapeHtml(text));
    }
    return this.hyphenService.hyphenateHtml(raw);
  }

  safeHtml(html: string | undefined): SafeHtml | null {
    if (!html) return null;
    const cached = this._safeHtmlCache.get(html);
    if (cached !== undefined) return cached;
    const normalized = html.startsWith('<table') ? html : '<table>' + html + '</table>';
    const result = this.sanitizer.bypassSecurityTrustHtml(normalized);
    if (this._safeHtmlCache.size > 200) this._safeHtmlCache.clear();
    this._safeHtmlCache.set(html, result);
    return result;
  }

  trustHtml(html: string | undefined): SafeHtml | null {
    if (!html) return null;
    const cached = this._trustHtmlCache.get(html);
    if (cached !== undefined) return cached;
    const result = this.sanitizer.bypassSecurityTrustHtml(html);
    if (this._trustHtmlCache.size > 500) this._trustHtmlCache.clear();
    this._trustHtmlCache.set(html, result);
    return result;
  }
}
