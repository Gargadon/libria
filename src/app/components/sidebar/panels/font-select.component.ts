import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

interface FontOption {
  value: string;
  label: string;
  family: string;
  translate?: boolean;
}

let nextFontSelectId = 0;

@Component({
  selector: 'app-font-select',
  standalone: true,
  imports: [TranslateModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      #trigger
      type="button"
      class="sb__select sb__select--font font-select__trigger"
      [id]="id + '-trigger'"
      [style.font-family]="fontFamily()"
      aria-haspopup="listbox"
      [attr.aria-expanded]="isOpen()"
      [attr.aria-controls]="id"
      [attr.aria-label]="
        ('sidebar.font' | translate) +
        ': ' +
        (selected().translate ? (selected().label | translate) : selected().label)
      "
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
    >
      <span>{{ selected().translate ? (selected().label | translate) : selected().label }}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </button>
    <div
      #menu
      class="font-select__menu"
      popover="auto"
      role="listbox"
      [id]="id"
      [attr.aria-label]="'sidebar.font' | translate"
      (toggle)="onToggle($event)"
      (keydown)="onMenuKeydown($event)"
    >
      @for (group of groups(); track group.label) {
        @if (group.options.length) {
          <div role="group" [attr.aria-label]="group.label | translate">
            <div class="font-select__group" aria-hidden="true">{{ group.label | translate }}</div>
            @for (option of group.options; track option.value) {
              <ng-container *ngTemplateOutlet="fontOption; context: { $implicit: option }" />
            }
          </div>
        }
      }
      <ng-container *ngTemplateOutlet="fontOption; context: { $implicit: customOption }" />
    </div>
    <ng-template #fontOption let-option>
      <button
        type="button"
        role="option"
        tabindex="-1"
        class="font-select__option"
        [attr.aria-selected]="value() === option.value"
        [attr.data-value]="option.value"
        [style.font-family]="option.family"
        (click)="choose(option.value)"
      >
        <span>{{ option.translate ? (option.label | translate) : option.label }}</span>
        @if (value() === option.value) {
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="m3 7 2.5 2.5L11 4" fill="none" stroke="currentColor" stroke-width="1.5" />
          </svg>
        }
      </button>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
      flex-shrink: 0;
    }
    .font-select__trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      text-align: left;
      cursor: pointer;
    }
    .font-select__trigger span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    svg {
      flex-shrink: 0;
    }
    .font-select__trigger:focus-visible {
      outline: 2px solid var(--ink-soft);
      outline-offset: 2px;
    }
    .font-select__menu {
      position: fixed;
      inset: auto;
      margin: 0;
      padding: 4px;
      overflow-y: auto;
      overscroll-behavior: contain;
      background: var(--paper-2);
      color: var(--ink);
      border: 1px solid var(--rule);
      border-radius: 8px;
      scrollbar-color: var(--ink-mute) var(--paper-2);
    }
    .font-select__group {
      padding: 8px 8px 4px;
      color: var(--ink-soft);
      font: 600 11px/1.4 var(--ui);
    }
    .font-select__option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      padding: 6px 8px;
      border: 0;
      border-radius: 4px;
      background: transparent;
      color: inherit;
      text-align: left;
      font-size: 15px;
      line-height: 1.5;
      cursor: pointer;
    }
    .font-select__option span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .font-select__option:hover,
    .font-select__option:focus {
      background: var(--paper-3);
      outline: 1px solid var(--rule);
      outline-offset: -1px;
    }
    .font-select__option[aria-selected='true'] {
      background: var(--paper-3);
    }
  `,
})
export class FontSelectComponent {
  readonly value = input.required<string>();
  readonly fontFamily = input.required<string>();
  readonly systemFonts = input<string[]>([]);
  readonly valueChange = output<string>();
  readonly id = `font-select-${nextFontSelectId++}`;
  readonly isOpen = signal(false);
  readonly customOption: FontOption = {
    value: '__custom__',
    label: 'sidebar.customFont',
    family: 'var(--ui)',
    translate: true,
  };
  readonly groups = computed(() => [
    {
      label: 'sidebar.serif',
      options: [
        { value: 'eb-garamond', label: 'EB Garamond', family: '"EB Garamond", serif' },
        { value: 'crimson-pro', label: 'Crimson Pro', family: '"Crimson Pro", serif' },
        { value: 'lora', label: 'Lora', family: '"Lora", serif' },
        { value: 'spectral', label: 'Spectral', family: '"Spectral", serif' },
      ],
    },
    {
      label: 'sidebar.sansSerif',
      options: [
        { value: 'inter', label: 'Inter', family: '"Inter", sans-serif' },
        { value: 'montserrat', label: 'Montserrat', family: '"Montserrat", sans-serif' },
      ],
    },
    {
      label: 'sidebar.systemFonts',
      options: this.systemFonts().map((family) => ({
        value: family,
        label: family,
        family: JSON.stringify(family),
      })),
    },
  ]);
  readonly options = computed<FontOption[]>(() => [
    ...this.groups().flatMap((group) => group.options),
    this.customOption,
  ]);
  readonly selected = computed(
    () => this.options().find((option) => option.value === this.value()) ?? this.customOption,
  );
  @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;
  @ViewChild('menu', { static: true }) private menu!: ElementRef<HTMLElement>;
  private readonly document = inject(DOCUMENT);
  private search = '';
  private searchTime = 0;

  constructor() {
    const closeOnScroll = (event: Event) => {
      if (
        this.isOpen() &&
        event.target instanceof Node &&
        !this.menu.nativeElement.contains(event.target)
      )
        this.close(false);
    };
    const closeOnResize = () => this.close(false);
    this.document.addEventListener('scroll', closeOnScroll, true);
    this.document.defaultView?.addEventListener('resize', closeOnResize);
    inject(DestroyRef).onDestroy(() => {
      this.document.removeEventListener('scroll', closeOnScroll, true);
      this.document.defaultView?.removeEventListener('resize', closeOnResize);
    });
  }

  toggle() {
    this.isOpen() ? this.close() : this.open();
  }

  private open(index = this.options().findIndex((option) => option.value === this.value())) {
    const menu = this.menu.nativeElement;
    menu.showPopover();
    this.isOpen.set(true);
    this.search = '';
    const rect = this.trigger.nativeElement.getBoundingClientRect();
    const view = this.document.defaultView!;
    const width = Math.min(Math.max(rect.width, 250), view.innerWidth - 16);
    menu.style.width = `${width}px`;
    const below = view.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const down = below >= Math.min(320, menu.scrollHeight) || below >= above;
    const height = Math.min(320, Math.max(0, down ? below : above));
    menu.style.maxHeight = `${height}px`;
    menu.style.left = `${Math.max(8, Math.min(rect.right - width, view.innerWidth - width - 8))}px`;
    menu.style.top = `${down ? rect.bottom + 4 : Math.max(8, rect.top - Math.min(height, menu.scrollHeight) - 4)}px`;
    this.focusOption(Math.max(0, index));
  }

  private close(restoreFocus = true) {
    if (!this.isOpen()) return;
    this.menu.nativeElement.hidePopover();
    this.isOpen.set(false);
    if (restoreFocus) this.trigger.nativeElement.focus({ preventScroll: true });
  }

  onToggle(event: Event) {
    this.isOpen.set((event as ToggleEvent).newState === 'open');
  }
  choose(value: string) {
    this.valueChange.emit(value);
    this.close();
  }

  onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.open();
    }
  }

  private optionButtons() {
    return Array.from(
      this.menu.nativeElement.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );
  }
  private focusOption(index: number) {
    const option = this.optionButtons()[index];
    option?.focus({ preventScroll: true });
    option?.scrollIntoView({ block: 'nearest' });
  }

  onMenuKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
      }
      this.close();
      return;
    }
    const buttons = this.optionButtons();
    const current = buttons.findIndex((button) => button === this.document.activeElement);
    let next: number;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(buttons.length - 1, current + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, current - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = buttons.length - 1;
        break;
      default: {
        if (
          event.key.length !== 1 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.key === ' '
        )
          return;
        const now = Date.now();
        this.search =
          now - this.searchTime < 700
            ? this.search + event.key.toLocaleLowerCase()
            : event.key.toLocaleLowerCase();
        this.searchTime = now;
        const query = [...this.search].every((char) => char === this.search[0])
          ? this.search[0]
          : this.search;
        const start = query.length === 1 ? current + 1 : Math.max(0, current);
        const match = buttons.findIndex((_, offset) =>
          buttons[(start + offset) % buttons.length]
            .textContent!.trim()
            .toLocaleLowerCase()
            .startsWith(query),
        );
        if (match < 0) return;
        next = (start + match) % buttons.length;
      }
    }
    event.preventDefault();
    this.focusOption(next);
  }
}
