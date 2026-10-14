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

  it('renders every extracted panel and isolates drafts from a new sidebar instance', async () => {
    const store = TestBed.inject(BookStore);
    const fixture = TestBed.createComponent(SidebarComponent);
    for (const nav of [
      'styles',
      'metadata',
      'settings',
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
