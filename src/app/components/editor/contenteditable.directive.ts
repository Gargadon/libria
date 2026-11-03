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
    // Nunca se reescribe el bloque mientras el usuario escribe en él: el DOM puede ir
    // por delante del modelo (el guardado va con retardo) y reescribirlo perdería el
    // texto recién escrito, incluido el reemplazo de una selección.
    if (el === document.activeElement || (this.selectionInside(el) && this.domText(el) !== (this.model ?? ''))) {
      this.currentText = this.domText(el);
      return;
    }
    const html = this.contenteditableHtml ?? '';
    if (html) {
      if (el.innerHTML !== html) {
        el.innerHTML = html;
      }
    } else {
      const text = this.model ?? '';
      // Undo can remove formatting without changing the characters. Comparing
      // text alone leaves stale <b>/<i>/<u> markup in the editable DOM.
      if (el.textContent !== text || el.childElementCount > 0) {
        el.textContent = text;
      }
    }
    this.currentText = this.domText(el);
  }

  private domText(el: HTMLElement): string {
    return ((el as any).innerText ?? el.textContent ?? '').replace(/\n$/, '');
  }

  /** El foco puede estar en la superficie compartida; el caret sigue dentro del bloque. */
  private selectionInside(el: HTMLElement): boolean {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const anchor = selection.anchorNode;
    return !!anchor && el.contains(anchor);
  }

}

