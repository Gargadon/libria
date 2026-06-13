import { Component, inject, input, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-tweaks-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="tp">
      <div class="tp__h">
        <div class="tp__title">{{ title() }}</div>
        <button class="tp__close" (click)="store.updateUi({ showTweaks: false })">×</button>
      </div>
      <div class="tp__body">
        <div class="tp__section">{{ 'tweaks.layout' | translate }}</div>
        <div class="tp__row">
          <div class="tp__label">{{ 'tweaks.sidebar' | translate }}</div>
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

        <div class="tp__section">{{ 'tweaks.typography' | translate }}</div>
        <div class="tp__row">
          <div class="tp__label">{{ 'tweaks.body' | translate }}</div>
          <div class="tp__radio">
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="store.tweaks.bookFont() === 'spectral' && !store.tweaks.customBookFont()"
              (click)="setBookFont('spectral')"
            >spectral</button>
            <button 
              class="tp__opt" 
              [class.tp__opt--on]="store.tweaks.bookFont() === 'lora' && !store.tweaks.customBookFont()"
              (click)="setBookFont('lora')"
            >lora</button>
          </div>
        </div>
        @if (store.tweaks.customBookFont() !== null) {
          <div class="tp__row tp__row--col">
            <input class="tp__input" type="text" [ngModel]="store.tweaks.customBookFont()" (ngModelChange)="store.updateTweak('customBookFont', $event)" placeholder="Georgia">
          </div>
        }
        <button class="tp__link" (click)="setBookFont('__custom__')">{{ 'sidebar.customFont' | translate }}</button>

        <div class="tp__section">{{ 'sidebar.spelling' | translate }}</div>
        <div class="tp__row">
          <div class="tp__label">{{ 'sidebar.checker' | translate }}</div>
          <div class="tp__radio">
            <button
              class="tp__opt"
              [class.tp__opt--on]="store.tweaks.spellcheck()"
              (click)="store.updateTweak('spellcheck', true)"
            >{{ 'sidebar.yes' | translate }}</button>
            <button
              class="tp__opt"
              [class.tp__opt--on]="!store.tweaks.spellcheck()"
              (click)="store.updateTweak('spellcheck', false)"
            >{{ 'sidebar.no' | translate }}</button>
          </div>
        </div>

        <div class="tp__row">
          <div class="tp__label">{{ 'sidebar.smartQuotes' | translate }}</div>
          <div class="tp__radio">
            <button
              class="tp__opt"
              [class.tp__opt--on]="store.tweaks.smartQuotes()"
              (click)="store.updateTweak('smartQuotes', true)"
            >{{ 'sidebar.yes' | translate }}</button>
            <button
              class="tp__opt"
              [class.tp__opt--on]="!store.tweaks.smartQuotes()"
              (click)="store.updateTweak('smartQuotes', false)"
            >{{ 'sidebar.no' | translate }}</button>
          </div>
        </div>

        <div class="tp__row">
          <div class="tp__label">{{ 'sidebar.smartDashes' | translate }}</div>
          <div class="tp__radio">
            <button
              class="tp__opt"
              [class.tp__opt--on]="store.tweaks.smartDashes()"
              (click)="store.updateTweak('smartDashes', true)"
            >{{ 'sidebar.yes' | translate }}</button>
            <button
              class="tp__opt"
              [class.tp__opt--on]="!store.tweaks.smartDashes()"
              (click)="store.updateTweak('smartDashes', false)"
            >{{ 'sidebar.no' | translate }}</button>
          </div>
        </div>

        <div class="tp__row">
          <div class="tp__label">{{ 'sidebar.smartEllipsis' | translate }}</div>
          <div class="tp__radio">
            <button
              class="tp__opt"
              [class.tp__opt--on]="store.tweaks.smartEllipsis()"
              (click)="store.updateTweak('smartEllipsis', true)"
            >{{ 'sidebar.yes' | translate }}</button>
            <button
              class="tp__opt"
              [class.tp__opt--on]="!store.tweaks.smartEllipsis()"
              (click)="store.updateTweak('smartEllipsis', false)"
            >{{ 'sidebar.no' | translate }}</button>
          </div>
        </div>

        <div class="tp__section">{{ 'tweaks.export' | translate }}</div>
        <div class="tp__row">
          <div class="tp__label">{{ 'sidebar.pdfx' | translate }}</div>
          <div class="tp__radio">
            <button
              class="tp__opt"
              [class.tp__opt--on]="store.tweaks.pdfxCompliant()"
              (click)="store.updateTweak('pdfxCompliant', true)"
            >{{ 'sidebar.yes' | translate }}</button>
            <button
              class="tp__opt"
              [class.tp__opt--on]="!store.tweaks.pdfxCompliant()"
              (click)="store.updateTweak('pdfxCompliant', false)"
            >{{ 'sidebar.no' | translate }}</button>
          </div>
        </div>
        </div>
        </div>  `
})
export class TweaksPanelComponent {
  readonly store = inject(BookStore);
  readonly title = input<string>('Tweaks');

  setBookFont(val: string) {
    if (val === '__custom__') {
      this.store.updateTweak('customBookFont', '');
    } else {
      this.store.updateTweak('bookFont', val as any);
      this.store.updateTweak('customBookFont', null);
    }
  }
}
