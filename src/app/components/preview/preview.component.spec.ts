import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewComponent } from './preview.component';
import { BookStore } from '../../store/book.store';
import { EditorPositionService } from '../../services/editor-position.service';
import type { Chapter } from '../../models/book.models';

const chapter = (id: string): Chapter => ({ id, kind: 'chapter', title: id, words: 40,
  body: [{ type: 'p', text: `${id} first` }, { type: 'p', text: `${id} last` }] });

describe('isolated device preview pagination', () => {
  afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  async function setup() {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(function(this: HTMLElement) {
      return [{ left: Number(this.dataset['previewBlock'] || 0) * 100 }] as unknown as DOMRectList;
    });
    TestBed.configureTestingModule({ imports: [PreviewComponent, TranslateModule.forRoot()] });
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    const chapters = [chapter('a'), chapter('b'), chapter('c')];
    store.setChapters(chapters); store.setActiveChapter('a');
    const fixture = TestBed.createComponent(PreviewComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.chapters.set(chapters);
    fixture.detectChanges();
    component.navigateToChapter('a'); fixture.detectChanges(); component.measureDOM();
    async function waitFor(predicate: () => boolean) {
      for (let i = 0; i < 100 && !predicate(); i++) {
        await new Promise(resolve => setTimeout(resolve, 10)); fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('.kp-flow > .kp').length).toBeLessThanOrEqual(2);
      }
      expect(predicate()).toBe(true);
    }
    await waitFor(() => Object.keys(component.realChapterPages()).length === 3);
    return { fixture, component, store, chapters, waitFor };
  }

  it('measures exact book offsets while mounting at most two chapters', async () => {
    const { fixture, component } = await setup();
    expect(component.realChapterPages()).toEqual({ a: 2, b: 2, c: 2 });
    expect(component.realPageOffsets()).toEqual({ a: 0, b: 2, c: 4 });
    expect(component.measuredTotalPages()).toBe(6);
    expect(component.devicePaginationPending()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.kp-flow > .kp').length).toBe(1);
  });

  it('crosses chapter boundaries and preserves a requested local page after editor sync', async () => {
    const { fixture, component, store } = await setup();
    component.goToPage(4); fixture.detectChanges();
    expect(store.activeChapterId()).toBe('b');
    expect(component.deviceChapterId()).toBe('b');
    expect(component.devicePage()).toBe(1);
    component.chapters.set([...component.chapters()]); fixture.detectChanges();
    expect(component.devicePage()).toBe(1);
    component.nextPage(); fixture.detectChanges();
    expect(component.deviceChapterId()).toBe('c');
    expect(component.devicePage()).toBe(0);
    component.prevPage(); fixture.detectChanges();
    expect(component.deviceChapterId()).toBe('b');
    expect(component.devicePage()).toBe(1);
    TestBed.inject(EditorPositionService).position.set({ chapterId: 'b', blockIndex: 0 });
    fixture.detectChanges();
    expect(component.devicePage()).toBe(0);
  });

  it('uses cached block pages for cursor movement without reading layout', async () => {
    const { fixture, component } = await setup();
    const rects = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect'); rects.mockClear();
    TestBed.inject(EditorPositionService).position.set({ chapterId: 'a', blockIndex: 1 });
    fixture.detectChanges();
    expect(component.devicePage()).toBe(1);
    expect(rects).not.toHaveBeenCalled();
  });

  it('remeasures an edited chapter and keeps the other chapter measurements', async () => {
    const { fixture, component, store, chapters, waitFor } = await setup();
    const changed = { ...chapters[0], body: [...chapters[0].body, { type: 'p', text: 'new' }] };
    store.setChapters([changed, ...chapters.slice(1)]);
    component.chapters.set(store.chapters()); fixture.detectChanges(); component.measureDOM();
    expect(component.realChapterPages()).toEqual({ b: 2, c: 2 });
    await waitFor(() => component.realChapterPages()['a'] === 2);
    expect(component.measuredTotalPages()).toBe(6);
    fixture.destroy();
  });
  it('invalidates page geometry when switching device or changing typography', async () => {
    const { fixture, component, store, waitFor } = await setup();
    component.mode.set('iphone'); fixture.detectChanges(); component.measureDOM();
    expect(component.realChapterPages()).toEqual({});
    expect(component.devicePaginationPending()).toBe(true);
    await waitFor(() => !component.devicePaginationPending());
    store.updateTweak('fontSize', store.tweaks.fontSize() + 1);
    fixture.detectChanges(); component.measureDOM();
    expect(component.realChapterPages()).toEqual({});
    await waitFor(() => !component.devicePaginationPending());
  });

});
