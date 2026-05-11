import { Component, inject, input } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-tweaks-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tp">
      <div class="tp__h">
        <div class="tp__title">{{ title() }}</div>
        <button class="tp__close" (click)="store.updateUi({ showTweaks: false })">×</button>
      </div>
      <div class="tp__body">
        <div class="tp__section">Disposición</div>
        <div class="tp__row">
          <div class="tp__label">Barra lateral</div>
          <div class="tp__radio">
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="store.tweaks.sidebar() === 'left'"
              (click)="store.updateTweak('sidebar', 'left')"
            >left</button>
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="store.tweaks.sidebar() === 'right'"
              (click)="store.updateTweak('sidebar', 'right')"
            >right</button>
          </div>
        </div>

        <div class="tp__section">Tipografía</div>
        <div class="tp__row">
          <div class="tp__label">Cuerpo</div>
          <div class="tp__radio">
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="store.tweaks.bookFont() === 'spectral'"
              (click)="store.updateTweak('bookFont', 'spectral')"
            >spectral</button>
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="store.tweaks.bookFont() === 'lora'"
              (click)="store.updateTweak('bookFont', 'lora')"
            >lora</button>
          </div>
        </div>

        <div class="tp__section">Ortografía</div>
        <div class="tp__row">
          <div class="tp__label">Revisión</div>
          <div class="tp__radio">
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="store.tweaks.spellcheck()"
              (click)="store.updateTweak('spellcheck', true)"
            >sí</button>
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="!store.tweaks.spellcheck()"
              (click)="store.updateTweak('spellcheck', false)"
            >no</button>
          </div>
        </div>
        <div class="tp__row" [style.opacity]="store.tweaks.spellcheck() ? '1' : '0.5'" [style.pointer-events]="store.tweaks.spellcheck() ? 'auto' : 'none'">
          <div class="tp__label">Idioma</div>
          <select class="tp__select" [ngModel]="store.tweaks.spellcheckLang()" (ngModelChange)="store.updateTweak('spellcheckLang', $event)">
            <option value="es-MX">Español (México)</option>
            <option value="es-ES">Español (España)</option>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="fr">Français</option>
            <option value="it">Italiano</option>
          </select>
        </div>
      </div>
    </div>
  `
})
export class TweaksPanelComponent {
  readonly store = inject(BookStore);
  readonly title = input<string>('Tweaks');
}
