import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';
import { Misspelling } from '../../models/book.models';

@Directive({
  selector: '[appContenteditable]',
  standalone: true,
})
export class ContenteditableDirective implements OnInit, OnChanges {
  @Input('appContenteditable') model?: string;
  @Input() contenteditableHtml?: string;
  @Input() spellErrors?: Misspelling[];

  private currentText = '';

  constructor(private elRef: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const el = this.elRef.nativeElement;
    if (el.textContent === '') {
      this.writeContent(el);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    const contentChanged = !!(changes['model'] || changes['contenteditableHtml']);
    if (contentChanged) {
      this.syncDom();
    }
    if (contentChanged || changes['spellErrors']) {
      this.updateSpellUnderlines();
    }
  }

  syncDom(): void {
    const el = this.elRef.nativeElement;
    this.writeContent(el);
  }

  private writeContent(el: HTMLElement): void {
    if (el === document.activeElement) {
      this.currentText = ((el as any).innerText ?? el.textContent ?? '').replace(/\n$/, '');
      return;
    }
    const html = this.contenteditableHtml ?? '';
    if (html) {
      if (el.innerHTML !== html) {
        el.innerHTML = html;
      }
    } else {
      const text = this.model ?? '';
      if (el.textContent !== text) {
        el.textContent = text;
      }
    }
    this.currentText = ((el as any).innerText ?? el.textContent ?? '').replace(/\n$/, '');
  }

  private updateSpellUnderlines(): void {
    const el = this.elRef.nativeElement;
    if (el === document.activeElement) return;
    this.clearUnderlines(el);
    const errors = this.spellErrors;
    if (!errors?.length) return;
    const text = this.currentText;
    if (!text) return;
    const sorted = [...errors].filter(e => e.start >= 0 && e.end <= text.length).sort((a, b) => a.start - b.start);
    for (const err of sorted) {
      this.wrapRange(el, err.start, err.end);
    }
  }

  private clearUnderlines(el: HTMLElement): void {
    const spans = el.querySelectorAll('.spell-err');
    for (let i = spans.length - 1; i >= 0; i--) {
      const span = spans[i];
      const parent = span.parentNode!;
      while (span.firstChild) {
        parent.insertBefore(span.firstChild, span);
      }
      parent.removeChild(span);
    }
  }

  private wrapRange(el: HTMLElement, start: number, end: number): void {
    const textNode = this.findTextNodeAtOffset(el, start, end);
    if (!textNode) return;
    const nodeStart = this.textOffset(el, textNode);
    const localStart = start - nodeStart;
    const localEnd = Math.min(end - nodeStart, textNode.textContent?.length ?? 0);
    if (localStart < 0 || localEnd > (textNode.textContent?.length ?? 0) || localStart >= localEnd) return;
    try {
      const range = document.createRange();
      range.setStart(textNode, localStart);
      range.setEnd(textNode, localEnd);
      const span = document.createElement('span');
      span.className = 'spell-err';
      range.surroundContents(span);
    } catch {
      // skip invalid ranges
    }
  }

  private findTextNodeAtOffset(el: HTMLElement, start: number, end: number): Text | null {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const len = node.textContent?.length ?? 0;
      if (offset + len > start) return node;
      if (offset + len >= end) break;
      offset += len;
    }
    return null;
  }

  private textOffset(el: HTMLElement, target: Text): number {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node === target) return offset;
      offset += node.textContent?.length ?? 0;
    }
    return -1;
  }
}
