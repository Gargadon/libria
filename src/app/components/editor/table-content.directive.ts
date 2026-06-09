import { Directive, ElementRef, Input, OnChanges, SimpleChanges } from '@angular/core';

@Directive({
  selector: '[appTableContent]',
  standalone: true,
})
export class TableContentDirective implements OnChanges {
  @Input() appTableContent?: string;

  constructor(private el: ElementRef<HTMLTableElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['appTableContent']) return;
    const el = this.el.nativeElement;
    const content = this.stripTableWrapper(this.appTableContent || '');
    if (el.innerHTML !== content) {
      el.innerHTML = content;
    }
  }

  private stripTableWrapper(html: string): string {
    return html.replace(/^<table[^>]*>/i, '').replace(/<\/table>\s*$/i, '');
  }
}
