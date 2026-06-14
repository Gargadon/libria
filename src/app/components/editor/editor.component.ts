import { Component, inject, computed, signal, HostListener, effect, ChangeDetectionStrategy, OnDestroy } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ContenteditableDirective } from './contenteditable.directive';
import { TableContentDirective } from './table-content.directive';
import { Block, NoteRole, NoteStatus, Footnote, Misspelling, sortFootnotesByPosition } from '../../models/book.models';
import { SpellCheckService } from '../../services/spell-check.service';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../environments/environment';
import { NotesChatModalComponent } from '../notes/notes-chat-modal.component';

@Component({
  selector: 'app-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule, ContenteditableDirective, TableContentDirective, FormsModule, NotesChatModalComponent],
  host: {
    'style': 'display: flex; flex-direction: column; min-height: 0; flex: 1;'
  },
  template: `
    @if (store.ui.zenMode()) {
      <button class="ed__zen-exit" (click)="store.toggleZenMode()" [attr.title]="'topbar.zenMode' | translate">
        <span class="material-symbols-outlined">fullscreen_exit</span>
      </button>
    }

    @if (store.activeChapter(); as chapter) {
      <main class="ed">
        <div class="ed__bar">
          <div class="ed__crumbs">
            <span class="ed__chip">
              {{ chapter.kind === 'front' ? ('editor.preliminares' | translate) : chapter.kind === 'back' ? ('editor.posliminares' | translate) : ('editor.chapter' | translate:{ number: chapter.number || ('editor.noNumber' | translate) }) }}
            </span>
            <span class="ed__sep">›</span>
            <span class="ed__current">{{ chapter.title }}</span>
          </div>
          <div class="ed__tools">
            <button class="ed__t" [attr.title]="'editor.italic' | translate" (click)="execCommand('italic')"><span class="material-symbols-outlined">format_italic</span></button>
            <button class="ed__t" [attr.title]="'editor.bold' | translate" (click)="execCommand('bold')"><span class="material-symbols-outlined">format_bold</span></button>
            <button class="ed__t" [attr.title]="'editor.underline' | translate" (click)="execCommand('underline')"><span class="material-symbols-outlined">format_underlined</span></button>
            <span class="ed__tsep"></span>
            <button class="ed__t ed__t--wide" [attr.title]="'editor.sceneBreak' | translate" (click)="insertSceneBreak()"><span class="material-symbols-outlined">horizontal_rule</span></button>
            <button class="ed__t" [attr.title]="'editor.pageBreak' | translate" (click)="insertPageBreak()"><span class="material-symbols-outlined">insert_page_break</span></button>
            <button class="ed__t" [attr.title]="'editor.blockQuote' | translate" (click)="toggleQuote()"><span class="material-symbols-outlined">format_quote</span></button>
            <button class="ed__t" [attr.title]="'editor.insertUnorderedList' | translate" (click)="insertUnorderedList()"><span class="material-symbols-outlined">format_list_bulleted</span></button>
            <button class="ed__t" [attr.title]="'editor.insertOrderedList' | translate" (click)="insertOrderedList()"><span class="material-symbols-outlined">format_list_numbered</span></button>
            <button class="ed__t" [attr.title]="'editor.insertTable' | translate" (click)="insertTable()"><span class="material-symbols-outlined">table</span></button>
            @if (activeBlockType() === 'table') {
              <span class="ed__tsep"></span>
              <button class="ed__t" title="Insertar fila arriba" (click)="tableInsertRowAbove()"><span class="material-symbols-outlined">expand_less</span></button>
              <button class="ed__t" title="Insertar fila abajo" (click)="tableInsertRowBelow()"><span class="material-symbols-outlined">expand_more</span></button>
              <button class="ed__t" title="Insertar columna izquierda" (click)="tableInsertColLeft()"><span class="material-symbols-outlined">chevron_left</span></button>
              <button class="ed__t" title="Insertar columna derecha" (click)="tableInsertColRight()"><span class="material-symbols-outlined">chevron_right</span></button>
              <span class="ed__tsep"></span>
              <button class="ed__t" title="Eliminar fila" (click)="tableDeleteRow()"><span class="material-symbols-outlined">remove</span></button>
              <button class="ed__t" title="Eliminar columna" (click)="tableDeleteCol()"><span class="material-symbols-outlined">backspace</span></button>
            }
            <button class="ed__t" [attr.title]="'editor.insertImage' | translate" (click)="insertImage()"><span class="material-symbols-outlined">add_photo_alternate</span></button>
            <button class="ed__t" [attr.title]="'editor.insertFootnote' | translate" (click)="insertFootnote()"><span class="material-symbols-outlined">superscript</span></button>
            <span class="ed__tsep"></span>
            <button class="ed__t" [class.ed__t--on]="store.ui.showSpellCheck()" [attr.title]="'editor.spellCheck' | translate" (click)="onToggleSpellCheck()"><span class="material-symbols-outlined">spellcheck</span></button>

            <button class="ed__t ed__t--text" [attr.title]="'editor.markReviewed' | translate">
              <i class="ed__statusDot" [class]="'ed__statusDot--' + status()"></i> {{ statusLabel() }}
            </button>
          </div>
        </div>

        <div class="ed__paper">
          <div class="ed__sheet">
            <article class="ed__doc" 
              [style.font-family]="store.bookFontFamily()"
              [style.font-size.px]="ptToPx(store.tweaks.fontSize())"
              [style.line-height]="store.tweaks.lineHeight()"
              [style.--p-gap.px]="ptToPx(store.tweaks.paragraphSpacing())"
              [style.--indent-size]="store.tweaks.indentSize() + 'cm'"
              [style.--drop-lines]="store.tweaks.dropCapLines()"
              [class.ed__doc--indent]="store.tweaks.indentFirstLine()"
              [class.ed__doc--justify]="store.tweaks.justifyText()"
              [class.ed__doc--hyphen]="store.tweaks.hyphenation()">
              @for (b of chapter.body; track $index) {
                <div class="ed__block-container" [class.ed__block-container--has-note]="blockNotes().has($index)">
                  @if (blockNotes().has($index)) {
                    <button class="ed__note-indicator" (click)="addNoteToBlock(chapter.id, $index)" [attr.title]="'editor.viewNotes' | translate">
                      <span class="material-symbols-outlined">chat_bubble</span>
                      <span class="ed__note-count">{{ blockNotes().get($index) }}</span>
                    </button>
                  }
                  <div class="ed__block-actions">
                    <button class="ed__block-btn" (click)="addNoteToBlock(chapter.id, $index)" [attr.title]="'editor.addNote' | translate"><span class="material-symbols-outlined">chat_bubble</span></button>
                    <select (change)="onTypeChange(chapter.id, $index, $event)" [value]="b.type">
                      <option value="p">{{ 'editor.blockParagraph' | translate }}</option>
                      <option value="first-p">{{ 'editor.blockFirstP' | translate }}</option>
                      <option value="chapter-title">{{ 'editor.blockChapterTitle' | translate }}</option>
                      <option value="h2">{{ 'editor.blockH2' | translate }}</option>
                      <option value="h3">{{ 'editor.blockH3' | translate }}</option>
                      <option value="chapter-num">{{ 'editor.blockChapterNum' | translate }}</option>
                      <option value="list-unordered">{{ 'editor.blockUnorderedList' | translate }}</option>
                      <option value="list-ordered">{{ 'editor.blockOrderedList' | translate }}</option>
                      <option value="table">{{ 'editor.blockTable' | translate }}</option>
                      <option value="scene-break">{{ 'editor.blockSceneBreak' | translate }}</option>
                      <option value="page-break">{{ 'editor.blockPageBreak' | translate }}</option>
                      <option value="epigraph">{{ 'editor.blockEpigraph' | translate }}</option>
                      <option value="verse">{{ 'editor.blockVerse' | translate }}</option>
                      <option value="code">{{ 'editor.blockCode' | translate }}</option>
                      <option value="blockquote">{{ 'editor.blockQuote' | translate }}</option>
                      <option value="image">{{ 'editor.blockImage' | translate }}</option>
                    </select>
                  </div>
                  @switch (b.type) {
                    @case ('halftitle') { 
                      <h1 class="bk-halftitle"
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize())"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></h1> 
                    }
                    @case ('title') { 
                      <h1 class="bk-title"
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize())"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></h1> 
                    }
                    @case ('subtitle') { 
                      <div class="bk-subtitle"
                        [style.font-family]="store.titleFontFamily()"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></div> 
                    }
                    @case ('author') { 
                      <div class="bk-author"
                        [style.font-family]="store.titleFontFamily()"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></div> 
                    }
                    @case ('publisher') { 
                      <div class="bk-publisher"
                        [style.font-family]="store.titleFontFamily()"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></div> 
                    }
                    @case ('dedication') { 
                      <div class="bk-dedication"
                        [style.font-family]="store.titleFontFamily()"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></div> 
                    }
                    @case ('chapter-num') { 
                      <div class="bk-chnum" 
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize()) * 0.8"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></div> 
                    }
                    @case ('chapter-title') { 
                      <h2 class="bk-chtitle" 
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize())"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></h2> 
                    }                    @case ('h1') { 
                      <h2 class="bk-h1"
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize())"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></h2> 
                    }
                    @case ('h2') { 
                      <h3 class="bk-h2"
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize() * 0.85)"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></h3> 
                    }
                    @case ('h3') { 
                      <h4 class="bk-h3"
                        [style.font-family]="store.titleFontFamily()"
                        [style.font-size.px]="ptToPx(store.tweaks.titleFontSize() * 0.72)"
                        [style.text-align]="store.tweaks.titleAlignment()"
                        [style.font-weight]="store.tweaks.titleBold() ? 'bold' : 'normal'"
                        [style.font-style]="store.tweaks.titleItalic() ? 'italic' : 'normal'"
                        [style.text-decoration]="store.tweaks.titleUnderline() ? 'underline' : 'none'"
                        contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></h4> 
                    }
                    @case ('first-p') { 
                      <p class="bk-first" [class.has-dropcap]="store.tweaks.dropCap()">
                        <span contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="(b.drop && !b.text?.startsWith(b.drop) ? b.drop : '') + (b.text || '')" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)" style="outline: none;"></span>
                      </p> 
                    }
                    @case ('p') { 
                      <p class="bk-p" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></p> 
                    }
                    @case ('code') { 
                      <pre class="bk-code"><code spellcheck="false" contenteditable="true" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></code></pre> 
                    }
                    @case ('epigraph') {
                      <div class="bk-epigraph">
                        <blockquote class="bk-epigraph__q" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></blockquote>
                        <cite class="bk-epigraph__att" contenteditable="true" spellcheck="false" [appContenteditable]="b.attribution" (input)="onAttributionInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)"></cite>
                      </div>
                    }
                    @case ('verse') {
                      <pre class="bk-verse"><code contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></code></pre>
                    }
                    @case ('blockquote') { 
                      <blockquote class="bk-quote" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></blockquote> 
                    }
                    @case ('scene-break') { <div class="bk-break">{{ store.tweaks.sceneBreakType() === 'asterisks3' ? '* * *' : store.tweaks.sceneBreakType() === 'asterisks' ? '✦ ✦ ✦' : store.tweaks.sceneBreakType() === 'dots' ? '· · ·' : store.tweaks.sceneBreakType() === 'flourish' ? '— o —' : '' }}</div> }
                    @case ('page-break') { <div class="bk-page-break"><span>{{ 'editor.pageBreakLabel' | translate }}</span></div> }
                    @case ('image') {
                      <figure class="bk-image" #imageFigure>
                        @if (b.src && store.assets()[b.src]) {
                          <div class="bk-image__wrap">
                            <img [src]="store.assets()[b.src]" alt="" class="bk-image__img"
                              [style.width.px]="b.width"
                              [style.height.px]="b.height"
                              [style.transform]="imageTransform(b)"
                              #imageEl>
                            <div class="bk-image__tools">
                              <button class="bk-image__tool" (click)="rotateImage(chapter.id, $index, b, -90)" [attr.title]="'editor.imageRotateCCW' | translate">
                                <span class="material-symbols-outlined">rotate_left</span>
                              </button>
                              <button class="bk-image__tool" (click)="rotateImage(chapter.id, $index, b, 90)" [attr.title]="'editor.imageRotateCW' | translate">
                                <span class="material-symbols-outlined">rotate_right</span>
                              </button>
                              <button class="bk-image__tool" (click)="flipImage(chapter.id, $index, b, 'h')" [attr.title]="'editor.imageFlipH' | translate">
                                <span class="material-symbols-outlined">flip</span>
                              </button>
                              <button class="bk-image__tool" (click)="flipImage(chapter.id, $index, b, 'v')" [attr.title]="'editor.imageFlipV' | translate">
                                <span class="material-symbols-outlined">flip_to_front</span>
                              </button>
                            </div>
                            <span class="bk-image__resize" (mousedown)="onImageResizeStart($event, chapter.id, $index, imageEl)"></span>
                          </div>
                          <figcaption class="bk-image__cap" contenteditable="true"
                            [appContenteditable]="b.caption"
                            (input)="onImageCaptionInput(chapter.id, $index, $event)"
                            [attr.data-placeholder]="'editor.imageCaption' | translate"></figcaption>
                        } @else {
                          <div class="bk-image__placeholder" (click)="pickImageForBlock(chapter.id, $index)">
                            <span class="material-symbols-outlined">add_photo_alternate</span>
                            <span>{{ 'editor.imagePlaceholder' | translate }}</span>
                          </div>
                        }
                      </figure>
                    }
                    @case ('list-unordered') {
                      <ul class="bk-list" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></ul>
                    }
                    @case ('list-ordered') {
                      <ol class="bk-list" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appContenteditable]="b.text" [contenteditableHtml]="b.html" [spellErrors]="getBlockErrors($index)" (input)="onInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></ol>
                    }
                    @case ('table') {
                      <table class="bk-table" contenteditable="true" [spellcheck]="store.tweaks.spellcheck()" [attr.lang]="store.domLang()" [appTableContent]="b.html" (input)="onTableInput(chapter.id, $index, $event)" (focus)="onFocus($index)" (keydown)="onKeyDown(chapter.id, $index, $event)" (paste)="onPaste(chapter.id, $index, $event)"></table>
                    }
                    @default {
                      <div class="bk-unknown">[{{ b.type }}]</div>
                    }
                  }
                </div>
              }
              <div class="ed__end">{{ 'editor.endFragment' | translate }}</div>
            </article>

          </div>
        </div>

        @if (chapter.footnotes?.length) {
          <div class="ed__fnpanel">
            <div class="ed__fnpanel-title">{{ 'editor.footnotes' | translate }}</div>
            @let sortedFns = sortFootnotesByPosition(chapter.footnotes, chapter.body);
            @for (fn of sortedFns; track fn.id; let fi = $index) {
              <div class="ed__fnpanel-item">
                <span class="ed__fnpanel-num">{{ fi + 1 }}.</span>
                <textarea class="ed__fnpanel-input"
                  [value]="fn.content"
                  (input)="onFootnoteInput(chapter.id, fn.id, $event)"
                  placeholder="{{ 'editor.footnotePlaceholder' | translate }}"></textarea>
                <button class="ed__fnpanel-del" (click)="onDeleteFootnote(chapter.id, fn.id)" [attr.title]="'editor.delete' | translate">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>
            }
          </div>
        }

        <div class="ed__statbar">
          <span style="color: var(--terra); font-weight: 500">{{ statusLabel() }}</span>
          <span class="ed__dot2"></span>
          <span>{{ 'editor.readTime' | translate:{ min: chapter.readMin } }}</span>
          <span class="ed__dot2"></span>
          <span>{{ 'editor.wordCount' | translate:{ count: (chapter.words || 0).toLocaleString(currentLang()) } }}</span>
          <span class="ed__dot2"></span>
          <span>{{ store.isDirty() ? ('editor.unsaved' | translate) : ('editor.saved' | translate) }}</span>
          <span style="flex: 1"></span>
          <span>{{ 'editor.layoutLabel' | translate:{ version: environment.version } }}</span>
        </div>
      </main>
    }

    @if (showNoteDialog()) {
      <app-notes-chat-modal
        [blockIndex]="noteTargetIndex()!"
        [chapterId]="noteTargetChapterId()"
        (close)="closeNoteDialog()">
      </app-notes-chat-modal>
    }
  `
})
export class EditorComponent implements OnDestroy {
  readonly store = inject(BookStore);
  readonly translate = inject(TranslateService);
  readonly spellCheck = inject(SpellCheckService);

  readonly blockErrors = signal<Record<number, Misspelling[]>>({});
  private spellCheckTimeout: any = null;
  private chapterSpellCheckTimeout: any = null;

  private readonly _spellWatch = effect(() => {
    const chapter = this.store.activeChapter();
    if (chapter) {
      clearTimeout(this.chapterSpellCheckTimeout);
      this.chapterSpellCheckTimeout = setTimeout(() => this.runSpellCheck(), 500);
    }
  });

  private readonly _footnoteWatch = effect(() => {
    const chapter = this.store.activeChapter();
    if (chapter?.footnotes?.length) {
      this.syncFootnoteRefs(chapter);
    }
  });

  private readonly _focusBlockWatch = effect(() => {
    const blockIndex = this.store.ui.focusBlockIndex();
    if (blockIndex === null) return;
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    setTimeout(() => {
      const el = this._getEditableBlock(blockIndex);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        this.lastFocusedIndex = blockIndex;
        this.focusedBlockIndex.set(blockIndex);
      }
      this.store.clearFocusBlock();
    }, 100);
  });

  getBlockErrors(blockIndex: number): Misspelling[] {
    return this.blockErrors()[blockIndex] ?? [];
  }
  readonly environment = environment;
  readonly sortFootnotesByPosition = sortFootnotesByPosition;

  ptToPx(pt: number): number { return pt * 96 / 72; }

  readonly currentLang = computed(() => {
    const lang = this.store.personalConfig().language;
    const localeMap: Record<string, string> = { en: 'en-US', fr: 'fr-FR', it: 'it-IT' };
    return localeMap[lang] || 'es-ES';
  });

  readonly status = computed(() => {
    const chapter = this.store.activeChapter();
    return chapter?.status || (chapter?.kind === 'chapter' ? 'ok' : 'front');
  });

  readonly statusLabel = computed(() => {
    const s = this.status();
    const map: Record<string, string> = {
      ok: "editor.statusOk",
      draft: "editor.statusDraft",
      outline: "editor.statusOutline",
      front: "editor.statusFront",
      back: "editor.statusBack"
    };
    return this.translate.instant(map[s!] || "");
  });

  readonly blockNotes = computed(() => {
    const notes = this.store.activeNotes();
    const map = new Map<number, number>();
    for (const n of notes) {
      map.set(n.blockIndex, (map.get(n.blockIndex) || 0) + 1);
    }
    return map;
  });

  // --- Note Dialog ---
  showNoteDialog = signal(false);
  noteTargetChapterId = signal('');
  noteTargetIndex = signal<number | null>(null);
  noteAuthor = '';
  noteRole: NoteRole = 'author';
  noteContent = '';

  addNoteToBlock(chapterId: string, blockIndex: number) {
    this.noteTargetChapterId.set(chapterId);
    this.noteTargetIndex.set(blockIndex);
    this.showNoteDialog.set(true);
  }

  closeNoteDialog() {
    this.showNoteDialog.set(false);
    this.noteContent = '';
  }

  saveNote() {
    if (!this.noteContent.trim() || !this.noteAuthor.trim()) return;
    this.store.addNote(
      this.noteTargetChapterId(),
      this.noteTargetIndex()!,
      this.noteRole,
      this.noteAuthor,
      this.noteContent
    );
    this.closeNoteDialog();
  }

  // --- Note Status & Replies ---
  replyTargetId = signal('');
  replyContent = '';

  toggleStatus(note: any) {
    const sequence: NoteStatus[] = ['unresolved', 'resolved', 'not-applicable'];
    const currentIndex = sequence.indexOf(note.status);
    const nextStatus = sequence[(currentIndex + 1) % sequence.length];
    this.store.updateNoteStatus(note.id, nextStatus);
  }

  statusIcon(status: NoteStatus): string {
    return {
      'unresolved': '○',
      'resolved': '●',
      'not-applicable': '×'
    }[status];
  }

  statusTitle(status: NoteStatus): string {
    return {
      'unresolved': 'Pendiente',
      'resolved': 'Resuelto',
      'not-applicable': 'No aplica'
    }[status];
  }

  startReply(noteId: string) {
    this.replyTargetId.set(noteId);
    this.replyContent = '';
  }

  saveReply(noteId: string) {
    if (!this.replyContent.trim()) return;
    // We'll reuse the noteAuthor and noteRole from the last session or set defaults
    const author = this.noteAuthor || 'Usuario';
    const role = this.noteRole || 'author';
    this.store.addReply(noteId, role, author, this.replyContent);
    this.replyTargetId.set('');
    this.replyContent = '';
  }


  lastFocusedIndex = -1;
  private _savedCaretOffset = 0;
  readonly focusedBlockIndex = signal(-1);
  /** Prevents onInput from firing during programmatic splits/merges */
  private _suppressInput = false;
  private _inputTimeout: any;
  private _storeUpdateTimeout: any;
  private _tableInputTimeout: any;

  // ─── Drag selection across blocks ────────────────────────────────────────────
  private _anchorCaret: { node: Node; offset: number } | null = null;
  private _crossBlockSelect = false;

  readonly activeBlockType = computed(() => {
    const chapter = this.store.activeChapter();
    const idx = this.focusedBlockIndex();
    if (!chapter || idx < 0 || idx >= chapter.body.length) return null;
    return chapter.body[idx].type;
  });

  onFocus(index: number) {
    this.lastFocusedIndex = index;
    this.focusedBlockIndex.set(index);
  }

  onPaste(chapterId: string, blockIndex: number, event: ClipboardEvent) {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    if (chapter.body[blockIndex] && this._nativeBlocks.has(chapter.body[blockIndex].type)) return;

    const items = event.clipboardData?.items;
    if (items) {
      const imageItems = Array.from(items).filter(item => item.type.startsWith('image/'));
      if (imageItems.length > 0) {
        event.preventDefault();
        for (const item of imageItems) {
          const file = item.getAsFile();
          if (!file) continue;
          this._readImageFile(file).then(({ dataUrl, width, height }) => {
            const assetKey = 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
            this.store.updateAsset(assetKey, dataUrl);
            const ch = this.store.activeChapter();
            const idx = this.lastFocusedIndex >= 0 ? this.lastFocusedIndex : (ch ? ch.body.length - 1 : 0);
            this.store.saveSnapshot();
            this.store.insertImageBlock(chapterId, idx, assetKey, width, height);
          });
        }
        return;
      }
    }

    const text = event.clipboardData?.getData('text/plain');
    if (!text || !text.includes('\n')) return; // Let default behavior handle single lines

    event.preventDefault();
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    if (lines.length === 0) return;

    this.store.saveSnapshot();
    const el = event.target as HTMLElement;
    const currentText = el.innerText.replace(/\n$/, '');
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(el);
    preRange.setEnd(range.startContainer, range.startOffset);
    const cursor = preRange.toString().length;

    const textBefore = currentText.substring(0, cursor);
    const textAfter = currentText.substring(cursor);

    const firstLine = lines[0];
    const lastLine = lines[lines.length - 1];
    const middleLines = lines.slice(1, lines.length - 1);

    // 1. Update current block with textBefore + firstLine
    const updatedFirstText = textBefore + firstLine;
    this.store.updateChapterBlock(chapterId, blockIndex, updatedFirstText);
    el.textContent = updatedFirstText;

    this._suppressInput = true;
    let currentIdx = blockIndex;

    // 2. Insert middle lines as new 'p' blocks
    for (const line of middleLines) {
      this.store.insertBlock(chapterId, currentIdx, 'p', line);
      currentIdx++;
    }

    // 3. Insert last line + textAfter as the final new block
    const finalLastText = lastLine + textAfter;
    this.store.insertBlock(chapterId, currentIdx, 'p', finalLastText);
    currentIdx++;

    setTimeout(() => {
      this._suppressInput = false;
      const lastEl = this._getEditableBlock(currentIdx);
      if (lastEl) {
        lastEl.focus();
        this._placeCursorAt(lastEl, lastLine.length);
      }
    }, 50);
  }

  onInput(chapterId: string, blockIndex: number, event: Event) {
    if (this._suppressInput) return;
    const element = event.target as HTMLElement;

    if (!this._inputTimeout) {
      this.store.saveSnapshot();
    }
    clearTimeout(this._inputTimeout);
    this._inputTimeout = setTimeout(() => {
      this._inputTimeout = null;
    }, 1000);

    clearTimeout(this._storeUpdateTimeout);
    this._storeUpdateTimeout = setTimeout(() => {
      const text = element.innerText.replace(/\n$/, '');
      const html = this.stripSpellErrors(element.innerHTML);
      this.store.updateChapterBlock(chapterId, blockIndex, text, html);
      const current = this.blockErrors();
      if (current[blockIndex]) {
        const next = { ...current };
        delete next[blockIndex];
        this.blockErrors.set(next);
      }
      this.scheduleSpellCheck();
    }, 200);
  }

  onToggleSpellCheck(): void {
    this.store.toggleSpellCheckPanel();
  }

  private stripSpellErrors(html: string): string {
    if (!html.includes('spell-err')) return html;
    return html.replace(/<span class="spell-err"[^>]*>/gi, '').replace(/<\/span>/gi, '');
  }

  private scheduleSpellCheck(): void {
    clearTimeout(this.spellCheckTimeout);
    this.spellCheckTimeout = setTimeout(() => {
      this.runSpellCheck();
    }, 1500);
  }

  private async runSpellCheck(): Promise<void> {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const lang = this.store.book()?.lang ?? 'en';
    const errors = await this.spellCheck.checkChapter(chapter.body, lang);
    const byBlock: Record<number, Misspelling[]> = {};
    for (const err of errors) {
      if (!byBlock[err.blockIndex]) byBlock[err.blockIndex] = [];
      byBlock[err.blockIndex].push(err);
    }
    this.blockErrors.set(byBlock);
  }

  // ─── Mouse handlers for cross-block drag selection ─────────────────────────

  @HostListener('click', ['$event'])
  onEditorClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const sup = target.closest('.fn-ref') as HTMLElement | null;
    if (sup) {
      event.preventDefault();
      const panel = document.querySelector('.ed__fnpanel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  @HostListener('mousedown', ['$event'])
  onEditorMouseDown(event: MouseEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.ed__doc')) return;

    const range = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (!range) return;

    this._anchorCaret = { node: range.startContainer, offset: range.startOffset };
    this._crossBlockSelect = false;
  }

  @HostListener('mousemove', ['$event'])
  onEditorMouseMove(event: MouseEvent) {
    if (event.buttons !== 1 || !this._anchorCaret) {
      this._crossBlockSelect = false;
      return;
    }

    const currentRange = document.caretRangeFromPoint(event.clientX, event.clientY);
    if (!currentRange) return;

    const anchorEditable = this._contenteditableOf(this._anchorCaret.node);
    const currentEditable = this._contenteditableOf(currentRange.startContainer);

    if (anchorEditable !== currentEditable) {
      this._crossBlockSelect = true;
    }

    if (this._crossBlockSelect) {
      const sel = window.getSelection();
      if (!sel) return;

      const newRange = document.createRange();
      const cmp = this._anchorCaret.node.compareDocumentPosition(currentRange.startContainer);
      const isSame = this._anchorCaret.node === currentRange.startContainer;
      const isForward = !!(cmp & Node.DOCUMENT_POSITION_FOLLOWING) || isSame;

      if (isForward) {
        newRange.setStart(this._anchorCaret.node, this._anchorCaret.offset);
        newRange.setEnd(currentRange.startContainer, currentRange.startOffset);
      } else {
        newRange.setStart(currentRange.startContainer, currentRange.startOffset);
        newRange.setEnd(this._anchorCaret.node, this._anchorCaret.offset);
      }

      sel.removeAllRanges();
      sel.addRange(newRange);
    }
  }

  @HostListener('mouseup', ['$event'])
  onEditorMouseUp(_event: MouseEvent) {
    this._anchorCaret = null;
    this._crossBlockSelect = false;
  }

  // ─── Key handler ────────────────────────────────────────────────────────────

  private _nativeBlocks = new Set(['list-ordered', 'list-unordered', 'table']);

  onKeyDown(chapterId: string, blockIndex: number, event: KeyboardEvent) {
    if (this._suppressInput) {
      event.preventDefault();
      return;
    }

    const chapter = this.store.activeChapter();
    const blockType = chapter?.body[blockIndex]?.type;
    const isNative = blockType && this._nativeBlocks.has(blockType);

    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
      event.preventDefault();
      const el = event.target as HTMLElement;
      this._savedCaretOffset = this._getCaretOffset(el);
      el?.blur();
      if (event.key.toLowerCase() === 'y' || event.shiftKey) {
        this.store.redo();
      } else {
        this.store.undo();
      }
      this._focusAfterHistory();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      this._selectAllBlocks();
      return;
    }

    const el = event.target as HTMLElement;

    switch (event.key) {

      // ── Quotes: convert " to smart quotes ──────────────────────────────
      case '"': {
        if (!this.store.tweaks.smartQuotes()) return;
        event.preventDefault();
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');
        const prevChar = offset > 0 ? text.charAt(offset - 1) : '';
        const isOpening = offset === 0 || /\s|[([<{¡¿]/.test(prevChar);

        const lang = this.store.domLang();
        const quote = lang === 'es'
          ? (isOpening ? '«' : '»')
          : (isOpening ? '“' : '”');

        document.execCommand('insertText', false, quote);
        break;
      }

      // ── Apostrophe: convert ' to smart apostrophe ────────────────────────
      case "'": {
        if (!this.store.tweaks.smartQuotes()) return;
        event.preventDefault();
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');
        const prevChar = offset > 0 ? text.charAt(offset - 1) : '';
        const isOpening = offset === 0 || /\s|[([<{¡¿]/.test(prevChar);

        const apostrophe = isOpening ? '‘' : '’';

        document.execCommand('insertText', false, apostrophe);
        break;
      }

      // ── Hyphen: convert -- to — or - at start to — ────────────────────────
      case '-': {
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');

        // 1. Double hyphen to em-dash
        if (this.store.tweaks.smartDashes() && offset > 0 && text.charAt(offset - 1) === '-') {
          event.preventDefault();
          document.execCommand('delete', false);
          document.execCommand('insertText', false, '—');
          return;
        }

        // 2. Hyphen at start of paragraph to em-dash (Spanish dialogue style)
        if (this.store.tweaks.smartDashes() && offset === 0 && this.store.domLang() === 'es') {
          event.preventDefault();
          document.execCommand('insertText', false, '—');
          return;
        }
        break;
      }

      // ── Dot: convert ... to … ───────────────────────────────────────────
      case '.': {
        if (!this.store.tweaks.smartEllipsis()) return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');

        if (offset >= 2 && text.charAt(offset - 1) === '.' && text.charAt(offset - 2) === '.') {
          event.preventDefault();
          document.execCommand('delete', false);
          document.execCommand('delete', false);
          document.execCommand('insertText', false, '…');
        }
        break;
      }

      // ── Opening Signs (Spanish): ?? -> ¿ and !! -> ¡ ────────────────────
      case '?':
      case '!': {
        if (!this.store.tweaks.smartOpeningSigns() || this.store.domLang() !== 'es') return;
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const offset = this._getCaretOffset(el);
        const text = el.innerText.replace(/\n$/, '');

        if (offset > 0 && text.charAt(offset - 1) === event.key) {
          event.preventDefault();
          document.execCommand('delete', false);
          const sign = event.key === '?' ? '¿' : '¡';
          document.execCommand('insertText', false, sign);
        }
        break;
      }

      // ── Enter: split block ────────────────────────────────────────────────
      case 'Enter': {
        if (isNative) return; // browser handles list/table natively
        event.preventDefault();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        this.store.saveSnapshot();

        const range = sel.getRangeAt(0);
        const currentText = el.innerText.replace(/\n$/, '');
        this.store.updateChapterBlock(chapterId, blockIndex, currentText);

        const preRange = document.createRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.startContainer, range.startOffset);
        const cursor = preRange.toString().length;

        const textBefore = currentText.substring(0, cursor);
        const textAfter = currentText.substring(cursor);

        // SYNC DOM MUTATION to prevent race condition before Angular re-renders
        el.textContent = textBefore;

        this._suppressInput = true;
        this.store.splitBlock(chapterId, blockIndex, cursor);

        setTimeout(() => {
          this._suppressInput = false;
          const cur = this._getEditableBlock(blockIndex);
          if (cur && cur.textContent !== textBefore) cur.textContent = textBefore;

          const next = this._getEditableBlock(blockIndex + 1);
          if (next) {
            if (next.textContent !== textAfter) next.textContent = textAfter;
            next.focus();
            this._placeCursorAt(next, 0);
          }
        }, 16);
        break;
      }

      // ── Backspace at start: merge with previous ───────────────────────────
      case 'Backspace': {
        if (isNative) return; // browser handles list/table natively
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;
        if (this._getCaretOffset(el) !== 0 || blockIndex <= 0) return;

        event.preventDefault();
        this.store.saveSnapshot();
        const chapter = this.store.chapters().find(c => c.id === chapterId);
        const prevData = chapter?.body[blockIndex - 1];

        if (prevData?.type === 'scene-break' || prevData?.type === 'image') {
          // Delete the non-editable block instead of merging into it
          this._suppressInput = true;
          this.store.deleteBlock(chapterId, blockIndex - 1);
          setTimeout(() => {
            this._suppressInput = false;
            // After deletion, current block is now at blockIndex - 1
            const cur = this._getEditableBlock(blockIndex - 1);
            if (cur) { cur.focus(); this._placeCursorAt(cur, 0); }
          }, 16);
        } else {
          const prevText = prevData?.text ?? '';
          const curText = chapter?.body[blockIndex]?.text ?? '';
          const mergedText = prevText + curText;

          // SYNC DOM MUTATION to prevent ghosting or rapid double-backspace cascade
          el.textContent = '';

          this._suppressInput = true;
          this.store.mergeWithPrevious(chapterId, blockIndex);

          setTimeout(() => {
            this._suppressInput = false;
            const merged = this._getEditableBlock(blockIndex - 1);
            if (merged) {
              if (merged.textContent !== mergedText) merged.textContent = mergedText;
              merged.focus();
              this._placeCursorAt(merged, prevText.length);
            }
          }, 16);
        }
        break;
      }

      // ── Delete at end: merge with next ────────────────────────────────────
      case 'Delete': {
        if (isNative) return; // browser handles list/table natively
        const sel = window.getSelection();
        if (!sel || !sel.isCollapsed) return;

        const textLen = el.textContent?.length ?? 0;
        if (this._getCaretOffset(el) < textLen) return; // not at end

        const chapter = this.store.chapters().find(c => c.id === chapterId);
        const nextData = chapter?.body[blockIndex + 1];
        if (!nextData) return;

        event.preventDefault();
        this.store.saveSnapshot();

        if (nextData.type === 'scene-break' || nextData.type === 'image') {
          // Delete the non-editable block
          this._suppressInput = true;
          this.store.deleteBlock(chapterId, blockIndex + 1);
          setTimeout(() => {
            this._suppressInput = false;
            const cur = this._getEditableBlock(blockIndex);
            if (cur) { cur.focus(); this._placeCursorAt(cur, textLen); }
          }, 16);
        } else {
          const curText = el.innerText.replace(/\n$/, '');
          const nextText = nextData.text ?? '';
          const mergedText = curText + nextText;

          // SYNC DOM MUTATION to prevent cascade if multiple deletes are fired
          el.textContent = mergedText;

          this._suppressInput = true;
          this.store.updateChapterBlock(chapterId, blockIndex, curText);
          this.store.mergeBlockWithNext(chapterId, blockIndex);

          setTimeout(() => {
            this._suppressInput = false;
            const cur = this._getEditableBlock(blockIndex);
            if (cur) {
              if (cur.textContent !== mergedText) cur.textContent = mergedText;
              cur.focus();
              this._placeCursorAt(cur, curText.length);
            }
          }, 16);
        }
        break;
      }

      // ── Arrow Left / Up: jump to previous editable block ─────────────────
      case 'ArrowLeft':
      case 'ArrowUp': {
        if (this._getCaretOffset(el) !== 0) return;
        const prevIdx = this._prevEditableIndex(blockIndex);
        if (prevIdx < 0) return;
        event.preventDefault();
        const prev = this._getEditableBlock(prevIdx);
        if (prev) {
          prev.focus();
          this._placeCursorAt(prev, prev.textContent?.length ?? 0);
        }
        break;
      }

      // ── Arrow Right / Down: jump to next editable block ───────────────────
      case 'ArrowRight':
      case 'ArrowDown': {
        const textLen = el.textContent?.length ?? 0;
        if (this._getCaretOffset(el) < textLen) return;
        const nextIdx = this._nextEditableIndex(blockIndex);
        if (nextIdx < 0) return;
        event.preventDefault();
        const next = this._getEditableBlock(nextIdx);
        if (next) {
          next.focus();
          this._placeCursorAt(next, 0);
        }
        break;
      }

      // ── F7: toggle spell check panel ────────────────────────────────────
      case 'F7': {
        event.preventDefault();
        this.onToggleSpellCheck();
        break;
      }
    }
  }

  /** Returns the nearest [contenteditable="true"] ancestor of a node, if any. */
  private _contenteditableOf(node: Node): HTMLElement | null {
    if (node.nodeType === Node.TEXT_NODE) {
      return (node.parentElement as HTMLElement)?.closest('[contenteditable="true"]') ?? null;
    }
    return (node as HTMLElement).closest('[contenteditable="true"]');
  }

  // ─── DOM helpers ────────────────────────────────────────────────────────────

  /**
   * Returns the contenteditable element for the block at store index `i`.
   * Uses the container position so scene-breaks don't shift the index.
   */
  private _getEditableBlock(i: number): HTMLElement | null {
    const containers = document.querySelectorAll<HTMLElement>('.ed__block-container');
    return containers[i]?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null;
  }

  private readonly _nonEditableTypes = new Set(['scene-break', 'image', 'page-break']);

  /** Returns the store index of the nearest editable block before `fromIndex`. */
  private _prevEditableIndex(fromIndex: number): number {
    const body = this.store.activeChapter()?.body ?? [];
    for (let i = fromIndex - 1; i >= 0; i--) {
      if (!this._nonEditableTypes.has(body[i].type)) return i;
    }
    return -1;
  }

  /** Returns the store index of the nearest editable block after `fromIndex`. */
  private _nextEditableIndex(fromIndex: number): number {
    const body = this.store.activeChapter()?.body ?? [];
    for (let i = fromIndex + 1; i < body.length; i++) {
      if (!this._nonEditableTypes.has(body[i].type)) return i;
    }
    return -1;
  }

  /** Places the caret at a character offset within a contenteditable element. */
  private _placeCursorAt(el: HTMLElement, offset: number): void {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    let remaining = offset;
    let placed = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const len = node.textContent?.length ?? 0;
      if (remaining <= len) {
        range.setStart(node, remaining);
        placed = true;
        break;
      }
      remaining -= len;
    }
    if (!placed) { range.selectNodeContents(el); range.collapse(false); }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Returns the caret offset (in characters) from the start of the element. */
  private _getCaretOffset(el: HTMLElement): number {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return 0;
    const range = sel.getRangeAt(0);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString().length;
  }

  /** Selects all text across every contenteditable block in the chapter. */
  private _selectAllBlocks(): void {
    const doc = document.querySelector('.ed__doc');
    if (!doc) return;

    const editables = doc.querySelectorAll<HTMLElement>('[contenteditable="true"]');
    if (editables.length === 0) return;

    const sel = window.getSelection();
    if (!sel) return;

    const range = document.createRange();
    range.setStart(editables[0], 0);
    range.setEnd(editables[editables.length - 1], editables[editables.length - 1].childNodes.length);

    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ─── Other handlers ─────────────────────────────────────────────────────────

  onTypeChange(chapterId: string, blockIndex: number, event: Event) {
    this.store.saveSnapshot();
    const select = event.target as HTMLSelectElement;
    this.store.setBlockType(chapterId, blockIndex, select.value);
  }

  private _insertIndex() {
    return this.lastFocusedIndex >= 0
      ? this.lastFocusedIndex
      : this.store.activeChapter()!.body.length - 1;
  }

  insertSceneBreak() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'scene-break');
    this.store.insertBlock(chapterId, index + 1, 'p', '');
  }

  insertPageBreak() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'page-break');
    this.store.insertBlock(chapterId, index + 1, 'p', '');
  }

  insertOrderedList() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'list-ordered', '', '<ol><li></li></ol>');
  }

  insertUnorderedList() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'list-unordered', '', '<ul><li></li></ul>');
  }

  insertTable() {
    this.store.saveSnapshot();
    const chapterId = this.store.activeChapterId();
    const index = this._insertIndex();
    this.store.insertBlock(chapterId, index, 'table', '',
      '<table><tbody><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr><tr><td></td><td></td><td></td></tr></tbody></table>');
  }

  onTableInput(chapterId: string, blockIndex: number, event: Event) {
    if (this._suppressInput) return;
    const el = event.target as HTMLTableElement;
    const html = el.outerHTML;
    clearTimeout(this._tableInputTimeout);
    this._tableInputTimeout = setTimeout(() => {
      this.store.updateChapterBlock(chapterId, blockIndex, el.innerText.replace(/\n$/, ''), html);
    }, 500);
  }

  private get focusedTableCell(): HTMLTableCellElement | null {
    const el = document.activeElement;
    return el?.closest('td, th') || null;
  }

  tableInsertRowAbove() {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const rowIdx = cell.closest('tr')!.rowIndex;
    const row = table.insertRow(rowIdx);
    const cols = table.rows[0]?.cells.length || 1;
    for (let i = 0; i < cols; i++) row.insertCell();
    this.syncTableHtml(table);
  }

  tableInsertRowBelow() {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const row = table.insertRow(cell.closest('tr')!.rowIndex + 1);
    const cols = table.rows[0]?.cells.length || 1;
    for (let i = 0; i < cols; i++) row.insertCell();
    this.syncTableHtml(table);
  }

  tableInsertColLeft() {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const colIdx = cell.cellIndex;
    for (let i = 0; i < table.rows.length; i++) {
      table.rows[i].insertCell(colIdx);
    }
    this.syncTableHtml(table);
  }

  tableInsertColRight() {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const colIdx = cell.cellIndex + 1;
    for (let i = 0; i < table.rows.length; i++) {
      table.rows[i].insertCell(colIdx);
    }
    this.syncTableHtml(table);
  }

  tableDeleteRow() {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const rowIdx = cell.closest('tr')!.rowIndex;
    if (table.rows.length <= 1) return;
    table.deleteRow(rowIdx);
    this.syncTableHtml(table);
  }

  tableDeleteCol() {
    const cell = this.focusedTableCell;
    if (!cell) return;
    const table = cell.closest('table')!;
    const colIdx = cell.cellIndex;
    if (table.rows[0]?.cells.length <= 1) return;
    for (let i = 0; i < table.rows.length; i++) {
      table.rows[i].deleteCell(colIdx);
    }
    this.syncTableHtml(table);
  }

  private syncTableHtml(table: HTMLTableElement) {
    clearTimeout(this._tableInputTimeout);
    const html = table.outerHTML;
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const idx = this.lastFocusedIndex >= 0 ? this.lastFocusedIndex : 0;
    if (idx < 0 || idx >= chapter.body.length || chapter.body[idx].type !== 'table') return;
    this.store.saveSnapshot();
    this.store.updateChapterBlock(chapter.id, idx, table.innerText.replace(/\n$/, ''), html);
  }

  execCommand(command: string) {
    document.execCommand(command, false);
  }

  insertFootnote() {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const idx = this.lastFocusedIndex >= 0 ? this.lastFocusedIndex : 0;
    const block = chapter.body[idx];
    if (!block || block.type !== 'p' && block.type !== 'first-p' && block.type !== 'blockquote' && block.type !== 'h1' && block.type !== 'h2' && block.type !== 'h3' && block.type !== 'epigraph' && block.type !== 'verse' && block.type !== 'chapter-title') return;
    const fnId = 'fn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
    const fns = chapter.footnotes || [];
    const num = fns.length + 1;
    this.store.saveSnapshot();
    this.store.addFootnote(chapter.id, idx, fnId, '');
    document.execCommand('insertHTML', false, `<sup data-fn="${fnId}">[${num}]</sup>`);
    const el = document.activeElement as HTMLElement | null;
    if (el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  private syncFootnoteRefs(chapter: any): void {
    if (!chapter.footnotes?.length) return;
    const sorted = [...chapter.footnotes].sort((a: any, b: any) => {
      if (a.blockIndex !== b.blockIndex) return a.blockIndex - b.blockIndex;
      const htmlA = chapter.body[a.blockIndex]?.html || '';
      const htmlB = chapter.body[b.blockIndex]?.html || '';
      return htmlA.indexOf(`data-fn="${a.id}"`) - htmlB.indexOf(`data-fn="${b.id}"`);
    });
    let seq = 0;
    for (const fn of sorted) {
      const block = chapter.body[fn.blockIndex];
      if (!block) continue;
      const html = block.html || '';
      if (html.includes(`data-fn="${fn.id}"`)) {
        seq++;
        continue;
      }
      seq++;
      const ref = `<sup data-fn="${fn.id}" class="fn-ref">[${seq}]</sup>`;
      const newHtml = html ? html + ref : ref;
      this.store.updateChapterBlock(chapter.id, fn.blockIndex, block.text || '', newHtml);
    }
  }

  onFootnoteInput(chapterId: string, fnId: string, event: Event) {
    const textarea = event.target as HTMLTextAreaElement;
    this.store.updateFootnote(chapterId, fnId, textarea.value);
  }

  onDeleteFootnote(chapterId: string, fnId: string) {
    this.store.saveSnapshot();
    const chapter = this.store.activeChapter();
    if (chapter) {
      for (const block of chapter.body) {
        if (block.html && block.html.includes(`data-fn="${fnId}"`)) {
          const cleaned = block.html.replace(new RegExp(`<sup[^>]*data-fn="${fnId}"[^>]*>\\[\\d+\\]<\\/sup>`, 'g'), '');
          const idx = chapter.body.indexOf(block);
          this.store.updateChapterBlock(chapterId, idx, block.text || '', cleaned);
        }
      }
    }
    this.store.deleteFootnote(chapterId, fnId);
  }

  toggleQuote() {
    const chapter = this.store.activeChapter();
    if (!chapter) return;
    const idx = this.lastFocusedIndex >= 0 ? this.lastFocusedIndex : 0;
    const block = chapter.body[idx];
    if (!block) return;
    const newType = block.type === 'blockquote' ? 'p' : 'blockquote';
    this.store.saveSnapshot();
    this.store.setBlockType(chapter.id, idx, newType);
  }

  insertImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      this._readImageFile(file).then(({ dataUrl, width, height }) => {
        const assetKey = 'img-' + Date.now().toString(36);
        this.store.updateAsset(assetKey, dataUrl);
        const chapterId = this.store.activeChapterId();
        const index = this.lastFocusedIndex >= 0
          ? this.lastFocusedIndex
          : this.store.activeChapter()!.body.length - 1;
        this.store.saveSnapshot();
        this.store.insertImageBlock(chapterId, index, assetKey, width, height);
      });
    };
    input.click();
  }

  pickImageForBlock(chapterId: string, blockIndex: number) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      this._readImageFile(file).then(({ dataUrl, width, height }) => {
        const assetKey = 'img-' + Date.now().toString(36);
        this.store.updateAsset(assetKey, dataUrl);
        this.store.saveSnapshot();
        this.store.updateImageSize(chapterId, blockIndex, width, height);
        this.store.setImageSrc(chapterId, blockIndex, assetKey);
      });
    };
    input.click();
  }

  onImageResizeStart(event: MouseEvent, chapterId: string, blockIndex: number, img: HTMLImageElement) {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startW = img.offsetWidth;
    const startH = img.offsetHeight;
    const aspect = startW / startH;

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const newW = Math.max(80, startW + dx);
      const newH = Math.round(newW / aspect);
      img.style.width = newW + 'px';
      img.style.height = newH + 'px';
    };

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const dx = e.clientX - startX;
      const newW = Math.max(80, startW + dx);
      const newH = Math.round(newW / aspect);
      this.store.saveSnapshot();
      this.store.updateImageSize(chapterId, blockIndex, newW, newH);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onImageCaptionInput(chapterId: string, blockIndex: number, event: Event) {
    const el = event.target as HTMLElement;
    this.store.updateImageCaption(chapterId, blockIndex, el.innerText);
  }

  onAttributionInput(chapterId: string, blockIndex: number, event: Event) {
    const el = event.target as HTMLElement;
    this.store.updateBlockAttribution(chapterId, blockIndex, el.innerText);
  }

  imageTransform(b: Block): string {
    const parts: string[] = [];
    if (b.rotation && b.rotation !== 0) parts.push(`rotate(${b.rotation}deg)`);
    if (b.flipH) parts.push('scaleX(-1)');
    if (b.flipV) parts.push('scaleY(-1)');
    return parts.join(' ') || 'none';
  }

  rotateImage(chapterId: string, blockIndex: number, b: Block, delta: number) {
    const current = b.rotation ?? 0;
    const next = (((current + delta) % 360) + 360) % 360;
    this.store.saveSnapshot();
    this.store.updateImageTransform(chapterId, blockIndex, { rotation: next });
  }

  flipImage(chapterId: string, blockIndex: number, b: Block, axis: 'h' | 'v') {
    this.store.saveSnapshot();
    if (axis === 'h') {
      this.store.updateImageTransform(chapterId, blockIndex, { flipH: !b.flipH });
    } else {
      this.store.updateImageTransform(chapterId, blockIndex, { flipV: !b.flipV });
    }
  }

  private _readImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas 2D not available')); return; }
          ctx.drawImage(img, 0, 0);
          resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
        };
        img.onerror = reject;
        img.src = reader.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  private _focusAfterHistory() {
    const savedOffset = this._savedCaretOffset;
    setTimeout(() => {
      let idx = this.lastFocusedIndex;
      if (idx < 0) idx = 0;
      const el = this._getEditableBlock(idx) || this._getEditableBlock(0);
      if (el) {
        el.focus();
        this._placeCursorAt(el, Math.min(savedOffset, el.textContent?.length ?? 0));
      }
    }, 50);
  }

  ngOnDestroy() {
    clearTimeout(this._inputTimeout);
    clearTimeout(this._storeUpdateTimeout);
    clearTimeout(this._tableInputTimeout);
  }
}

