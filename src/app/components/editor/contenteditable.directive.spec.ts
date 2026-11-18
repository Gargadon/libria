import { ElementRef } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ContenteditableDirective } from './contenteditable.directive';

describe('editable block synchronization', () => {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    document.body.replaceChildren();
  });

  function setup() {
    const element = document.createElement('p');
    element.contentEditable = 'true';
    document.body.append(element);
    const directive = new ContenteditableDirective(new ElementRef(element));
    return { element, directive };
  }

  it('updates an unfocused block without forcing a layout through innerText', () => {
    const { element, directive } = setup();
    const read = vi.fn(() => element.textContent);
    Object.defineProperty(element, 'innerText', { get: read });
    directive.model = 'Nuevo capítulo';
    directive.syncDom();
    directive.contenteditableHtml = '<em>Nuevo capítulo</em>';
    directive.syncDom();
    expect(element.innerHTML).toBe('<em>Nuevo capítulo</em>');
    expect(read).not.toHaveBeenCalled();
  });

  it('preserves pending input when the selection remains inside the block', () => {
    const { element, directive } = setup();
    element.textContent = 'Edición sin guardar';
    Object.defineProperty(element, 'innerText', { get: () => element.textContent });
    const range = document.createRange();
    range.selectNodeContents(element);
    document.getSelection()!.addRange(range);
    directive.model = 'Texto anterior';
    directive.syncDom();
    expect(element.textContent).toBe('Edición sin guardar');
  });
});
