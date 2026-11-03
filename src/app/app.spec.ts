import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { Observable, of } from 'rxjs';
import { App } from './app';
import es from '../../public/i18n/es.json';
import en from '../../public/i18n/en.json';

const translations: Record<string, Record<string, string>> = { es, en };

class FakeTranslateLoader implements TranslateLoader {
  getTranslation(lang: string): Observable<Record<string, string>> {
    return of(translations[lang] || {});
  }
}

describe('App', () => {
  afterEach(() => { delete window.desktopAPI; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        App,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useClass: FakeTranslateLoader },
          defaultLanguage: 'es'
        })
      ]
    }).compileComponents();
  });

  it.each([
    { update: '2.1.2', expected: 'https://github.com/Gargadon/libria/releases/latest' },
    { update: { version: '2.1.2' }, expected: 'https://github.com/Gargadon/libria/releases/latest' },
    { update: { version: '2.1.2', url: '' }, expected: 'https://github.com/Gargadon/libria/releases/latest' },
    { update: { version: '2.1.2', url: 'https://github.com/Gargadon/libria/releases/download/v2.1.2/libria-2.1.2-win-x64.exe' }, expected: 'https://github.com/Gargadon/libria/releases/download/v2.1.2/libria-2.1.2-win-x64.exe' },
  ])('offers a working download for update $update', async ({ update, expected }) => {
    let notify!: (value: unknown) => void;
    const openExternal = vi.fn().mockResolvedValue(undefined);
    window.desktopAPI = {
      onUpdateAvailable: (callback: typeof notify) => { notify = callback; },
      openExternal,
      setSpellCheckerLanguage: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopAPI;
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    notify(update);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('.update-banner__action') as HTMLButtonElement;
    expect(button).not.toBeNull();
    button.click();
    await fixture.whenStable();
    expect(openExternal).toHaveBeenCalledWith(expected);
    expect(fixture.componentInstance.updateVersion()?.version).toBe('2.1.2');
  });

  it('reports a failed download link and keeps the action available for retry', async () => {
    window.desktopAPI = { openExternal: vi.fn().mockRejectedValue(new Error('opener failed')), setSpellCheckerLanguage: vi.fn().mockResolvedValue(undefined) } as unknown as DesktopAPI;
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.updateVersion.set({ version: '2.1.2' });
    await app.openUpdate();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.check-result')?.textContent).toContain('No se pudo abrir la descarga');
    expect(fixture.nativeElement.querySelector('.update-banner__action')).not.toBeNull();
  });

  it('opens a native file drop from the welcome screen and retains its path', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    let drop!: (paths: string[]) => void;
    const readFile = vi.fn();
    window.desktopAPI = {
      onFilesDropped: (callback: typeof drop) => { drop = callback; },
      readFile,
      driveCachedLink: vi.fn().mockResolvedValue(null),
      setSpellCheckerLanguage: vi.fn().mockResolvedValue(undefined),
    } as unknown as DesktopAPI;
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.store.createNewProject();
    const content = app.fileService.documentContent();
    app.fileService.closeProject();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-welcome')).not.toBeNull();
    readFile.mockResolvedValue(content);
    drop(['/books/novel.libria']);
    await vi.waitFor(() => expect(app.fileService.currentPath).toBe('/books/novel.libria'));
    await fixture.whenStable();
    expect(app.store.book()).toBeTruthy();
    expect(fixture.nativeElement.querySelector('app-welcome')).toBeNull();
    expect(app.fileService.canSilentSave).toBe(true);
  });

  it('handles file drops without intercepting chapter drags', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    const open = vi.spyOn(app.fileService, 'openDroppedFiles').mockResolvedValue();
    const file = new File(['{}'], 'book.libria');
    const event = (types: string[]) => ({
      dataTransfer: { types, files: [file], dropEffect: 'none' },
      preventDefault: vi.fn(),
    });
    const chapter = event(['text/plain']);
    app.onFileDragOver(chapter as unknown as DragEvent);
    await app.onFileDrop(chapter as unknown as DragEvent);
    expect(chapter.preventDefault).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    const drop = event(['Files']);
    app.onFileDragOver(drop as unknown as DragEvent);
    expect(drop.dataTransfer.dropEffect).toBe('copy');
    await app.onFileDrop(drop as unknown as DragEvent);
    expect(drop.preventDefault).toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith([file]);
  });

  it('preserves the current document on cancelled or invalid drops and clears its save target on success', async () => {
    const app = TestBed.createComponent(App).componentInstance;
    const files = app.fileService;
    app.store.createNewProject();
    const content = files.documentContent();
    files.currentPath = '/old.libria';
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const dropped = { name: 'book.LIBRIA', text: async () => content } as File;
    await files.openDroppedFiles([dropped]);
    expect(confirm).toHaveBeenCalled();
    expect(files.currentPath).toBe('/old.libria');
    confirm.mockReturnValue(true);
    await files.openDroppedFiles([{ name: 'bad.libria', text: async () => '{}' } as File]);
    expect(files.currentPath).toBe('/old.libria');
    expect(window.alert).toHaveBeenCalled();
    await files.openDroppedFiles([dropped]);
    expect(files.currentPath).toBeNull();
    expect(files.driveLink()).toBeNull();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('opens spelling with F7 only when a chapter is available', () => {
    const app = TestBed.createComponent(App).componentInstance;
    const key = () => new KeyboardEvent('keydown', { key: 'F7', cancelable: true });
    app.onKeydown(key());
    expect(app.showSpellcheck()).toBe(false);
    app.store.createNewProject();
    app.store.updateTweak('spellcheck', false);
    const event = key();
    app.onKeydown(event);
    expect(event.defaultPrevented).toBe(true);
    expect(app.showSpellcheck()).toBe(true);
    expect(app.store.tweaks.spellcheck()).toBe(true);
  });

  it('blocks the native context menu everywhere, including editable fields', () => {
    const fixture = TestBed.createComponent(App);
    const root = fixture.nativeElement as HTMLElement;
    for (const html of [
      '<button>Menu</button>',
      '<div contenteditable="true" spellcheck="true"><em>texto</em></div>',
      '<div contenteditable="true" spellcheck="false"><em>code</em></div>',
      '<textarea>texto</textarea>',
      '<input type="text">',
      '<input type="password">',
      '<input type="text" readonly>',
      '<div contenteditable="true"><span contenteditable="false">imagen</span></div>',
    ] as const) {
      const container = document.createElement('div');
      container.innerHTML = html;
      root.append(container);
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      (container.querySelector('em, span') || container.firstElementChild)!.dispatchEvent(event);
      expect(event.defaultPrevented, html).toBe(true);
      container.remove();
    }
  });

  it('should render brand name', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.tb__brandN')?.textContent).toContain('Libria');
  });

  it('disables document actions in the welcome hamburger menu', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    root.querySelector<HTMLButtonElement>('.tb__sysmenu--compact > button')!.click();
    fixture.detectChanges();
    const actions = [...root.querySelectorAll<HTMLButtonElement>('.tb__sysmenu--compact .tb__compact-item')];
    const byIcon = (icon: string) => actions.find(button => button.querySelector('span')?.textContent?.trim() === icon)!;
    for (const icon of ['save', 'save_as', 'close_fullscreen', 'undo', 'redo', 'search']) {
      expect(byIcon(icon).disabled, icon).toBe(true);
    }
    for (const icon of ['note_add', 'folder_open', 'info']) {
      expect(byIcon(icon).disabled, icon).toBe(false);
    }
  });
});
