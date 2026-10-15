import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nspell from 'nspell';
import { EditorSpellingComponent } from './editor-spelling.component';
import { BookStore } from '../../store/book.store';
import { SpellCheckService } from '../../services/spell-check.service';
import { EditorComponent } from './editor.component';

@Component({ imports: [EditorSpellingComponent], template: `
  <section><app-editor-spelling />
    <p contenteditable="true" spellcheck="false" data-libria-spelling>holaa mundo</p>
    <p contenteditable="true" spellcheck="false" data-libria-spelling>otrooo</p>
    <code contenteditable="true" spellcheck="false">codigoerroneo</code>
  </section>` })
class Host {}

describe('editor spelling', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  async function setup() {
    const engine = nspell('SET UTF-8\n', '2\nhola\nmundo\n');
    const highlights = new Map<string, Set<Range>>();
    vi.stubGlobal('Highlight', class extends Set<Range> { constructor(...ranges: Range[]) { super(ranges); } });
    vi.stubGlobal('CSS', { highlights });
    const spelling = { revision: signal(0), loadDictionary: vi.fn(async () => engine),
      addWord: vi.fn(async (word: string) => { engine.add(word); return true; }) };
    TestBed.configureTestingModule({ imports: [Host, TranslateModule.forRoot()],
      providers: [{ provide: SpellCheckService, useValue: spelling }] });
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const component = fixture.debugElement.query(By.directive(EditorSpellingComponent)).componentInstance as EditorSpellingComponent;
    component.refresh();
    return { fixture, component, store, spelling, highlights };
  }

  it('highlights all editable blocks while leaving code, text, and markup intact', async () => {
    const { fixture, component, store, highlights } = await setup();
    const before = fixture.nativeElement.querySelector('section').innerHTML;
    expect([...highlights.get('libria-spelling')!].map(range => range.toString())).toEqual(['holaa', 'otrooo']);
    expect(fixture.nativeElement.querySelector('section').innerHTML).toBe(before);
    store.updateTweak('spellcheck', false);
    await fixture.whenStable();
    component.refresh();
    expect(highlights.get('libria-spelling')!.size).toBe(0);
  });

  it('offers dictionary suggestions on right click and supports ignoring and adding words', async () => {
    const { fixture, component, spelling, highlights } = await setup();
    const range = [...highlights.get('libria-spelling')!][0];
    const element = fixture.nativeElement.querySelector('p') as HTMLElement;
    // Keep geometry deterministic while the context handler refreshes live ranges.
    vi.spyOn(component, 'refresh').mockImplementation(() => {});
    range.getClientRects = () => [{ left: 10, right: 50, top: 10, bottom: 30 }] as unknown as DOMRectList;
    const event = new MouseEvent('contextmenu', { clientX: 20, clientY: 20, cancelable: true });
    Object.defineProperty(event, 'target', { value: element });
    component.contextMenu(event);
    expect(event.defaultPrevented).toBe(true);
    expect(component.suggestions()).toContain('hola');
    component.ignore();
    expect(component.menu()).toBeNull();
    component.contextMenu(event);
    await component.addWord();
    expect(spelling.addWord).toHaveBeenCalledWith('holaa');
    expect(component.menu()).toBeNull();
    fixture.destroy();
    expect(highlights.has('libria-spelling')).toBe(false);
  });

  it('corrects only the clicked occurrence, preserves emphasis, and supports undo', async () => {
    const engine = nspell('SET UTF-8\n', '2\nhola\nmundo\n');
    TestBed.configureTestingModule({ imports: [EditorComponent, TranslateModule.forRoot()],
      providers: [{ provide: SpellCheckService, useValue: {
        revision: signal(0), isAvailable: false, loadDictionary: vi.fn(async () => engine),
      } }] });
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    store.updateChapterBlock(store.activeChapterId(), 1, 'holaa holaa', '<em>holaa</em> holaa');
    const fixture = TestBed.createComponent(EditorComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement.querySelector('[data-libria-spelling].bk-p') as HTMLElement;
    Object.defineProperty(element, 'innerText', { configurable: true, get: () => element.textContent });
    const range = document.createRange();
    range.selectNodeContents(element.querySelector('em')!);
    fixture.componentInstance.applySpellingCorrection({ word: 'holaa', element, range, replacement: 'hola' });
    expect(store.activeChapter()!.body[1].text).toBe('hola holaa');
    expect(store.activeChapter()!.body[1].html).toContain('<em>hola</em> holaa');
    fixture.componentInstance.onKeyDown(store.activeChapterId(), 1,
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }), element);
    expect(store.activeChapter()!.body[1].text).toBe('holaa holaa');
  });
});
