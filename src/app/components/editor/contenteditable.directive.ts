import {
  Directive,
  ElementRef,
  Input,
  OnChanges,
  OnInit,
  SimpleChanges,
} from '@angular/core';

@Directive({
  selector: '[appContenteditable]',
  standalone: true,
})
export class ContenteditableDirective implements OnInit, OnChanges {
  @Input('appContenteditable') model?: string;
  @Input() contenteditableHtml?: string;

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

}

