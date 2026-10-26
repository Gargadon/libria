import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditorComponent } from './editor.component';

describe('pending paragraph edits', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    window.getSelection()?.removeAllRanges();
  });

  function fixture() {
    vi.useFakeTimers();
    const chapter = { id: 'chapter', body: [
      { type: 'p', text: 'Anterior' },
      { type: 'p', text: 'Texto borrado' },
      { type: 'p', text: 'Siguiente' },
    ] };
    const store = {
      activeChapter: () => chapter,
      chapters: () => [chapter],
      saveSnapshot: vi.fn(),
      updateChapterBlock: vi.fn((_id: string, index: number, text: string, html?: string) => {
        Object.assign(chapter.body[index], { text, html });
      }),
      mergeWithPrevious: vi.fn((_id: string, index: number) => {
        chapter.body[index - 1].text += chapter.body[index].text;
        chapter.body.splice(index, 1);
      }),
    };
    // Exercise input/keyboard handlers without rendering the full book UI.
    const editor = Object.assign(Object.create(EditorComponent.prototype), {
      store, _nativeBlocks: new Set(), _pendingStoreUpdate: null,
      _getCaretOffset: () => 0, _getEditableBlock: () => null,
    }) as EditorComponent;
    const element = document.createElement('p');
    document.body.append(element);
    const input = (text: string) => {
      element.textContent = text;
      Object.defineProperty(element, 'innerText', { configurable: true, value: text });
      editor.onInput('chapter', 1, { target: element } as unknown as Event);
    };
    const backspace = () => {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(true);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
      const event = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true });
      Object.defineProperty(event, 'target', { value: element });
      editor.onKeyDown('chapter', 1, event);
      expect(event.defaultPrevented).toBe(true);
    };
    return { editor, chapter, store, element, input, backspace };
  }

  it('does not resurrect deleted text when Backspace reaches the previous paragraph before 200 ms', () => {
    const f = fixture();
    f.input('Texto');
    f.input('');
    f.backspace();
    expect(f.chapter.body.map(b => b.text)).toEqual(['Anterior', 'Siguiente']);
    vi.runAllTimers();
    expect(f.chapter.body.map(b => b.text)).toEqual(['Anterior', 'Siguiente']);
    expect(f.store.updateChapterBlock).toHaveBeenCalledTimes(1);
  });

  it('merges only the remaining text and leaves the following paragraph intact', () => {
    const f = fixture();
    f.input('resto');
    f.backspace();
    vi.runAllTimers();
    expect(f.chapter.body.map(b => b.text)).toEqual(['Anteriorresto', 'Siguiente']);
  });

  it('captures input before the editable DOM is reused', () => {
    const f = fixture();
    f.input('Última edición');
    f.element.textContent = 'Otro bloque';
    vi.advanceTimersByTime(200);
    expect(f.chapter.body[1].text).toBe('Última edición');
  });

  function selectedParagraphs(backward = false) {
    vi.useFakeTimers();
    const chapter = { id: 'chapter', body: [
      { type: 'p', text: 'Antes uno' },
      { type: 'p', text: 'Intermedio' },
      { type: 'p', text: 'dos Después' },
      { type: 'p', text: 'Intacto' },
    ] };
    document.body.innerHTML = '<article class="ed__doc">' + chapter.body.map(b =>
      `<div class="ed__block-container"><p contenteditable="true">${b.text}</p></div>`
    ).join('') + '</article>';
    const elements = document.querySelectorAll<HTMLElement>('p');
    const store = {
      activeChapter: () => chapter, saveSnapshot: vi.fn(),
      updateChapterBlock: vi.fn((_id: string, index: number, text: string, html?: string) => {
        Object.assign(chapter.body[index], { text, html });
      }),
      deleteBlock: vi.fn((_id: string, index: number) => { chapter.body.splice(index, 1); }),
      insertBlock: vi.fn((_id: string, index: number, type: string, text: string) => {
        chapter.body.splice(index + 1, 0, { type, text });
      }),
    };
    const editor = Object.assign(Object.create(EditorComponent.prototype), {
      store, _nativeBlocks: new Set(), _pendingStoreUpdate: null,
    }) as EditorComponent;
    const selection = window.getSelection()!;
    if (backward) selection.setBaseAndExtent(elements[2].firstChild!, 3, elements[0].firstChild!, 6);
    else selection.setBaseAndExtent(elements[0].firstChild!, 6, elements[2].firstChild!, 3);
    const key = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true });
      Object.defineProperty(event, 'target', { value: elements[2] });
      editor.onKeyDown(chapter.id, 2, event);
      expect(event.defaultPrevented).toBe(true);
    };
    return { editor, chapter, store, elements, key };
  }

  it.each(['Backspace', 'Delete'])('deletes a selection across paragraphs with %s', key => {
    const f = selectedParagraphs();
    f.key(key);
    expect(f.chapter.body.map(b => b.text)).toEqual(['Antes  Después', 'Intacto']);
    expect(window.getSelection()?.isCollapsed).toBe(true);
    expect(f.store.saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('replaces a backward selection with the typed character', () => {
    const f = selectedParagraphs(true);
    f.key('X');
    expect(f.chapter.body.map(b => b.text)).toEqual(['Antes X Después', 'Intacto']);
    expect(f.elements[0].textContent).toBe('Antes X Después');
    expect(window.getSelection()?.anchorOffset).toBe(7);
  });

  it('replaces the selection with multiple pasted paragraphs', () => {
    const f = selectedParagraphs();
    const preventDefault = vi.fn();
    f.editor.onPaste('chapter', 2, {
      clipboardData: { getData: () => 'nuevo\ntexto' }, preventDefault,
    } as unknown as ClipboardEvent);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(f.chapter.body.map(b => b.text)).toEqual(['Antes nuevo', 'texto Después', 'Intacto']);
  });

  it('handles text supplied by beforeinput', () => {
    const f = selectedParagraphs();
    const event = new InputEvent('beforeinput', { inputType: 'insertText', data: 'é', cancelable: true });
    f.editor.onBeforeInput(event);
    expect(event.defaultPrevented).toBe(true);
    expect(f.chapter.body.map(b => b.text)).toEqual(['Antes é Después', 'Intacto']);
  });

  it('keeps the inline formatting outside the deleted selection', () => {
    const f = selectedParagraphs();
    f.elements[0].innerHTML = '<strong>Antes </strong>uno';
    f.elements[2].innerHTML = 'dos<em> Después</em>';
    const range = document.createRange();
    range.setStart(f.elements[0].lastChild!, 0);
    range.setEnd(f.elements[2].firstChild!, 3);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    f.key('Delete');
    expect(f.elements[0].innerHTML).toBe('<strong>Antes </strong><em> Después</em>');
  });

  it('leaves an editable empty paragraph when the entire chapter is deleted', () => {
    const f = selectedParagraphs();
    const range = document.createRange();
    range.setStart(f.elements[0], 0);
    range.setEnd(f.elements[3], f.elements[3].childNodes.length);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    f.key('Backspace');
    expect(f.chapter.body.map(b => b.text)).toEqual(['']);
    expect(window.getSelection()?.isCollapsed).toBe(true);
  });

  function titleAndBody() {
    const f = selectedParagraphs();
    f.elements[0].parentElement!.setAttribute('data-selection-region', 'title');
    for (const element of Array.from(f.elements).slice(1)) {
      element.parentElement!.setAttribute('data-selection-region', 'content');
    }
    return f;
  }

  it('stops a selection anchored in the title at the end of the title', () => {
    const f = titleAndBody();
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(f.elements[0].firstChild!, 6, f.elements[2].firstChild!, 3);
    (f.editor as any)._constrainSelection();
    expect(selection.toString()).toBe('uno');
    expect(selection.anchorNode).toBe(f.elements[0].firstChild);
  });

  it('stops a backward body selection before it reaches the title', () => {
    const f = titleAndBody();
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(f.elements[2].firstChild!, 3, f.elements[0].firstChild!, 0);
    (f.editor as any)._constrainSelection();
    expect(selection.toString()).toBe('Intermediodos');
    expect(selection.anchorNode).toBe(f.elements[2].firstChild);
  });

  it.each([0, 2])('limits select-all to the region of block %s', index => {
    const f = titleAndBody();
    const selection = window.getSelection()!;
    selection.collapse(f.elements[index].firstChild!, 0);
    f.editor.onEditorKeyDown(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, cancelable: true }));
    expect(selection.toString()).toBe(index === 0 ? 'Antes uno' : 'Intermediodos DespuésIntacto');
  });

  it('keeps the title intact when deleting a body selection extended toward it', () => {
    const f = titleAndBody();
    window.getSelection()!.setBaseAndExtent(f.elements[2].firstChild!, 3, f.elements[0].firstChild!, 0);
    f.key('Delete');
    expect(f.chapter.body.map(b => b.text)).toEqual(['Antes uno', ' Después', 'Intacto']);
  });
});
