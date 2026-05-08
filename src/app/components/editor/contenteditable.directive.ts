import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
} from '@angular/core';

@Directive({
  selector: '[appContenteditable]',
  standalone: true,
})
export class ContenteditableDirective implements OnInit, OnChanges {
  @Input('appContenteditable') model?: string;
  @Input() contenteditableHtml?: string;

  constructor(private elRef: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    const el = this.elRef.nativeElement;
    if (el.textContent === '') {
      this.writeContent(el);
    }
  }

  ngOnChanges(): void {
    this.syncDom();
  }

  syncDom(): void {
    const el = this.elRef.nativeElement;
    this.writeContent(el);
  }

  private writeContent(el: HTMLElement): void {
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
  }
}
