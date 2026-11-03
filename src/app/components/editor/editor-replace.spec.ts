import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorComponent } from './editor.component';
import { BookStore } from '../../store/book.store';

/** Simula lo que hace el navegador al escribir sobre una selección. */
function replaceSelection(paragraph: HTMLElement, from: number, to: number, text: string) {
  const current = paragraph.textContent ?? '';
  paragraph.textContent = current.slice(0, from) + text + current.slice(to);
  paragraph.dispatchEvent(new InputEvent('input', { bubbles: true }));
}

function select(paragraph: HTMLElement, from: number, to: number) {
  const selection = window.getSelection()!;
  const range = document.createRange();
  range.setStart(paragraph.firstChild!, from);
  range.setEnd(paragraph.firstChild!, to);
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('reemplazar texto escribiendo', () => {
  let store: InstanceType<typeof BookStore>;
  let fixture: ComponentFixture<EditorComponent>;
  let paragraph: HTMLElement;
  let chapterId = '';

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [
        EditorComponent,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useValue: { getTranslation: () => of({}) } },
        }),
      ],
    });
    store = TestBed.inject(BookStore);
    store.createNewProject();
    chapterId = store.activeChapterId();
    store.updateChapterBlock(chapterId, 1, 'Hola mundo cruel');
    fixture = TestBed.createComponent(EditorComponent);
    await fixture.whenStable();
    paragraph = fixture.nativeElement.querySelector('.bk-p') as HTMLElement;
    Object.defineProperty(paragraph, 'innerText', {
      configurable: true,
      get: () => paragraph.textContent,
    });
    paragraph.focus();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    delete (document as any).execCommand;
    window.getSelection()?.removeAllRanges();
  });

  it('guarda el texto reemplazado sin revertirlo al repintar', async () => {
    vi.useFakeTimers();
    replaceSelection(paragraph, 5, 10, 'bello');
    await vi.advanceTimersByTimeAsync(250);

    expect(store.activeChapter()!.body[1].text).toBe('Hola bello cruel');

    TestBed.tick();
    expect(paragraph.textContent).toBe('Hola bello cruel');
  });

  it('no pisa lo que se está escribiendo cuando el foco está en otra superficie', () => {
    paragraph.textContent = 'Hola bello cruel y más';
    (document.activeElement as HTMLElement | null)?.blur?.();
    select(paragraph, 10, 10);

    store.updateChapterBlock(chapterId, 1, 'Hola bello cruel');
    fixture.detectChanges();

    expect(paragraph.textContent).toBe('Hola bello cruel y más');
  });

  it('acepta una comilla escrita sobre una selección', () => {
    const execCommand = vi.fn(() => true);
    (document as any).execCommand = execCommand;
    select(paragraph, 5, 10);

    const event = new KeyboardEvent('keydown', { bubbles: true, key: '"', cancelable: true });
    paragraph.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('insertText', false, '«');
  });

  it('sustituye la selección al pulsar Enter', () => {
    select(paragraph, 5, 10);
    paragraph.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', cancelable: true }));

    const body = store.activeChapter()!.body;
    expect(body[1].text).toBe('Hola ');
    expect(body[2].text).toBe(' cruel');
  });
});
