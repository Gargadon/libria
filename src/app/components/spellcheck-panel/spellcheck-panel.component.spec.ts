import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import nspell from 'nspell';
import { SpellcheckPanelComponent, correctSpelling } from './spellcheck-panel.component';
import { SpellCheckService } from '../../services/spell-check.service';
import { BookStore } from '../../store/book.store';

describe('spelling review', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('preserves markup and does not replace parts of other words or attributes', () => {
    expect(correctSpelling('<em>holaa</em> <a href="https://holaa.test">holaa</a> holaaa', 'holaa', 'hola'))
      .toBe('<em>hola</em> <a href="https://holaa.test">hola</a> holaaa');
    expect(correctSpelling('ho<em>laa</em> mundo', 'holaa', 'hola')).toBe('hola<em></em> mundo');
    expect(correctSpelling('<li>holaa</li><li>mundo</li>', 'holaa', 'hola')).toBe('<li>hola</li><li>mundo</li>');
  });

  it('reviews the active chapter, offers corrections, and makes them undoable', async () => {
    const engine = nspell('SET UTF-8\n', '2\nhola\nmundo\n');
    TestBed.configureTestingModule({
      imports: [SpellcheckPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SpellCheckService, useValue: { revision: signal(0), loadDictionary: vi.fn(async () => engine) } }],
    });
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    const chapter = store.activeChapter()!;
    store.updateChapterBlock(chapter.id, 0, 'hola', 'hola');
    store.updateChapterBlock(chapter.id, 1, 'holaa mundo', '<em>holaa</em> mundo');
    const fixture = TestBed.createComponent(SpellcheckPanelComponent);
    await fixture.whenStable();
    const panel = fixture.componentInstance;
    expect(panel.current()?.word).toBe('holaa');
    expect(panel.suggestions()).toContain('hola');
    panel.replace('hola');
    expect(store.activeChapter()!.body[1].html).toBe('<em>hola</em> mundo');
    expect(panel.current()).toBeNull();
    store.undo();
    expect(panel.current()?.word).toBe('holaa');
    panel.ignore();
    expect(panel.current()).toBeNull();
  });

  it('shows dictionary failures instead of reporting that the chapter has no errors', async () => {
    TestBed.configureTestingModule({
      imports: [SpellcheckPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SpellCheckService, useValue: { revision: signal(0), loadDictionary: vi.fn(async () => { throw new Error('offline'); }) } }],
    });
    TestBed.inject(BookStore).createNewProject();
    const fixture = TestBed.createComponent(SpellcheckPanelComponent);
    await fixture.whenStable();
    expect(fixture.componentInstance.error()).toBe(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
  });

  it.each([true, false])('adds the current word through the modal and handles saving success=%s', async success => {
    const engine = nspell('SET UTF-8\n', '2\nhola\nmundo\n');
    const revision = signal(0);
    const addWord = vi.fn(async (word: string) => {
      if (success) { engine.add(word); revision.update(value => value + 1); }
      return success;
    });
    TestBed.configureTestingModule({
      imports: [SpellcheckPanelComponent, TranslateModule.forRoot()],
      providers: [{ provide: SpellCheckService, useValue: {
        revision, loadDictionary: vi.fn(async () => engine), addWord,
      } }],
    });
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    store.updateChapterBlock(store.activeChapterId(), 0, 'hola');
    store.updateChapterBlock(store.activeChapterId(), 1, 'holaa holaa mundo');
    const fixture = TestBed.createComponent(SpellcheckPanelComponent);
    await fixture.whenStable();
    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (button: any) => button.textContent.includes('spellcheck.addToDictionary'),
    ) as HTMLButtonElement;
    expect(button).toBeDefined();
    button.click();
    await fixture.whenStable();
    expect(addWord).toHaveBeenCalledExactlyOnceWith('holaa');
    expect(fixture.componentInstance.addingWord()).toBe(false);
    expect(fixture.componentInstance.dictionaryError()).toBe(!success);
    expect(fixture.componentInstance.current()?.word).toBe(success ? undefined : 'holaa');
    expect(store.activeChapter()!.body[1].text).toBe('holaa holaa mundo');
  });
});
