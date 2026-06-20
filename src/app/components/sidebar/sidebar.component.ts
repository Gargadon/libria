import { Component, inject, computed, signal, HostListener, OnInit, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { AssetService } from '../../services/asset.service';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Book, ChapterKind, ChapterTemplateId } from '../../models/book.models';
import { FormsModule } from '@angular/forms';
import { ExportService } from '../../services/export.service';
import { ImportService } from '../../services/import.service';
import { SpellCheckService } from '../../services/spell-check.service';
import { FontService } from '../../services/font.service';
import { InputModalComponent } from '../modals/input-modal.component';
import { ConfirmModalComponent } from '../modals/confirm-modal.component';

import { environment } from '../../../environments/environment';

const BUNDLED_FONT_KEYS = ['spectral', 'lora', 'eb-garamond', 'crimson-pro', 'inter', 'montserrat'];

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule, InputModalComponent, ConfirmModalComponent],
  template: `
    <aside class="sb">
      <button class="sb__close" (click)="store.closeSidebar()">
        <span class="material-symbols-outlined">close</span>
      </button>

      @switch (store.ui.activeNav()) {

        <!-- MANUSCRIPT VIEW -->
        @case ('manuscript') {
          <div class="sb__head">
            <div class="sb__crumb">
              <span class="sb__dot"></span>
              <span>{{ 'sidebar.library' | translate }}</span>
            </div>
            <div class="sb__title">{{ store.book()?.title }}</div>
            <div class="sb__author">{{ 'sidebar.by' | translate }} {{ store.book()?.authors?.[0] ?? ('sidebar.noAuthor' | translate) }}</div>

            <div class="sb__stats">
              <div class="sb__stat">
                <div class="sb__statN">{{ store.totalWords().toLocaleString(currentLang()) }}</div>
                <div class="sb__statL">{{ 'sidebar.words' | translate }}</div>
              </div>
              <div class="sb__stat">
                <div class="sb__statN">~{{ store.totalReadMin() }}<span>m</span></div>
                <div class="sb__statL">{{ 'sidebar.reading' | translate }}</div>
              </div>
              <div class="sb__stat">
                <div class="sb__statN">{{ store.mainChaptersCount() }}</div>
                <div class="sb__statL">{{ 'sidebar.chapters' | translate }}</div>
              </div>
            </div>
          </div>

          @if (store.writingGoals.targetWords() > 0 || store.writingGoals.deadline()) {
            <div class="sb__goals">
              @if (store.writingGoals.targetWords() > 0) {
                <div class="sb__goals-label">
                  {{ 'sidebar.goalsProgress' | translate:{ current: store.totalWords().toLocaleString(currentLang()), target: store.writingGoals.targetWords().toLocaleString(currentLang()) } }}
                </div>
                <div class="sb__goals-bar">
                  <div class="sb__goals-fill" [style.width.%]="store.wordsProgress()"></div>
                </div>
              }
              @if (store.daysToDeadline() !== null) {
                <div class="sb__goals-deadline" [class.sb__goals-deadline--warn]="(store.daysToDeadline() ?? 99) <= 7">
                  @if ((store.daysToDeadline() ?? 0) > 0) {
                    {{ 'sidebar.goalsDeadlineDays' | translate:{ days: store.daysToDeadline() } }}
                  } @else if ((store.daysToDeadline() ?? 0) === 0) {
                    {{ 'sidebar.goalsDeadlineToday' | translate }}
                  } @else {
                    {{ 'sidebar.goalsDeadlineOver' | translate:{ days: Math.abs(store.daysToDeadline() ?? 0) } }}
                  }
                </div>
              }
            </div>
          }

          <div class="sb__content">
            <ng-container *ngTemplateOutlet="groupTemplate; context: { label: ('sidebar.preliminares' | translate), items: frontChapters() }"></ng-container>
            <ng-container *ngTemplateOutlet="groupTemplate; context: { label: ('sidebar.body' | translate), items: mainChapters(), numbered: true }"></ng-container>
            <ng-container *ngTemplateOutlet="groupTemplate; context: { label: ('sidebar.posliminares' | translate), items: backChapters() }"></ng-container>

            @if (store.activeChapter(); as active) {
              <div class="sb__section">{{ 'sidebar.elementSettings' | translate }}</div>
              @if (active.kind === 'chapter') {
                <div class="sb__row">
                  <div class="sb__label">{{ 'sidebar.chapterStatus' | translate }}</div>
                  <div class="sb__radio">
                    <button class="sb__opt sb__opt--status-ok" [class.sb__opt--on]="active.status === 'ok'" (click)="store.updateChapterMeta(active.id, { status: 'ok' })">{{ 'sidebar.statusOk' | translate }}</button>
                    <button class="sb__opt sb__opt--status-draft" [class.sb__opt--on]="active.status === 'draft' || !active.status" (click)="store.updateChapterMeta(active.id, { status: 'draft' })">{{ 'sidebar.statusDraft' | translate }}</button>
                    <button class="sb__opt sb__opt--status-outline" [class.sb__opt--on]="active.status === 'outline'" (click)="store.updateChapterMeta(active.id, { status: 'outline' })">{{ 'sidebar.statusOutline' | translate }}</button>
                  </div>
                </div>
              }
              <div class="sb__row">
                <div class="sb__label">{{ 'sidebar.oddPage' | translate }}</div>
                <div class="sb__radio">
                  <button class="sb__opt" [class.sb__opt--on]="active.forceOddPage" (click)="store.updateChapterMeta(active.id, { forceOddPage: true })">{{ 'sidebar.yes' | translate }}</button>
                  <button class="sb__opt" [class.sb__opt--on]="!active.forceOddPage" (click)="store.updateChapterMeta(active.id, { forceOddPage: false })">{{ 'sidebar.no' | translate }}</button>
                </div>
              </div>
              <div class="sb__help">{{ 'sidebar.oddPageHelp' | translate }}</div>
            }
          </div>

          <div class="sb__foot">
            @if (showGoalsEditor()) {
              <div class="sb__goals-editor">
                <div class="sb__goals-editor-title">{{ 'sidebar.goalsTitle' | translate }}</div>
                <div class="sb__row sb__row--col">
                  <label class="sb__label">{{ 'sidebar.goalsTargetWords' | translate }}</label>
                  <input type="number" class="sb__input" min="0" step="1000"
                    [ngModel]="store.writingGoals.targetWords()"
                    (ngModelChange)="updateGoalWords($event)">
                </div>
                <div class="sb__row sb__row--col">
                  <label class="sb__label">{{ 'sidebar.goalsDeadlineLabel' | translate }}</label>
                  <input type="date" class="sb__input"
                    [ngModel]="store.writingGoals.deadline()"
                    (ngModelChange)="updateGoalDeadline($event)">
                </div>
                <button class="sb__btn-link" (click)="showGoalsEditor.set(false)">{{ 'sidebar.goalsDone' | translate }}</button>
              </div>
            } @else {
              <button class="sb__action-btn" (click)="showGoalsEditor.set(true)">
                <span class="material-symbols-outlined">flag</span>
                {{ 'sidebar.goalsEdit' | translate }}
              </button>
            }
            <div class="sb__add-wrapper">
              <button class="sb__add" (click)="toggleAddMenu($event)">{{ 'sidebar.addElement' | translate }}</button>
              @if (showAddMenu()) {
                <div class="sb__add-menu">
                  <div class="sb__add-item sb__add-item--group" (click)="toggleFrontSubmenu($event)">
                    <span>{{ 'sidebar.addFront' | translate }}</span>
                    <span class="sb__add-arrow" [class.sb__add-arrow--open]="showFrontSubmenu()">›</span>
                  </div>
                  @if (showFrontSubmenu()) {
                    <div class="sb__add-submenu">
                      <div class="sb__add-item sb__add-item--sub" (click)="addFromTemplate('title-page')">{{ 'sidebar.templateTitlePage' | translate }}</div>
                      <div class="sb__add-item sb__add-item--sub" (click)="addFromTemplate('credits')">{{ 'sidebar.templateCredits' | translate }}</div>
                      <div class="sb__add-item sb__add-item--sub" (click)="addFromTemplate('dedication')">{{ 'sidebar.templateDedication' | translate }}</div>
                      <div class="sb__add-item sb__add-item--sub" (click)="addFromTemplate('acknowledgments')">{{ 'sidebar.templateAcknowledgments' | translate }}</div>
                      <div class="sb__add-item sb__add-item--sub" (click)="addFromTemplate('toc')">{{ 'sidebar.templateToc' | translate }}</div>
                      <div class="sb__add-item sb__add-item--sub sb__add-item--sep" (click)="add('front')">{{ 'sidebar.addFrontBlank' | translate }}</div>
                    </div>
                  }
                  <div class="sb__add-item" (click)="add('chapter')">{{ 'sidebar.addChapter' | translate }}</div>
                  <div class="sb__add-item" (click)="add('back')">{{ 'sidebar.addBack' | translate }}</div>
                </div>
              }
            </div>
            
            <button class="sb__action-btn" (click)="triggerImport()" [disabled]="importing()">
              @if (importing()) {
                <span class="sb__spinner"></span>
              } @else {
                <span class="material-symbols-outlined">publish</span>
              }
              {{ 'sidebar.importFile' | translate }}
            </button>
            <input type="file" #importInput hidden (change)="onImportFile($event)" accept=".docx,.txt">

            <div class="sb__legend">
              <span><i class="lg lg--ok"></i> {{ 'sidebar.reviewed' | translate }}</span>
              <span><i class="lg lg--draft"></i> {{ 'sidebar.draft' | translate }}</span>
              <span><i class="lg lg--out"></i> {{ 'sidebar.outline' | translate }}</span>
            </div>
          </div>
        }

        <!-- STYLES VIEW -->
        @case ('styles') {
          <div class="sb__head">
            <div class="sb__title">{{ 'sidebar.stylesTitle' | translate }}</div>
            <div class="sb__author">{{ 'sidebar.stylesDesc' | translate }}</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">{{ 'sidebar.bodyTypography' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.font' | translate }}</div>
              <select class="sb__select sb__select--font"
                      [value]="bookFontSelectVal()"
                      (change)="onBookFontSelect($any($event.target).value)">
                <optgroup [label]="'sidebar.serif' | translate">
                  <option value="eb-garamond" style="font-family: 'EB Garamond', serif">EB Garamond</option>
                  <option value="crimson-pro" style="font-family: 'Crimson Pro', serif">Crimson Pro</option>
                  <option value="lora" style="font-family: 'Lora', serif">Lora</option>
                  <option value="spectral" style="font-family: 'Spectral', serif">Spectral</option>
                </optgroup>
                <optgroup [label]="'sidebar.sansSerif' | translate">
                  <option value="inter" style="font-family: 'Inter', sans-serif">Inter</option>
                  <option value="montserrat" style="font-family: 'Montserrat', sans-serif">Montserrat</option>
                </optgroup>
                @if (systemFontFamilies().length > 0) {
                  <optgroup [label]="'sidebar.systemFonts' | translate">
                    @for (family of systemFontFamilies(); track family) {
                      <option [value]="family" [style.fontFamily]="family">{{ family }}</option>
                    }
                  </optgroup>
                }
                <option value="__custom__">{{ 'sidebar.customFont' | translate }}</option>
              </select>
            </div>
            @if (showCustomBookFontInput()) {
              <div class="sb__row sb__row--col">
                <label class="sb__label">{{ 'sidebar.customFontName' | translate }}</label>
                <input class="sb__input" type="text" [ngModel]="store.tweaks.customBookFont()" (ngModelChange)="store.updateTweak('customBookFont', $event)" placeholder="Georgia">
              </div>
            }

            <div class="sb__section">{{ 'sidebar.paragraph' | translate }}</div>
            <div class="sb__row sb__row--col">
              <div class="sb__label">{{ 'sidebar.fontSize' | translate:{ value: store.tweaks.fontSize() } }}</div>
              <input type="range" min="8" max="16" step="0.5"
                     [ngModel]="store.tweaks.fontSize()" 
                     (ngModelChange)="store.updateTweak('fontSize', $event)">
            </div>

            <div class="sb__row sb__row--col">
              <div class="sb__label">{{ 'sidebar.lineHeight' | translate:{ value: store.tweaks.lineHeight() } }}</div>
              <input type="range" min="1" max="2.5" step="0.1" 
                     [ngModel]="store.tweaks.lineHeight()" 
                     (ngModelChange)="store.updateTweak('lineHeight', $event)">
            </div>

            <div class="sb__row sb__row--col">
              <div class="sb__label">{{ 'sidebar.spacing' | translate:{ value: store.tweaks.paragraphSpacing() } }}</div>
              <input type="range" min="0" max="24" step="0.5"
                     [ngModel]="store.tweaks.paragraphSpacing()" 
                     (ngModelChange)="store.updateTweak('paragraphSpacing', $event)">
            </div>

            <div class="sb__section">{{ 'sidebar.options' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.indent' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.indentFirstLine()" (click)="store.updateTweak('indentFirstLine', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.indentFirstLine()" (click)="store.updateTweak('indentFirstLine', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            @if (store.tweaks.indentFirstLine()) {
              <div class="sb__row sb__row--col">
                <div class="sb__label">{{ 'sidebar.indentSize' | translate:{ value: store.tweaks.indentSize() } }}</div>
                <input type="range" min="0.1" max="2" step="0.1"
                       [ngModel]="store.tweaks.indentSize()"
                       (ngModelChange)="store.updateTweak('indentSize', $event)">
              </div>
            }

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.justify' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.justifyText()" (click)="store.updateTweak('justifyText', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.justifyText()" (click)="store.updateTweak('justifyText', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.hyphenation' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.hyphenation()" (click)="store.updateTweak('hyphenation', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.hyphenation()" (click)="store.updateTweak('hyphenation', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.smartQuotes' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.smartQuotes()" (click)="store.updateTweak('smartQuotes', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.smartQuotes()" (click)="store.updateTweak('smartQuotes', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.smartDashes' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.smartDashes()" (click)="store.updateTweak('smartDashes', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.smartDashes()" (click)="store.updateTweak('smartDashes', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.smartEllipsis' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.smartEllipsis()" (click)="store.updateTweak('smartEllipsis', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.smartEllipsis()" (click)="store.updateTweak('smartEllipsis', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            @if (store.domLang() === 'es') {
              <div class="sb__row">
                <div class="sb__label">{{ 'sidebar.smartOpeningSigns' | translate }}</div>
                <div class="sb__radio">
                  <button class="sb__opt" [class.sb__opt--on]="store.tweaks.smartOpeningSigns()" (click)="store.updateTweak('smartOpeningSigns', true)">{{ 'sidebar.yes' | translate }}</button>
                  <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.smartOpeningSigns()" (click)="store.updateTweak('smartOpeningSigns', false)">{{ 'sidebar.no' | translate }}</button>
                </div>
              </div>
            }

            <div class="sb__section">{{ 'sidebar.dropCap' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.dropCapToggle' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.dropCap()" (click)="store.updateTweak('dropCap', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.dropCap()" (click)="store.updateTweak('dropCap', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            @if (store.tweaks.dropCap()) {
              <div class="sb__row sb__row--col">
                <div class="sb__label">{{ 'sidebar.dropCapLines' | translate:{ value: store.tweaks.dropCapLines() } }}</div>
                <input type="range" min="2" max="5" step="1"
                       [ngModel]="store.tweaks.dropCapLines()"
                       (ngModelChange)="store.updateTweak('dropCapLines', $event)">
              </div>
            }
          </div>
        }

        <!-- LAYOUT VIEW -->
        @case ('layout') {
          <div class="sb__head">
            <div class="sb__title">{{ 'sidebar.layoutTitle' | translate }}</div>
            <div class="sb__author">{{ 'sidebar.layoutDesc' | translate }}</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">{{ 'sidebar.margins' | translate }}</div>
            <div class="sb__grid">
              <div class="sb__field">
                <label class="sb__label">{{ 'sidebar.top' | translate }}</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginTop()" (ngModelChange)="store.updateTweak('marginTop', $event)">
              </div>
              <div class="sb__field">
                <label class="sb__label">{{ 'sidebar.bottom' | translate }}</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginBottom()" (ngModelChange)="store.updateTweak('marginBottom', $event)">
              </div>
              <div class="sb__field">
                <label class="sb__label">{{ 'sidebar.inner' | translate }}</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginInner()" (ngModelChange)="store.updateTweak('marginInner', $event)">
              </div>
              <div class="sb__field">
                <label class="sb__label">{{ 'sidebar.outer' | translate }}</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginOuter()" (ngModelChange)="store.updateTweak('marginOuter', $event)">
              </div>
            </div>

            <div class="sb__section">{{ 'sidebar.titleTypography' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.font' | translate }}</div>
              <select class="sb__select sb__select--font" [value]="titleFontSelectVal()" (change)="onTitleFontSelect($any($event.target).value)">
                <optgroup [label]="'sidebar.serif' | translate">
                  <option value="eb-garamond" style="font-family: 'EB Garamond', serif">EB Garamond</option>
                  <option value="crimson-pro" style="font-family: 'Crimson Pro', serif">Crimson Pro</option>
                  <option value="lora" style="font-family: 'Lora', serif">Lora</option>
                  <option value="spectral" style="font-family: 'Spectral', serif">Spectral</option>
                </optgroup>
                <optgroup [label]="'sidebar.sansSerif' | translate">
                  <option value="inter" style="font-family: 'Inter', sans-serif">Inter</option>
                  <option value="montserrat" style="font-family: 'Montserrat', sans-serif">Montserrat</option>
                </optgroup>
                @if (systemFontFamilies().length > 0) {
                  <optgroup [label]="'sidebar.systemFonts' | translate">
                    @for (family of systemFontFamilies(); track family) {
                      <option [value]="family" [style.fontFamily]="family">{{ family }}</option>
                    }
                  </optgroup>
                }
                <option value="__custom__">{{ 'sidebar.customFont' | translate }}</option>
              </select>
            </div>
            @if (showCustomTitleFontInput()) {
              <div class="sb__row sb__row--col">
                <label class="sb__label">{{ 'sidebar.customFontName' | translate }}</label>
                <input class="sb__input" type="text" [ngModel]="store.tweaks.customTitleFont()" (ngModelChange)="store.updateTweak('customTitleFont', $event)" placeholder="Georgia">
              </div>
            }
            <div class="sb__row sb__row--col">
              <div class="sb__label">{{ 'sidebar.titleSize' | translate:{ value: store.tweaks.titleFontSize() } }}</div>
              <input type="range" min="12" max="36" step="0.5" [ngModel]="store.tweaks.titleFontSize()" (ngModelChange)="store.updateTweak('titleFontSize', $event)">
            </div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.alignment' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleAlignment() === 'left'" (click)="store.updateTweak('titleAlignment', 'left')">{{ 'sidebar.alignLeft' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleAlignment() === 'center'" (click)="store.updateTweak('titleAlignment', 'center')">{{ 'sidebar.alignCenter' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleAlignment() === 'right'" (click)="store.updateTweak('titleAlignment', 'right')">{{ 'sidebar.alignRight' | translate }}</button>
              </div>
            </div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.style' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleBold()" (click)="store.updateTweak('titleBold', !store.tweaks.titleBold())"><b>B</b></button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleItalic()" (click)="store.updateTweak('titleItalic', !store.tweaks.titleItalic())"><i>I</i></button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleUnderline()" (click)="store.updateTweak('titleUnderline', !store.tweaks.titleUnderline())"><u>U</u></button>
              </div>
            </div>

            <div class="sb__section">{{ 'sidebar.pageElements' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.sceneBreak' | translate }}</div>
              <select class="sb__select" [ngModel]="store.tweaks.sceneBreakType()" (ngModelChange)="store.updateTweak('sceneBreakType', $event)">
                <option value="asterisks3">* * *</option>
                <option value="asterisks">✦ ✦ ✦</option>
                <option value="dots">· · ·</option>
                <option value="flourish">~ o ~</option>
                <option value="none">{{ 'sidebar.space' | translate }}</option>
              </select>
            </div>

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.pageNumbers' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.showPageNumbers()" (click)="store.updateTweak('showPageNumbers', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.showPageNumbers()" (click)="store.updateTweak('showPageNumbers', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.pageNumPos' | translate }}</div>
              <select class="sb__select" [ngModel]="store.tweaks.pageNumberPosition()" (ngModelChange)="store.updateTweak('pageNumberPosition', $event)">
                <option value="bottom-center">{{ 'sidebar.bottomCenter' | translate }}</option>
                <option value="bottom-edges">{{ 'sidebar.bottomEdges' | translate }}</option>
                <option value="top-edges">{{ 'sidebar.topEdges' | translate }}</option>
              </select>
            </div>

            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.header' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.showHeader()" (click)="store.updateTweak('showHeader', true)">{{ 'sidebar.yes' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.showHeader()" (click)="store.updateTweak('showHeader', false)">{{ 'sidebar.no' | translate }}</button>
              </div>
            </div>
            @if (store.tweaks.showHeader()) {
              <div class="sb__row sb__row--col">
                <div class="sb__label">{{ 'sidebar.headerText' | translate }}</div>
                <input type="text" class="sb__input" [attr.placeholder]="'sidebar.headerPlaceholder' | translate" [ngModel]="store.tweaks.headerText()" (ngModelChange)="store.updateTweak('headerText', $event)">
              </div>
            }
          </div>
        }

        <!-- METADATA VIEW -->
        @case ('metadata') {
          <div class="sb__head">
            <div class="sb__title">{{ 'sidebar.metadataTitle' | translate }}</div>
            <div class="sb__author">{{ 'sidebar.metadataDesc' | translate }}</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">{{ 'sidebar.cover' | translate }}</div>
            <div class="sb__cover-zone">
              @if (assetService.assets()['cover']) {
                <div class="sb__cover-preview">
                  <img [src]="assetService.assets()['cover']" [alt]="'sidebar.cover' | translate">
                  <button class="sb__cover-del" (click)="removeCover()">×</button>
                </div>
              } @else {
                <label class="sb__cover-upload">
                  <input type="file" (change)="onCoverFile($event)" accept="image/*" hidden>
                  <div class="sb__cover-icon">🖼️</div>
                  <div class="sb__cover-text">{{ 'sidebar.uploadCover' | translate }}</div>
                  <div class="sb__cover-hint">{{ 'sidebar.coverHint' | translate }}</div>
                </label>
              }
            </div>

            <div class="sb__section">{{ 'sidebar.general' | translate }}</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.title' | translate }}</label>
              <input type="text" class="sb__input" [(ngModel)]="localMetadata.title" (blur)="syncMetadata()">
            </div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.subtitle' | translate }}</label>
              <input type="text" class="sb__input" [(ngModel)]="localMetadata.subtitle" (blur)="syncMetadata()">
            </div>
            <div class="sb__grid">
              <div class="sb__field">
                <label class="sb__label">{{ 'sidebar.year' | translate }}</label>
                <input type="number" class="sb__input" [(ngModel)]="localMetadata.year" (blur)="syncMetadata()">
              </div>
              <div class="sb__field">
                <label class="sb__label">ISBN</label>
                <input type="text" class="sb__input" [(ngModel)]="localMetadata.isbn" (blur)="syncMetadata()">
              </div>
            </div>

            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.documentLang' | translate }}</label>
              <select class="sb__select" [(ngModel)]="localMetadata.lang" (change)="syncMetadata()">
                <option value="es-MX">Español (México)</option>
                <option value="es-ES">Español (España)</option>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="fr">Français</option>
                <option value="it">Italiano</option>
                <option value="pt-BR">Português (Brasil)</option>
              </select>
            </div>

            <div class="sb__section">{{ 'sidebar.credits' | translate }}</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.publisher' | translate }}</label>
              <input type="text" class="sb__input" [(ngModel)]="localMetadata.publisher" (blur)="syncMetadata()">
            </div>

            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.authors' | translate }}</label>
              <div class="sb__list-editor">
                @for (a of localMetadata.authors; track $index) {
                  <div class="sb__list-item">
                    <input type="text" class="sb__input" [(ngModel)]="localMetadata.authors[$index]" (blur)="syncMetadata()">
                    <button class="sb__list-del" (click)="removeAuthor($index)">×</button>
                  </div>
                }
                <button class="sb__btn-link" (click)="addAuthor()">{{ 'sidebar.addAuthor' | translate }}</button>
              </div>
            </div>

            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.editors' | translate }}</label>
              <div class="sb__list-editor">
                @for (e of localMetadata.editors; track $index) {
                  <div class="sb__list-item">
                    <input type="text" class="sb__input" [(ngModel)]="localMetadata.editors[$index]" (blur)="syncMetadata()">
                    <button class="sb__list-del" (click)="removeEditor($index)">×</button>
                  </div>
                }
                <button class="sb__btn-link" (click)="addEditor()">{{ 'sidebar.addEditor' | translate }}</button>
              </div>
            </div>

            <div class="sb__section">{{ 'sidebar.printing' | translate }}</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.pageSize' | translate }}</label>
              <select class="sb__select" [(ngModel)]="localMetadata.paperSize" (change)="syncMetadata()">
                <option value="5x8">{{ 'sidebar.sizePocket' | translate }}</option>
                <option value="6x9">{{ 'sidebar.sizeTrade' | translate }}</option>
                <option value="Letter">{{ 'sidebar.sizeLetter' | translate }}</option>
                <option value="A5">{{ 'sidebar.sizeA5' | translate }}</option>
                <option value="A4">{{ 'sidebar.sizeA4' | translate }}</option>
                <option value="A6">{{ 'sidebar.sizeA6' | translate }}</option>
              </select>
            </div>
          </div>
        }

        <!-- EXPORT VIEW -->
        @case ('export') {
          <div class="sb__head">
            <div class="sb__title">{{ 'sidebar.exportTitle' | translate }}</div>
            <div class="sb__author">{{ 'sidebar.exportDesc' | translate }}</div>
          </div>
          <div class="sb__content sb__content--padding">

            <!-- Modo de exportación -->
            <div class="sb__section">{{ 'sidebar.exportScope' | translate }}</div>
            <div class="sb__row">
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.exportPrefs.exportMode() === 'all'" (click)="store.updateExportPrefs({ exportMode: 'all' })">{{ 'sidebar.exportAll' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="store.exportPrefs.exportMode() === 'selection'" (click)="store.updateExportPrefs({ exportMode: 'selection' })">{{ 'sidebar.exportSelection' | translate }}</button>
              </div>
            </div>

            <!-- Lista de capítulos (solo en modo selección) -->
            @if (store.exportPrefs.exportMode() === 'selection') {
              <div class="sb__chapter-pick">
                <div class="sb__chapter-pick-head">
                  <span class="sb__label">{{ 'sidebar.exportPickChapters' | translate }}</span>
                  <div class="sb__chapter-pick-actions">
                    <button class="sb__btn-link" (click)="selectAllChapters()">{{ 'sidebar.exportSelectAll' | translate }}</button>
                    <button class="sb__btn-link" (click)="store.updateExportPrefs({ selectedChapterIds: [] })">{{ 'sidebar.exportSelectNone' | translate }}</button>
                  </div>
                </div>
                @for (ch of store.chapters(); track ch.id) {
                  <label class="sb__chapter-pick-item">
                    <input type="checkbox"
                      [checked]="store.exportPrefs.selectedChapterIds().includes(ch.id)"
                      (change)="toggleExportChapter(ch.id, $any($event.target).checked)">
                    <span class="sb__chapter-pick-label">
                      @if (ch.number) { <span class="sb__chapter-pick-num">{{ ch.number }}</span> }
                      {{ ch.title || ('sidebar.untitled' | translate) }}
                    </span>
                  </label>
                }
              </div>
            }

            <!-- Formatos disponibles -->
            <div class="sb__section">{{ 'sidebar.exportFormat' | translate }}</div>

            @if (store.exportPrefs.exportMode() === 'all') {
              <div class="sb__export-card">
                <div class="sb__export-icon">EPUB</div>
                <div class="sb__export-info">
                  <div class="sb__export-name">{{ 'sidebar.ebook' | translate }}</div>
                  <div class="sb__export-desc">{{ 'sidebar.ebookDesc' | translate }}</div>
                  <button class="sb__btn-primary" (click)="exportService.exportEpub()" [disabled]="store.isExporting()">{{ 'sidebar.generateEPUB' | translate }}</button>
                </div>
              </div>

              <div class="sb__export-card">
                <div class="sb__export-icon" style="background: var(--terra); color: var(--paper);">PDF</div>
                <div class="sb__export-info">
                  <div class="sb__export-name">{{ 'sidebar.pdf' | translate }}</div>
                  <div class="sb__export-desc">{{ 'sidebar.pdfDesc' | translate }}</div>
                  <button class="sb__btn-primary" (click)="exportPdf()" [disabled]="store.isExporting()">{{ 'sidebar.generatePDF' | translate }}</button>
                </div>
              </div>
            }

            <div class="sb__export-card">
              <div class="sb__export-icon">DOCX</div>
              <div class="sb__export-info">
                <div class="sb__export-name">{{ 'sidebar.word' | translate }}</div>
                <div class="sb__export-desc">{{ 'sidebar.wordDesc' | translate }}</div>
                <button class="sb__btn-primary"
                  (click)="exportService.exportDocx()"
                  [disabled]="store.isExporting() || (store.exportPrefs.exportMode() === 'selection' && store.exportPrefs.selectedChapterIds().length === 0)">
                  {{ 'sidebar.generateDOCX' | translate }}
                </button>
              </div>
            </div>

            <!-- Opciones -->
            @if (store.exportPrefs.exportMode() === 'all') {
              <div class="sb__section">{{ 'sidebar.exportOptions' | translate }}</div>
              <div class="sb__row">
                <div class="sb__label">{{ 'sidebar.includeCover' | translate }}</div>
                <div class="sb__radio">
                  <button class="sb__opt" [class.sb__opt--on]="store.exportPrefs.includeCover()" (click)="store.updateExportPrefs({ includeCover: true })">{{ 'sidebar.yes' | translate }}</button>
                  <button class="sb__opt" [class.sb__opt--on]="!store.exportPrefs.includeCover()" (click)="store.updateExportPrefs({ includeCover: false })">{{ 'sidebar.no' | translate }}</button>
                </div>
              </div>
              @if (store.exportPrefs.includeCover()) {
                @if (assetService.assets()['cover']) {
                  <div class="sb__cover-chip sb__cover-chip--ok">
                    <img [src]="assetService.assets()['cover']" class="sb__cover-chip-img" alt="">
                    <span>{{ 'sidebar.coverReady' | translate }}</span>
                  </div>
                } @else {
                  <div class="sb__cover-chip sb__cover-chip--warn">
                    <span class="material-symbols-outlined">warning</span>
                    <span>{{ 'sidebar.coverNotSet' | translate }}</span>
                    <button class="sb__btn-link" (click)="store.setNav('metadata')">{{ 'sidebar.coverGoTo' | translate }}</button>
                  </div>
                }
              }
              <div class="sb__row">
                <div class="sb__label">{{ 'sidebar.includeNotes' | translate }}</div>
                <div class="sb__radio">
                  <button class="sb__opt" [class.sb__opt--on]="store.exportPrefs.includeNotes()" (click)="store.updateExportPrefs({ includeNotes: true })">{{ 'sidebar.yes' | translate }}</button>
                  <button class="sb__opt" [class.sb__opt--on]="!store.exportPrefs.includeNotes()" (click)="store.updateExportPrefs({ includeNotes: false })">{{ 'sidebar.no' | translate }}</button>
                </div>
              </div>
              <div class="sb__row">
                <div class="sb__label">{{ 'sidebar.pdfx' | translate }}</div>
                <div class="sb__radio">
                  <button class="sb__opt" [class.sb__opt--on]="store.tweaks.pdfxCompliant()" (click)="store.updateTweak('pdfxCompliant', true)">{{ 'sidebar.yes' | translate }}</button>
                  <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.pdfxCompliant()" (click)="store.updateTweak('pdfxCompliant', false)">{{ 'sidebar.no' | translate }}</button>
                </div>
              </div>
            }
          </div>
        }
        
        <!-- SEARCH VIEW -->
        @case ('search') {
          <div class="sb__head">
            <div class="sb__crumb">
              <span class="sb__dot"></span>
              <span>{{ 'sidebar.searchTitle' | translate }}</span>
            </div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.searchLabel' | translate }}</label>
              <input class="sb__input" type="text" [attr.placeholder]="'sidebar.searchPlaceholder' | translate" 
                [ngModel]="store.searchQuery()" (ngModelChange)="store.search($event)"
                (keydown.enter)="store.search($any($event.target).value)" autofocus>
            </div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.replaceLabel' | translate }}</label>
              <div class="sb__search-replace-row">
                <input class="sb__input" type="text" [attr.placeholder]="'sidebar.replacePlaceholder' | translate"
                  [ngModel]="store.replaceQuery()" (ngModelChange)="store.setReplaceQuery($event)">
                <button class="sb__btn-primary sb__search-replace-btn" 
                  (click)="store.replaceAll(store.replaceQuery())"
                  [disabled]="!store.searchResults().length">{{ 'sidebar.replaceAll' | translate }}</button>
              </div>
            </div>

            <div class="sb__section">
              {{ store.searchResults().length === 1 ? ('sidebar.resultCount' | translate:{ count: 1 }) : ('sidebar.resultCount_plural' | translate:{ count: store.searchResults().length }) }}
            </div>

            @if (store.searchResults().length > 0) {
              <div class="sb__search-results">
                @for (r of store.searchResults(); track r.chapterId + '-' + r.blockIndex + '-' + r.matchIndex) {
                  <button class="sb__search-item" (click)="goToResult(r)">
                    <div class="sb__search-meta">
                      <span class="sb__search-chapter">{{ r.chapterTitle }}</span>
                      <span class="sb__search-par">¶ {{ r.blockIndex + 1 }}</span>
                    </div>
                    <div class="sb__search-frag" [innerHTML]="searchFrag(r)"></div>
                  </button>
                }
              </div>
            }

            @if (store.searchQuery() && !store.searchResults().length) {
              <div class="sb__help">{{ 'sidebar.noResults' | translate:{ query: store.searchQuery() } }}</div>
            }
          </div>
        }

        @case ('attachments') {
          <div class="sb__head">
            <div class="sb__title">{{ 'sidebar.attachmentsTitle' | translate }}</div>
            <div class="sb__author">{{ 'sidebar.attachmentsDesc' | translate }}</div>
          </div>
          <div class="sb__content sb__content--padding">
            @if (imageAssets().length === 0) {
              <div class="sb__help">{{ 'sidebar.attachmentsEmpty' | translate }}</div>
            } @else {
              <div class="sb__section">{{ 'sidebar.attachmentsCount' | translate:{ count: imageAssets().length } }}</div>
              <div class="sb__attachments-grid">
                @for (asset of imageAssets(); track asset.key) {
                  <div class="sb__attachment">
                    <div class="sb__attachment-img">
                      <img [src]="asset.data" alt="">
                    </div>
                    <div class="sb__attachment-info">
                      <span class="sb__attachment-name">{{ asset.key }}</span>
                      <div class="sb__attachment-actions">
                        <button class="sb__btn-link" (click)="insertAttachment(asset.key)">
                          {{ 'sidebar.attachmentsInsert' | translate }}
                        </button>
                        <button class="sb__attachment-del" (click)="deleteAttachment(asset.key)">×</button>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }

        @case ('settings') {
          <div class="sb__head">
            <div class="sb__title">{{ 'sidebar.settingsTitle' | translate }}</div>
            <div class="sb__author">{{ 'sidebar.settingsDesc' | translate }}</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">{{ 'sidebar.appLang' | translate }}</div>
            <div class="sb__row">
              <select class="sb__select" [ngModel]="store.personalConfig().language" (ngModelChange)="setLanguage($event)">
                <option value="es">{{ 'lang.es' | translate }}</option>
                <option value="en">{{ 'lang.en' | translate }}</option>
                <option value="fr">{{ 'lang.fr' | translate }}</option>
                <option value="it">{{ 'lang.it' | translate }}</option>
                <option value="de">{{ 'lang.de' | translate }}</option>
                <option value="pt">{{ 'lang.pt' | translate }}</option>
              </select>
            </div>

            <div class="sb__section">{{ 'sidebar.avatar' | translate }}</div>
            <div class="sb__avatar-zone">
              @if (store.personalConfig().avatar) {
                <div class="sb__avatar-preview">
                  <img [src]="store.personalConfig().avatar" [alt]="'sidebar.avatar' | translate">
                  <button class="sb__avatar-del" (click)="removeAvatar()">×</button>
                  <div class="sb__help">{{ 'sidebar.avatarHelp' | translate }}</div>

                </div>
              } @else {
                <label class="sb__avatar-upload">
                  <input type="file" (change)="onAvatarFile($event)" accept="image/*" hidden>
                  <div class="sb__avatar-icon">👤</div>
                  <div class="sb__avatar-text">{{ 'sidebar.uploadPhoto' | translate }}</div>
                </label>
              }
            </div>

            <div class="sb__section">{{ 'sidebar.profile' | translate }}</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">{{ 'sidebar.authorName' | translate }}</label>
              <input class="sb__input" type="text" [attr.placeholder]="'sidebar.namePlaceholder' | translate"
                [ngModel]="store.personalConfig().userName" (ngModelChange)="updateUserName($event)">
              <div class="sb__help">{{ 'sidebar.nameHelp' | translate }}</div>
            </div>

            <div class="sb__section">{{ 'sidebar.appearance' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.theme' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.mode() === 'light'" (click)="store.setThemeMode('light')">{{ 'sidebar.light' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.mode() === 'dark'" (click)="store.setThemeMode('dark')">{{ 'sidebar.dark' | translate }}</button>
              </div>
            </div>

            <div class="sb__section">{{ 'sidebar.layoutLabel' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.sidebarLabel' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.sidebar() === 'left'" (click)="store.updateTweak('sidebar', 'left')">{{ 'sidebar.left' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.sidebar() === 'right'" (click)="store.updateTweak('sidebar', 'right')">{{ 'sidebar.right' | translate }}</button>
              </div>
            </div>

            <div class="sb__section">{{ 'sidebar.spelling' | translate }}</div>
            <div class="sb__row">
              <div class="sb__label">{{ 'sidebar.checker' | translate }}</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.spellcheck()" (click)="store.updateTweak('spellcheck', true)">{{ 'sidebar.enabled' | translate }}</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.spellcheck()" (click)="store.updateTweak('spellcheck', false)">{{ 'sidebar.disabled' | translate }}</button>
              </div>
            </div>
            @if (spellCheckService.isAvailable) {
              <div class="sb__section">{{ 'sidebar.dictionary' | translate }}</div>
              <div class="sb__row sb__row--col">
                <label class="sb__label">{{ 'sidebar.addWord' | translate }}</label>
                <div class="sb__dict-add-row">
                  <input class="sb__input" type="text" [attr.placeholder]="'sidebar.wordPlaceholder' | translate" [(ngModel)]="newDictWord" (keydown.enter)="addDictWord()">
                  <button class="sb__btn-primary sb__dict-add-btn" [disabled]="!newDictWord.trim()" (click)="addDictWord()">+</button>
                </div>
              </div>
              @if (dictWords().length > 0) {
                <div class="sb__dict-list">
                  @for (w of dictWords(); track w) {
                    <div class="sb__dict-item">
                      <span class="sb__dict-word">{{ w }}</span>
                      <button class="sb__dict-del" (click)="removeDictWord(w)">×</button>
                    </div>
                  }
                </div>
              } @else {
                <div class="sb__help">{{ 'sidebar.dictEmpty' | translate }}</div>
              }
            }
          </div>
        }
      }
      @if (showInputModal()) {
        <app-input-modal
          [title]="modalTitle()"
          [label]="modalLabel()"
          [initialValue]="modalValue()"
          [inputType]="modalInputType()"
          (close)="showInputModal.set(false)"
          (submit)="onInputSubmit($event)"
        ></app-input-modal>
      }

      @if (showConfirmModal()) {
        <app-confirm-modal
          [title]="'sidebar.deleteTitle' | translate"
          [message]="confirmMessage()"
          (close)="showConfirmModal.set(false)"
          (confirm)="onConfirmDelete()"
        ></app-confirm-modal>
      }

      @if (store.isExporting()) {
        <div class="sb__export-overlay">
          <div class="sb__export-modal">
            <div class="sb__export-spinner"></div>
            <div class="sb__export-status">{{ store.exportStatus() }}</div>
          </div>
        </div>
      }
    </aside>

    <ng-template #groupTemplate let-label="label" let-items="items" let-numbered="numbered">
      <div class="sbg">
        <div class="sbg__label">{{ label }}</div>
        <ul class="sbg__list">
          @let maxW = store.maxWords();
          @for (c of items; track c.id; let i = $index; let first = $first; let last = $last) {
            <li>
              <button
                class="sbi"
                [class.sbi--on]="store.activeChapterId() === c.id"
                (click)="store.setActiveChapter(c.id)"
              >
                <span class="sbi__num" (dblclick)="editNumber(c, $event)" [attr.title]="'sidebar.doubleClickNumber' | translate">
                  {{ numbered ? ((c.number || 0) | number:'2.0-0') : '·' }}
                </span>
                <span class="sbi__body">
                  <div class="sbi__title-row">
                    <span class="sbi__t" (dblclick)="editTitle(c, $event)" [attr.title]="'sidebar.doubleClickTitle' | translate">{{ c.title }}</span>
                    <div class="sbi__actions">
                      <button class="sbi__move" [class.sbi__move--hidden]="first" (click)="moveChapter(c.id, 'up', $event)" [attr.title]="'sidebar.moveUp' | translate">
                        <span class="material-symbols-outlined">arrow_upward</span>
                      </button>
                      <button class="sbi__move" [class.sbi__move--hidden]="last" (click)="moveChapter(c.id, 'down', $event)" [attr.title]="'sidebar.moveDown' | translate">
                        <span class="material-symbols-outlined">arrow_downward</span>
                      </button>
                      <button class="sbi__del" (click)="deleteChapter(c, $event)" [attr.title]="'sidebar.deleteElement' | translate">×</button>
                    </div>
                  </div>
                  <span class="sbi__bar">
                    <span
                      class="sbi__fill"
                      [class]="'sbi__fill--' + (c.status || (c.kind === 'chapter' ? 'ok' : 'front'))"
                      [style.width.%]="c.words ? Math.max(4, Math.round((c.words / maxW) * 100)) : 6"
                    ></span>
                  </span>
                  <span class="sbi__meta">
                    {{ c.words ? (translate.instant('sidebar.wordCount', { count: c.words.toLocaleString(currentLang()) })) : '—' }}
                    {{ c.readMin ? translate.instant('sidebar.readMin', { min: c.readMin }) : '' }}
                  </span>
                </span>
              </button>
            </li>
          }
        </ul>
      </div>
    </ng-template>
  `
})
export class SidebarComponent implements OnInit {
  readonly store = inject(BookStore);
  readonly assetService = inject(AssetService);
  readonly exportService = inject(ExportService);
  readonly importService = inject(ImportService);
  readonly spellCheckService = inject(SpellCheckService);
  readonly translate = inject(TranslateService);
  readonly fontService = inject(FontService);
  readonly Math = Math;

  systemFontFamilies = signal<string[]>([]);

  readonly bookFontSelectVal = computed(() => {
    const custom = this.store.tweaks.customBookFont();
    if (custom === null) return this.store.tweaks.bookFont();
    if (this.systemFontFamilies().includes(custom)) return custom;
    return '__custom__';
  });

  readonly titleFontSelectVal = computed(() => {
    const custom = this.store.tweaks.customTitleFont();
    if (custom === null) return this.store.tweaks.titleFont();
    if (this.systemFontFamilies().includes(custom)) return custom;
    return '__custom__';
  });

  readonly showCustomBookFontInput = computed(() => {
    const custom = this.store.tweaks.customBookFont();
    return custom !== null && !this.systemFontFamilies().includes(custom);
  });

  readonly showCustomTitleFontInput = computed(() => {
    const custom = this.store.tweaks.customTitleFont();
    return custom !== null && !this.systemFontFamilies().includes(custom);
  });

  @ViewChild('importInput') importInput!: ElementRef<HTMLInputElement>;

  triggerImport() {
    this.importInput.nativeElement.click();
  }

  readonly importing = signal(false);

  async onImportFile(event: any) {
    const file = event.target.files?.[0];
    if (!file) return;

    this.importing.set(true);
    try {
      if (file.name.endsWith('.docx')) {
        await this.importService.importDocx(file);
      } else if (file.name.endsWith('.txt')) {
        await this.importService.importTxt(file);
      }
    } finally {
      this.importing.set(false);
      event.target.value = '';
    }
  }

  readonly currentLang = computed(() => {
    const lang = this.store.personalConfig().language;
    const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', it: 'it-IT' };
    return localeMap[lang] || 'es-ES';
  });

  dictWords = signal<string[]>([]);
  newDictWord = '';

  showAddMenu = signal(false);
  showFrontSubmenu = signal(false);
  showGoalsEditor = signal(false);

  // Modal states
  showInputModal = signal(false);
  showConfirmModal = signal(false);

  modalTitle = signal('');
  modalLabel = signal('');
  modalValue = signal<string | number>('');
  modalInputType = signal('text');
  modalTargetId = signal('');
  modalAction = signal<'title' | 'number'>('title');

  confirmMessage = signal('');
  confirmTargetId = signal('');

  // Local metadata for form editing
  localMetadata: Book = {} as Book;

  ngOnInit() {
    this.initLocalMetadata();
    this.loadDictWords();
    this.fontService.loadSystemFonts().then(families => this.systemFontFamilies.set(families));
  }

  async loadDictWords() {
    if (this.spellCheckService.isAvailable) {
      const words = await this.spellCheckService.getCustomDictionary();
      this.dictWords.set(words);
    }
  }

  async addDictWord() {
    const word = this.newDictWord.trim();
    if (!word) return;
    const ok = await this.spellCheckService.addWord(word);
    if (ok) {
      this.dictWords.update(w => [...w, word].sort((a, b) => a.localeCompare(b)));
      this.newDictWord = '';
    }
  }

  async removeDictWord(word: string) {
    const ok = await this.spellCheckService.removeWord(word);
    if (ok) {
      this.dictWords.update(w => w.filter(x => x !== word));
    }
  }

  initLocalMetadata() {
    const current = this.store.book();
    if (current) {
      this.localMetadata = {
        ...current,
        authors: current.authors ? [...current.authors] : [],
        editors: current.editors ? [...current.editors] : []
      };
    }
  }

  syncMetadata() {
    this.store.updateBookMetadata(this.localMetadata);
  }

  addAuthor() {
    if (!this.localMetadata.authors) this.localMetadata.authors = [];
    this.localMetadata.authors.push('');
  }
  removeAuthor(index: number) {
    this.localMetadata.authors.splice(index, 1);
    this.syncMetadata();
  }
  addEditor() {
    if (!this.localMetadata.editors) this.localMetadata.editors = [];
    this.localMetadata.editors.push('');
  }
  removeEditor(index: number) {
    this.localMetadata.editors.splice(index, 1);
    this.syncMetadata();
  }

  onCoverFile(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.assetService.set('cover', e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  removeCover() {
    this.assetService.remove('cover');
  }

  onAvatarFile(event: any) {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this._resizeImage(e.target.result, 200, 200).then(resizedBase64 => {
          const config = { ...this.store.personalConfig(), avatar: resizedBase64 };
          this.store.setPersonalConfig(config);
        });
      };
      reader.readAsDataURL(file);
    }
  }

  private _resizeImage(base64: string, width: number, height: number): Promise<string> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // Calculate object-fit: cover equivalent
          const scale = Math.max(width / img.width, height / img.height);
          const x = (width / 2) - (img.width / 2) * scale;
          const y = (height / 2) - (img.height / 2) * scale;

          ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        }

        resolve(canvas.toDataURL('image/webp', 0.8));
      };
      img.src = base64;
    });
  }

  removeAvatar() {
    const config = { ...this.store.personalConfig(), avatar: '' };
    this.store.setPersonalConfig(config);
  }

  updateUserName(name: string) {
    const config = { ...this.store.personalConfig(), userName: name };
    this.store.setPersonalConfig(config);
  }

  setLanguage(lang: string) {
    const config = { ...this.store.personalConfig(), language: lang };
    this.store.setPersonalConfig(config);
    this.translate.use(lang);
  }

  selectAllChapters() {
    const ids = this.store.chapters().map(c => c.id);
    this.store.updateExportPrefs({ selectedChapterIds: ids });
  }

  toggleExportChapter(id: string, checked: boolean) {
    const current = this.store.exportPrefs.selectedChapterIds();
    const next = checked ? [...current, id] : current.filter(x => x !== id);
    this.store.updateExportPrefs({ selectedChapterIds: next });
  }

  onBookFontSelect(val: string) {
    if (val === '__custom__') {
      this.store.updateTweak('customBookFont', '');
    } else if (BUNDLED_FONT_KEYS.includes(val)) {
      this.store.updateTweak('bookFont', val as any);
      this.store.updateTweak('customBookFont', null);
    } else {
      this.store.updateTweak('customBookFont', val);
    }
  }

  onTitleFontSelect(val: string) {
    if (val === '__custom__') {
      this.store.updateTweak('customTitleFont', '');
    } else if (BUNDLED_FONT_KEYS.includes(val)) {
      this.store.updateTweak('titleFont', val as any);
      this.store.updateTweak('customTitleFont', null);
    } else {
      this.store.updateTweak('customTitleFont', val);
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showAddMenu.set(false);
    this.showFrontSubmenu.set(false);
  }

  toggleAddMenu(event: Event) {
    event.stopPropagation();
    this.showAddMenu.update(v => !v);
  }

  updateGoalWords(value: number) {
    this.store.setWritingGoals({ ...this.store.writingGoals(), targetWords: Number(value) || 0 });
  }

  updateGoalDeadline(value: string) {
    this.store.setWritingGoals({ ...this.store.writingGoals(), deadline: value || '' });
  }

  toggleFrontSubmenu(event: Event) {
    event.stopPropagation();
    this.showFrontSubmenu.update(v => !v);
  }

  add(kind: ChapterKind) {
    this.store.addChapter(kind);
    this.showAddMenu.set(false);
    this.showFrontSubmenu.set(false);
  }

  addFromTemplate(templateId: ChapterTemplateId) {
    this.store.addChapterFromTemplate(templateId);
    this.showAddMenu.set(false);
    this.showFrontSubmenu.set(false);
  }

  readonly frontChapters = computed(() =>
    this.store.chapters().filter(c => c.kind === 'front')
  );
  readonly mainChapters = computed(() =>
    this.store.chapters().filter(c => c.kind === 'chapter')
  );
  readonly backChapters = computed(() =>
    this.store.chapters().filter(c => c.kind === 'back')
  );

  readonly imageAssets = computed(() => {
    const assets = this.assetService.assets();
    return Object.entries(assets)
      .filter(([key]) => key.startsWith('img-'))
      .map(([key, data]) => ({ key, data }));
  });

  insertAttachment(assetKey: string) {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const index = chapter.body.length - 1;
    this.store.saveSnapshot();
    this.store.insertImageBlock(chapter.id, index, assetKey);
  }

  deleteAttachment(assetKey: string) {
    this.assetService.remove(assetKey);
  }

  editNumber(chapter: any, event: Event) {
    event.stopPropagation();
    if (chapter.kind !== 'chapter') return;

    this.modalTitle.set(this.translate.instant('sidebar.editNumber'));
    this.modalLabel.set(this.translate.instant('sidebar.chapterNumber'));
    this.modalValue.set(chapter.number || 0);
    this.modalInputType.set('number');
    this.modalTargetId.set(chapter.id);
    this.modalAction.set('number');
    this.showInputModal.set(true);
  }

  editTitle(chapter: any, event: Event) {
    event.stopPropagation();

    this.modalTitle.set(this.translate.instant('sidebar.editTitle'));
    this.modalLabel.set(this.translate.instant('sidebar.chapterTitle'));
    this.modalValue.set(chapter.title);
    this.modalInputType.set('text');
    this.modalTargetId.set(chapter.id);
    this.modalAction.set('title');
    this.showInputModal.set(true);
  }

  onInputSubmit(value: string | number) {
    const id = this.modalTargetId();
    if (this.modalAction() === 'title') {
      const title = value.toString().trim();
      if (title) this.store.updateChapterMeta(id, { title });
    } else {
      const num = parseInt(value.toString(), 10);
      if (!isNaN(num)) this.store.updateChapterMeta(id, { number: num });
    }
    this.showInputModal.set(false);
  }

  deleteChapter(chapter: any, event: Event) {
    event.stopPropagation();
    this.confirmMessage.set(this.translate.instant('sidebar.deleteConfirm', { title: chapter.title }));
    this.confirmTargetId.set(chapter.id);
    this.showConfirmModal.set(true);
  }

  moveChapter(chapterId: string, direction: 'up' | 'down', event: Event) {
    event.stopPropagation();
    this.store.saveSnapshot();
    this.store.moveChapter(chapterId, direction);
  }

  onConfirmDelete() {
    this.store.deleteChapter(this.confirmTargetId());
    this.showConfirmModal.set(false);
  }

  goToResult(r: any) {
    this.store.goToSearchResult(r.chapterId, r.blockIndex);
  }

  searchFrag(r: any): string {
    const before = r.before.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const match = r.match.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const after = r.after.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return (r.before ? '…' : '') + before + '<mark>' + match + '</mark>' + after + (r.after.length >= 40 ? '…' : '');
  }

  exportEpub() {
    this.exportService.exportEpub();
  }

  exportDocx() {
    this.exportService.exportDocx();
  }

  exportPdf() {
    this.exportService.exportPdf();
  }
}
