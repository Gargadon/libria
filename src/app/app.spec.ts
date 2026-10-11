import { describe, it, expect, beforeEach } from 'vitest';
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

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
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
