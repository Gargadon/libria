import { TestBed } from '@angular/core/testing';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorComponent } from './editor.component';
import { BookStore } from '../../store/book.store';
import { contenteditableOf, setEditorSelection, selectedEditorContent } from './editor-dom';

const caretDescriptor = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint');
const rectDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');

describe('rendered editor drag selection', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    window.getSelection()?.removeAllRanges();
    if (caretDescriptor) Object.defineProperty(document, 'caretRangeFromPoint', caretDescriptor);
    else Reflect.deleteProperty(document, 'caretRangeFromPoint');
    if (rectDescriptor)
      Object.defineProperty(Range.prototype, 'getBoundingClientRect', rectDescriptor);
    else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  });
  it.each(
    [false, true].flatMap((backward) =>
      ['type', 'paste', 'composition', 'collapse'].map((action) => ({ backward, action })),
    ),
  )(
    'selects between paragraphs and restores editing ($action, backward: $backward)',
    async ({ backward, action }) => {
      TestBed.configureTestingModule({
        imports: [
          EditorComponent,
          TranslateModule.forRoot({
            loader: { provide: TranslateLoader, useValue: { getTranslation: () => of({}) } },
          }),
        ],
      });
      const store = TestBed.inject(BookStore);
      store.createNewProject();
      store.updateChapterBlock(store.activeChapterId(), 1, 'Primer párrafo');
      store.insertBlock(store.activeChapterId(), 1, 'p', 'Segundo párrafo');
      const fixture = TestBed.createComponent(EditorComponent);
      await fixture.whenStable();
      const paragraphs = [
        ...fixture.nativeElement.querySelectorAll('.bk-p, .bk-first'),
      ] as HTMLElement[];
      expect(paragraphs).toHaveLength(2);
      const from = paragraphs[backward ? 1 : 0];
      const to = paragraphs[backward ? 0 : 1];
      const rangeAt = (el: HTMLElement, offset: number) => {
        const range = document.createRange();
        range.setStart(el.firstChild!, offset);
        range.collapse(true);
        return range;
      };
      Object.defineProperty(document, 'caretRangeFromPoint', {
        configurable: true,
        value: vi
          .fn()
          .mockReturnValueOnce(rangeAt(from, 2))
          .mockReturnValueOnce(rangeAt(to, 4))
          .mockReturnValueOnce(rangeAt(to, 6)),
      });
      // Do not run queued frames: fast drags must also commit before mouseup.
      vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
      Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ left: 0, width: 10, top: 100, bottom: 120 }),
      });
      // Model WebKitGTK's editing-host restriction; jsdom otherwise allows it.
      const selection = window.getSelection()!;
      const nativeSetSelection = selection.setBaseAndExtent.bind(selection);
      const editor = fixture.nativeElement.querySelector('.ed__doc') as HTMLElement;
      vi.spyOn(selection, 'setBaseAndExtent').mockImplementation(
        (anchor, anchorOffset, focus, focusOffset) => {
          if (
            contenteditableOf(anchor) !== contenteditableOf(focus) &&
            (editor.getAttribute('contenteditable') !== 'true' || document.activeElement !== editor)
          ) {
            nativeSetSelection(anchor, anchorOffset, anchor, anchorOffset);
          } else nativeSetSelection(anchor, anchorOffset, focus, focusOffset);
        },
      );
      const down = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 1,
        clientY: 1,
      });
      from.dispatchEvent(down);
      // A native WebKit drag would overwrite the selection on release.
      expect(down.defaultPrevented).toBe(true);
      to.dispatchEvent(
        new MouseEvent('mousemove', {
          bubbles: true,
          cancelable: true,
          buttons: 1,
          clientX: 2,
          clientY: 2,
        }),
      );
      expect(selection.isCollapsed).toBe(false);
      expect(selection.anchorNode).toBe(from.firstChild);
      expect(selection.focusNode).toBe(to.firstChild);
      expect(selection.toString()).toContain(backward ? 'er párrafo' : 'imer párrafo');
      const up = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 3,
        clientY: 3,
      });
      to.dispatchEvent(up);
      expect(up.defaultPrevented).toBe(true);
      expect(selection.focusNode).toBe(to.firstChild);
      expect(selection.focusOffset).toBe(6);
      expect(selection.isCollapsed).toBe(false);
      expect(editor.getAttribute('contenteditable')).toBe('true');
      expect(document.activeElement).toBe(editor);
      from.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'a', ctrlKey: true, cancelable: true }),
      );
      expect(selection.toString()).toContain('Primer párrafo');
      expect(selection.toString()).toContain('Segundo párrafo');
      expect(selection.toString()).not.toContain('Capítulo 1');
      // Native range serialization includes the intervening block controls.
      // Both forward/backward selection and Ctrl+A must copy manuscript only.
      const clipboard = new Map<string, string>();
      const copy = new Event('copy', { bubbles: true, cancelable: true });
      Object.defineProperty(copy, 'clipboardData', {
        value: { setData: (type: string, value: string) => clipboard.set(type, value) },
      });
      editor.dispatchEvent(copy);
      expect(copy.defaultPrevented).toBe(true);
      expect(clipboard.get('text/plain')).toBe('Primer párrafo\nSegundo párrafo');
      expect(clipboard.get('text/html')).not.toMatch(/chat_bubble|<select|<button|editor\.blockParagraph/);
      expect(store.activeChapter()!.body).toHaveLength(3);

      expect(editor.getAttribute('contenteditable')).toBe('true');
      expect(document.activeElement).toBe(editor);
      let expected = 'X';
      if (action === 'type') {
        editor.dispatchEvent(
          new KeyboardEvent('keydown', { bubbles: true, key: 'X', cancelable: true }),
        );
      } else if (action === 'paste') {
        const paste = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(paste, 'clipboardData', { value: { getData: () => 'Pegado' } });
        editor.dispatchEvent(paste);
        expect(paste.defaultPrevented).toBe(true);
        expected = 'Pegado';
      } else if (action === 'composition') {
        editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
        expected = '';
      } else {
        selection.collapse(paragraphs[0].firstChild!, 2);
        document.dispatchEvent(new Event('selectionchange'));
      }
      if (action !== 'collapse')
        expect(store.activeChapter()!.body.map((block) => block.text)).toEqual([
          'Capítulo 1',
          expected,
        ]);
      expect(editor.hasAttribute('contenteditable')).toBe(false);
      expect(selection.isCollapsed).toBe(true);
      expect(document.activeElement).toBe(paragraphs[0]);
    },
  );
  it('copies a partial rich selection without controls and preserves paragraph breaks', () => {
    const editor = document.createElement('article');
    editor.className = 'ed__doc';
    editor.innerHTML = '<div class="ed__block-container"><p contenteditable="true">Inicio <strong>uno</strong></p></div>' +
      '<div class="ed__block-container"><div class="ed__block-actions"><button>chat_bubble</button><select><option>Párrafo</option></select></div>' +
      '<p contenteditable="true"><em>dos</em> final</p></div>';
    document.body.append(editor);
    try {
      const strong = editor.querySelector('strong')!;
      const em = editor.querySelector('em')!;
      const selection = window.getSelection()!;
      selection.setBaseAndExtent(strong.firstChild!, 1, em.firstChild!, 2);
      const forward = selectedEditorContent()!;
      expect(forward.text).toBe('no\ndo');
      expect(forward.html).toContain('<strong>no</strong>');
      expect(forward.html).toContain('<em>do</em>');
      expect(forward.html).not.toMatch(/chat_bubble|Párrafo|<button|<select/);
      selection.setBaseAndExtent(em.firstChild!, 2, strong.firstChild!, 1);
      expect(selectedEditorContent()).toEqual(forward);
    } finally {
      editor.remove();
    }
  });
  it.each([null, 'false'])(
    'restores the editor editing state if setting the selection fails (%s)',
    (previous) => {
      const editor = document.createElement('article');
      editor.className = 'ed__doc';
      editor.innerHTML = '<p contenteditable="true">Uno</p><p contenteditable="true">Dos</p>';
      if (previous !== null) editor.setAttribute('contenteditable', previous);
      document.body.append(editor);
      try {
        expect(() =>
          setEditorSelection(
            editor.children[0].firstChild!,
            0,
            editor.children[1].firstChild!,
            1000,
          ),
        ).toThrow();
        expect(editor.getAttribute('contenteditable')).toBe(previous);
      } finally {
        editor.remove();
      }
    },
  );
});
