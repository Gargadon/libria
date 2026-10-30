import { TestBed } from '@angular/core/testing';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FontSelectComponent } from './font-select.component';

describe('font selector', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [
        FontSelectComponent,
        TranslateModule.forRoot({
          loader: { provide: TranslateLoader, useValue: { getTranslation: () => of({}) } },
        }),
      ],
    });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function createSelector() {
    const fixture = TestBed.createComponent(FontSelectComponent);
    fixture.componentRef.setInput('value', 'lora');
    fixture.componentRef.setInput('fontFamily', '"Lora", serif');
    fixture.componentRef.setInput('systemFonts', ['System Serif']);
    await fixture.whenStable();
    // jsdom has no popover layout; real-browser checks cover light dismissal
    // and positioning. These tests exercise selection and keyboard behavior.
    const root: HTMLElement = fixture.nativeElement;
    Object.assign(root.querySelector('[role="listbox"]')!, {
      showPopover: vi.fn(), hidePopover: vi.fn(),
    });
    root.querySelectorAll('[role="option"]').forEach(option => {
      Object.assign(option, { scrollIntoView: vi.fn() });
    });
    return fixture;
  }

  it('renders bundled and system choices with their own font families', async () => {
    const fixture = await createSelector();
    const root: HTMLElement = fixture.nativeElement;
    const lora = root.querySelector<HTMLElement>('[data-value="lora"]')!;
    const inter = root.querySelector<HTMLElement>('[data-value="inter"]')!;
    const system = root.querySelector<HTMLElement>('[data-value="System Serif"]')!;
    expect(lora.style.fontFamily).toContain('Lora');
    expect(inter.style.fontFamily).toContain('Inter');
    expect(system.style.fontFamily).toContain('System Serif');
    expect(lora.getAttribute('aria-selected')).toBe('true');
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    system.click();
    expect(changed).toHaveBeenCalledWith('System Serif');
    root.querySelector<HTMLElement>('[data-value="__custom__"]')!.click();
    expect(changed).toHaveBeenCalledWith('__custom__');
  });

  it('navigates by keyboard, searches names, and restores focus without selecting on Escape', async () => {
    const fixture = await createSelector();
    const root: HTMLElement = fixture.nativeElement;
    const trigger = root.querySelector<HTMLButtonElement>('.font-select__trigger')!;
    const menu = root.querySelector<HTMLElement>('[role="listbox"]')!;
    const key = (target: HTMLElement, value: string) =>
      target.dispatchEvent(
        new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }),
      );
    const changed = vi.fn();
    fixture.componentInstance.valueChange.subscribe(changed);
    key(trigger, 'ArrowDown');
    expect((document.activeElement as HTMLElement).dataset['value']).toBe('lora');
    key(menu, 'ArrowDown');
    expect((document.activeElement as HTMLElement).dataset['value']).toBe('spectral');
    key(menu, 'End');
    expect((document.activeElement as HTMLElement).dataset['value']).toBe('__custom__');
    key(menu, 'Home');
    expect((document.activeElement as HTMLElement).dataset['value']).toBe('eb-garamond');
    for (const char of 'mon') key(menu, char);
    expect((document.activeElement as HTMLElement).dataset['value']).toBe('montserrat');
    key(menu, 'Escape');
    expect(document.activeElement).toBe(trigger);
    expect(fixture.componentInstance.isOpen()).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });
});
