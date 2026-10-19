import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { SidebarComponent } from './sidebar.component';
import { BookStore } from '../../store/book.store';
import { FontService } from '../../services/font.service';

describe('sidebar panel navigation', () => {
  const loadSystemFonts = vi.fn(async () => ['System Serif']);
  beforeEach(() => {
    loadSystemFonts.mockClear();
    TestBed.configureTestingModule({
      imports: [
        SidebarComponent,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useValue: { getTranslation: () => of({}) } },
        }),
      ],
      providers: [{ provide: FontService, useValue: { loadSystemFonts } }],
    });
    TestBed.inject(BookStore).createNewProject();
  });
  afterEach(() => TestBed.resetTestingModule());

  it('moves chapters across all sections and restores their metadata on undo', () => {
    const store = TestBed.inject(BookStore);
    const original = store.chapters().find(c => c.kind === 'chapter')!;
    for (const kind of ['front', 'back', 'chapter'] as const) {
      store.reorderChapter(original.id, null, true, kind);
      const moved = store.chapters().find(c => c.id === original.id)!;
      expect(moved.kind).toBe(kind);
      expect(moved.body).toEqual(original.body);
      expect(moved.status).toBe(kind === 'chapter' ? 'draft' : kind);
      if (kind === 'chapter') expect(moved.number).toBeGreaterThan(0);
      else expect(moved.number).toBeUndefined();
    }
    store.undo();
    expect(store.chapters().find(c => c.id === original.id)!.kind).toBe('back');
    store.undo();
    store.undo();
    expect(store.chapters().find(c => c.id === original.id)).toEqual(original);
  });

  it('accepts drops on chapters from another section and on an empty section', async () => {
    const store = TestBed.inject(BookStore);
    store.addChapter('front');
    const fixture = TestBed.createComponent(SidebarComponent);
    await fixture.whenStable();
    const source = store.chapters().find(c => c.kind === 'chapter')!;
    const target = store.chapters().find(c => c.kind === 'front')!;
    const event = {
      preventDefault: vi.fn(), stopPropagation: vi.fn(), clientY: 1,
      currentTarget: { getBoundingClientRect: () => ({ top: 0, height: 10 }) },
    } as unknown as DragEvent;
    fixture.componentInstance.startChapterDrag(source.id, event);
    fixture.componentInstance.overChapter(target.id, event);
    fixture.componentInstance.dropChapter(target.id, event);
    expect(store.chapters().findIndex(c => c.id === source.id)).toBe(
      store.chapters().findIndex(c => c.id === target.id) - 1,
    );
    expect(store.chapters().find(c => c.id === source.id)!.kind).toBe('front');
    for (const c of store.chapters().filter(c => c.kind === 'back')) store.deleteChapter(c.id);
    await fixture.whenStable();
    const group = fixture.nativeElement.querySelectorAll('.sbg')[2] as HTMLElement;
    fixture.componentInstance.startChapterDrag(source.id, event);
    group.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(group.classList.contains('sbg--drop')).toBe(true);
    group.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    expect(store.chapters().find(c => c.id === source.id)!.kind).toBe('back');
    expect(fixture.componentInstance.draggedChapterId()).toBeNull();
  });

  it('keeps an uncommitted metadata draft when navigating between panels', async () => {
    const store = TestBed.inject(BookStore);
    const original = store.book()!.title;
    store.setNav('metadata');
    const fixture = TestBed.createComponent(SidebarComponent);
    await fixture.whenStable();
    const title = fixture.nativeElement.querySelector(
      'app-sidebar-metadata input[type="text"]',
    ) as HTMLInputElement;
    title.value = 'Título en edición';
    title.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(store.book()!.title).toBe(original);
    store.setNav('search');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-sidebar-search')).not.toBeNull();
    store.setNav('metadata');
    await fixture.whenStable();
    const restored = fixture.nativeElement.querySelector(
      'app-sidebar-metadata input[type="text"]',
    ) as HTMLInputElement;
    expect(restored.value).toBe('Título en edición');
    restored.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(store.book()!.title).toBe('Título en edición');
  });

  it('shares system font choices between styles and layout without reloading them', async () => {
    const store = TestBed.inject(BookStore);
    store.setNav('styles');
    const fixture = TestBed.createComponent(SidebarComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-sidebar-styles').textContent).toContain(
      'System Serif',
    );
    store.setNav('layout');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-sidebar-layout').textContent).toContain(
      'System Serif',
    );
    expect(loadSystemFonts).toHaveBeenCalledOnce();
  });

  it('edits document small caps and first-page furniture from their panels', async () => {
    const store = TestBed.inject(BookStore);
    const fixture = TestBed.createComponent(SidebarComponent);
    for (const [nav, label, key] of [
      ['styles', 'sidebar.firstParagraphSmallCaps', 'firstParagraphSmallCaps'],
      ['layout', 'sidebar.hideFirstPageHeaderFooter', 'hideFirstPageHeaderFooter'],
    ] as const) {
      store.setNav(nav);
      await fixture.whenStable();
      const row = [...fixture.nativeElement.querySelectorAll('.sb__row')].find((row: any) => row.textContent.includes(label)) as HTMLElement;
      expect(row).toBeTruthy();
      row.querySelectorAll<HTMLButtonElement>('button')[1].click();
      await fixture.whenStable();
      expect(store.tweaks[key]()).toBe(false);
      row.querySelectorAll<HTMLButtonElement>('button')[0].click();
      await fixture.whenStable();
      expect(store.tweaks[key]()).toBe(true);
    }
  });

  it('renders every extracted panel and isolates drafts from a new sidebar instance', async () => {
    const store = TestBed.inject(BookStore);
    const fixture = TestBed.createComponent(SidebarComponent);
    for (const nav of [
      'styles',
      'metadata',
      'settings',
      'dictionary',
      'productivity',
      'export',
      'search',
      'attachments',
      'layout',
    ] as const) {
      store.setNav(nav);
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('app-sidebar-' + nav)).not.toBeNull();
    }
    fixture.destroy();
    store.createNewProject();
    store.setNav('metadata');
    const next = TestBed.createComponent(SidebarComponent);
    await next.whenStable();
    expect(next.nativeElement.querySelector('input[type="text"]').value).toBe(store.book()!.title);
  });
});
