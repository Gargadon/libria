import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nspell from 'nspell';
import { SidebarDictionaryPanelComponent, SidebarDictionaryState } from './dictionary-panel.component';
import { SpellCheckService } from '../../../services/spell-check.service';
import { SpellcheckPanelComponent } from '../../spellcheck-panel/spellcheck-panel.component';
import { BookStore } from '../../../store/book.store';

describe('personal dictionary panel', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(initial: string[] = []) {
    let saved = [...initial];
    const revision = signal(0);
    const engine = nspell('SET UTF-8\n', '2\nhola\nmundo\n');
    const spelling = {
      revision, isAvailable: false,
      getCustomDictionary: vi.fn(async () => [...saved]),
      loadDictionary: vi.fn(async () => engine),
      addWord: vi.fn(async (word: string) => {
        saved = [...new Set([...saved, word])]; engine.add(word); revision.update(value => value + 1); return true;
      }),
      removeWord: vi.fn(async (word: string) => {
        saved = saved.filter(value => value !== word); revision.update(value => value + 1); return true;
      }),
    };
    TestBed.configureTestingModule({
      imports: [SidebarDictionaryPanelComponent, SpellcheckPanelComponent, TranslateModule.forRoot()],
      providers: [SidebarDictionaryState, { provide: SpellCheckService, useValue: spelling }],
    });
    const fixture = TestBed.createComponent(SidebarDictionaryPanelComponent);
    await fixture.whenStable();
    return { fixture, panel: fixture.componentInstance.panel, spelling };
  }

  it('updates the visible list when a word is added from the spelling modal', async () => {
    const { fixture, panel } = await setup();
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    store.updateChapterBlock(store.activeChapterId(), 0, 'hola');
    store.updateChapterBlock(store.activeChapterId(), 1, 'holaa mundo');
    const modal = TestBed.createComponent(SpellcheckPanelComponent);
    await modal.whenStable();
    expect(modal.componentInstance.current()?.word).toBe('holaa');
    await modal.componentInstance.addWord();
    await fixture.whenStable();
    expect(panel.words()).toEqual(['holaa']);
    expect(fixture.nativeElement.querySelector('.sb__dict-word').textContent).toBe('holaa');
    expect(modal.componentInstance.current()).toBeNull();
  });

  it('sorts, searches and navigates pages, then clamps navigation after deletion', async () => {
    const { fixture, panel } = await setup(Array.from({ length: 21 }, (_, index) => `word${String(index).padStart(2, '0')}`).reverse());
    expect(panel.visible()).toHaveLength(20);
    expect(panel.visible()[0]).toBe('word00');
    panel.navigate(1);
    expect(panel.visible()).toEqual(['word20']);
    await panel.remove('word20');
    await fixture.whenStable();
    expect(panel.pageIndex()).toBe(0);
    expect(panel.pageCount()).toBe(1);
    panel.search('WORD01');
    expect(panel.visible()).toEqual(['word01']);
    panel.search('missing');
    expect(panel.visible()).toEqual([]);
    expect(panel.pageCount()).toBe(1);
  });

  it('adds and removes words through the panel without duplicating entries', async () => {
    const { fixture, panel } = await setup(['hola']);
    panel.newWord = ' hola ';
    await panel.add();
    await fixture.whenStable();
    expect(panel.words()).toEqual(['hola']);
    expect(panel.newWord).toBe('');
    expect(panel.query()).toBe('hola');
    await panel.remove('hola');
    await fixture.whenStable();
    expect(panel.words()).toEqual([]);
  });

  it('keeps the word and reports an error when deletion fails', async () => {
    const { fixture, panel, spelling } = await setup(['hola']);
    spelling.removeWord.mockResolvedValue(false);
    await panel.remove('hola');
    await fixture.whenStable();
    expect(panel.words()).toEqual(['hola']);
    expect(panel.error()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });
});
