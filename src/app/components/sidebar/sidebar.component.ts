import { Component, inject, computed, signal, HostListener, OnInit } from '@angular/core';
import { BookStore } from '../../store/book.store';
import { CommonModule } from '@angular/common';
import { Book, ChapterKind } from '../../models/book.models';
import { FormsModule } from '@angular/forms';
import { ExportService } from '../../services/export.service';
import { SpellCheckService } from '../../services/spell-check.service';
import { InputModalComponent } from '../modals/input-modal.component';
import { ConfirmModalComponent } from '../modals/confirm-modal.component';

import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, FormsModule, InputModalComponent, ConfirmModalComponent],
  template: `
    <aside class="sb" [class.sb--left]="store.tweaks.sidebar() === 'left'" [class.sb--right]="store.tweaks.sidebar() === 'right'">

      <button class="sb__close" (click)="store.closeSidebar()" title="Cerrar panel">
        <span class="material-symbols-outlined">close</span>
      </button>

      @switch (store.ui.activeNav()) {

        <!-- MANUSCRIPT VIEW -->
        @case ('manuscript') {
          <div class="sb__head">
            <div class="sb__crumb">
              <span class="sb__dot"></span>
              <span>Biblioteca / Manuscritos</span>
            </div>
            <div class="sb__title">{{ store.book()?.title }}</div>
            <div class="sb__author">por {{ store.book()?.authors?.[0] ?? 'Sin autor' }}</div>

            <div class="sb__stats">
              <div class="sb__stat">
                <div class="sb__statN">{{ store.totalWords().toLocaleString('es-ES') }}</div>
                <div class="sb__statL">palabras</div>
              </div>
              <div class="sb__stat">
                <div class="sb__statN">~{{ store.totalReadMin() }}<span>m</span></div>
                <div class="sb__statL">lectura</div>
              </div>
              <div class="sb__stat">
                <div class="sb__statN">{{ store.mainChaptersCount() }}</div>
                <div class="sb__statL">capítulos</div>
              </div>
            </div>
          </div>

          <div class="sb__content">
            <ng-container *ngTemplateOutlet="groupTemplate; context: { label: 'Preliminares', items: frontChapters() }"></ng-container>
            <ng-container *ngTemplateOutlet="groupTemplate; context: { label: 'Cuerpo de la obra', items: mainChapters(), numbered: true }"></ng-container>
            <ng-container *ngTemplateOutlet="groupTemplate; context: { label: 'Posliminares', items: backChapters() }"></ng-container>

            @if (store.activeChapter(); as active) {
              <div class="sb__section">Ajustes del elemento</div>
              <div class="sb__row">
                <div class="sb__label">Iniciar en página impar</div>
                <div class="sb__radio">
                  <button class="sb__opt" [class.sb__opt--on]="active.forceOddPage" (click)="store.updateChapterMeta(active.id, { forceOddPage: true })">sí</button>
                  <button class="sb__opt" [class.sb__opt--on]="!active.forceOddPage" (click)="store.updateChapterMeta(active.id, { forceOddPage: false })">no</button>
                </div>
              </div>
              <div class="sb__help">Inserta una página en blanco si es necesario para que el capítulo comience a la derecha.</div>
            }
          </div>

          <div class="sb__foot">
            <div class="sb__add-wrapper">
              <button class="sb__add" (click)="toggleAddMenu($event)">＋ Añadir elemento</button>
              @if (showAddMenu()) {
                <div class="sb__add-menu">
                  <div class="sb__add-item" (click)="add('front')">Página preliminar</div>
                  <div class="sb__add-item" (click)="add('chapter')">Capítulo</div>
                  <div class="sb__add-item" (click)="add('back')">Página posterior</div>
                </div>
              }
            </div>
            <div class="sb__legend">
              <span><i class="lg lg--ok"></i> revisado</span>
              <span><i class="lg lg--draft"></i> borrador</span>
              <span><i class="lg lg--out"></i> esbozo</span>
            </div>
          </div>
        }

        <!-- STYLES VIEW -->
        @case ('styles') {
          <div class="sb__head">
            <div class="sb__title">Estilos de tipografía</div>
            <div class="sb__author">Diseño visual del manuscrito</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">Tipografía del Cuerpo</div>
            <div class="sb__row">
              <div class="sb__label">Fuente</div>
              <select class="sb__select sb__select--font" 
                      [ngModel]="store.tweaks.bookFont()" 
                      (ngModelChange)="store.updateTweak('bookFont', $event)">
                <optgroup label="Serif (Clásicas)">
                  <option value="eb-garamond" style="font-family: 'EB Garamond', serif">EB Garamond</option>
                  <option value="crimson-pro" style="font-family: 'Crimson Pro', serif">Crimson Pro</option>
                  <option value="lora" style="font-family: 'Lora', serif">Lora</option>
                  <option value="spectral" style="font-family: 'Spectral', serif">Spectral</option>
                </optgroup>
                <optgroup label="Sans-Serif (Modernas)">
                  <option value="inter" style="font-family: 'Inter', sans-serif">Inter</option>
                  <option value="montserrat" style="font-family: 'Montserrat', sans-serif">Montserrat</option>
                </optgroup>
              </select>
            </div>

            <div class="sb__section">Párrafo</div>
            <div class="sb__row sb__row--col">
              <div class="sb__label">Tamaño ({{ store.tweaks.fontSize() }}pt)</div>
              <input type="range" min="8" max="16" step="0.5"
                     [ngModel]="store.tweaks.fontSize()" 
                     (ngModelChange)="store.updateTweak('fontSize', $event)">
            </div>

            <div class="sb__row sb__row--col">
              <div class="sb__label">Interlineado ({{ store.tweaks.lineHeight() }})</div>
              <input type="range" min="1" max="2.5" step="0.1" 
                     [ngModel]="store.tweaks.lineHeight()" 
                     (ngModelChange)="store.updateTweak('lineHeight', $event)">
            </div>

            <div class="sb__row sb__row--col">
              <div class="sb__label">Espaciado ({{ store.tweaks.paragraphSpacing() }}pt)</div>
              <input type="range" min="0" max="24" step="0.5"
                     [ngModel]="store.tweaks.paragraphSpacing()" 
                     (ngModelChange)="store.updateTweak('paragraphSpacing', $event)">
            </div>

            <div class="sb__section">Opciones</div>
            <div class="sb__row">
              <div class="sb__label">Sangría 1ª línea</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.indentFirstLine()" (click)="store.updateTweak('indentFirstLine', true)">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.indentFirstLine()" (click)="store.updateTweak('indentFirstLine', false)">no</button>
              </div>
            </div>

            @if (store.tweaks.indentFirstLine()) {
              <div class="sb__row sb__row--col">
                <div class="sb__label">Tamaño sangría ({{ store.tweaks.indentSize() }}cm)</div>
                <input type="range" min="0.1" max="2" step="0.1"
                       [ngModel]="store.tweaks.indentSize()"
                       (ngModelChange)="store.updateTweak('indentSize', $event)">
              </div>
            }

            <div class="sb__row">
              <div class="sb__label">Justificar texto</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.justifyText()" (click)="store.updateTweak('justifyText', true)">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.justifyText()" (click)="store.updateTweak('justifyText', false)">no</button>
              </div>
            </div>

            <div class="sb__row">
              <div class="sb__label">Separación silábica (Guiones)</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.hyphenation()" (click)="store.updateTweak('hyphenation', true)">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.hyphenation()" (click)="store.updateTweak('hyphenation', false)">no</button>
              </div>
            </div>

            <div class="sb__section">Letra Capitular (Inicio de capítulo)</div>
            <div class="sb__row">
              <div class="sb__label">Capitalizar primera letra</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.dropCap()" (click)="store.updateTweak('dropCap', true)">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.dropCap()" (click)="store.updateTweak('dropCap', false)">no</button>
              </div>
            </div>

            @if (store.tweaks.dropCap()) {
              <div class="sb__row sb__row--col">
                <div class="sb__label">Líneas que ocupa ({{ store.tweaks.dropCapLines() }})</div>
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
            <div class="sb__title">Maquetación de página</div>
            <div class="sb__author">Estructura y márgenes físicos</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">Márgenes (mm)</div>
            <div class="sb__grid">
              <div class="sb__field">
                <label class="sb__label">Superior</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginTop()" (ngModelChange)="store.updateTweak('marginTop', $event)">
              </div>
              <div class="sb__field">
                <label class="sb__label">Inferior</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginBottom()" (ngModelChange)="store.updateTweak('marginBottom', $event)">
              </div>
              <div class="sb__field">
                <label class="sb__label">Interior</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginInner()" (ngModelChange)="store.updateTweak('marginInner', $event)">
              </div>
              <div class="sb__field">
                <label class="sb__label">Exterior</label>
                <input type="number" class="sb__input" [ngModel]="store.tweaks.marginOuter()" (ngModelChange)="store.updateTweak('marginOuter', $event)">
              </div>
            </div>

            <div class="sb__section">Tipografía del Título</div>
            <div class="sb__row">
              <div class="sb__label">Fuente</div>
              <select class="sb__select sb__select--font" [ngModel]="store.tweaks.titleFont()" (ngModelChange)="store.updateTweak('titleFont', $event)">
                <optgroup label="Serif (Clásicas)">
                  <option value="eb-garamond" style="font-family: 'EB Garamond', serif">EB Garamond</option>
                  <option value="crimson-pro" style="font-family: 'Crimson Pro', serif">Crimson Pro</option>
                  <option value="lora" style="font-family: 'Lora', serif">Lora</option>
                  <option value="spectral" style="font-family: 'Spectral', serif">Spectral</option>
                </optgroup>
                <optgroup label="Sans-Serif (Modernas)">
                  <option value="inter" style="font-family: 'Inter', sans-serif">Inter</option>
                  <option value="montserrat" style="font-family: 'Montserrat', sans-serif">Montserrat</option>
                </optgroup>
              </select>
            </div>
            <div class="sb__row sb__row--col">
              <div class="sb__label">Tamaño ({{ store.tweaks.titleFontSize() }}pt)</div>
              <input type="range" min="12" max="36" step="0.5" [ngModel]="store.tweaks.titleFontSize()" (ngModelChange)="store.updateTweak('titleFontSize', $event)">
            </div>
            <div class="sb__row">
              <div class="sb__label">Alineación</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleAlignment() === 'left'" (click)="store.updateTweak('titleAlignment', 'left')">izq</button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleAlignment() === 'center'" (click)="store.updateTweak('titleAlignment', 'center')">cen</button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleAlignment() === 'right'" (click)="store.updateTweak('titleAlignment', 'right')">der</button>
              </div>
            </div>
            <div class="sb__row">
              <div class="sb__label">Estilo</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleBold()" (click)="store.updateTweak('titleBold', !store.tweaks.titleBold())"><b>B</b></button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleItalic()" (click)="store.updateTweak('titleItalic', !store.tweaks.titleItalic())"><i>I</i></button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.titleUnderline()" (click)="store.updateTweak('titleUnderline', !store.tweaks.titleUnderline())"><u>U</u></button>
              </div>
            </div>

            <div class="sb__section">Elementos de Página</div>
            <div class="sb__row">
              <div class="sb__label">Salto de Escena</div>
              <select class="sb__select" [ngModel]="store.tweaks.sceneBreakType()" (ngModelChange)="store.updateTweak('sceneBreakType', $event)">
                <option value="asterisks">✦ ✦ ✦</option>
                <option value="dots">· · ·</option>
                <option value="flourish">~ o ~</option>
                <option value="none">Espacio</option>
              </select>
            </div>

            <div class="sb__row">
              <div class="sb__label">Números de página</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.showPageNumbers()" (click)="store.updateTweak('showPageNumbers', true)">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.showPageNumbers()" (click)="store.updateTweak('showPageNumbers', false)">no</button>
              </div>
            </div>

            <div class="sb__row">
              <div class="sb__label">Posición Pág.</div>
              <select class="sb__select" [ngModel]="store.tweaks.pageNumberPosition()" (ngModelChange)="store.updateTweak('pageNumberPosition', $event)">
                <option value="bottom-center">Abajo Centro</option>
                <option value="bottom-edges">Abajo Extremos</option>
                <option value="top-edges">Arriba Extremos</option>
              </select>
            </div>

            <div class="sb__row">
              <div class="sb__label">Encabezado de página</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.showHeader()" (click)="store.updateTweak('showHeader', true)">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.showHeader()" (click)="store.updateTweak('showHeader', false)">no</button>
              </div>
            </div>
            @if (store.tweaks.showHeader()) {
              <div class="sb__row sb__row--col">
                <div class="sb__label">Texto Encabezado</div>
                <input type="text" class="sb__input" placeholder="Título o autor..." [ngModel]="store.tweaks.headerText()" (ngModelChange)="store.updateTweak('headerText', $event)">
              </div>
            }
          </div>
        }

        <!-- METADATA VIEW -->
        @case ('metadata') {
          <div class="sb__head">
            <div class="sb__title">Propiedades del Libro</div>
            <div class="sb__author">Metadatos y créditos</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">Portada</div>
            <div class="sb__cover-zone">
              @if (store.assets()['cover']) {
                <div class="sb__cover-preview">
                  <img [src]="store.assets()['cover']" alt="Portada">
                  <button class="sb__cover-del" (click)="removeCover()">×</button>
                </div>
              } @else {
                <label class="sb__cover-upload">
                  <input type="file" (change)="onCoverFile($event)" accept="image/*" hidden>
                  <div class="sb__cover-icon">🖼️</div>
                  <div class="sb__cover-text">Subir portada</div>
                  <div class="sb__cover-hint">JPG, PNG o WEBP</div>
                </label>
              }
            </div>

            <div class="sb__section">General</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">Título</label>
              <input type="text" class="sb__input" [(ngModel)]="localMetadata.title" (blur)="syncMetadata()">
            </div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">Subtítulo</label>
              <input type="text" class="sb__input" [(ngModel)]="localMetadata.subtitle" (blur)="syncMetadata()">
            </div>
            <div class="sb__grid">
              <div class="sb__field">
                <label class="sb__label">Año</label>
                <input type="number" class="sb__input" [(ngModel)]="localMetadata.year" (blur)="syncMetadata()">
              </div>
              <div class="sb__field">
                <label class="sb__label">ISBN</label>
                <input type="text" class="sb__input" [(ngModel)]="localMetadata.isbn" (blur)="syncMetadata()">
              </div>
            </div>

            <div class="sb__section">Créditos</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">Editorial</label>
              <input type="text" class="sb__input" [(ngModel)]="localMetadata.publisher" (blur)="syncMetadata()">
            </div>

            <div class="sb__row sb__row--col">
              <label class="sb__label">Autores</label>
              <div class="sb__list-editor">
                @for (a of localMetadata.authors; track $index) {
                  <div class="sb__list-item">
                    <input type="text" class="sb__input" [(ngModel)]="localMetadata.authors[$index]" (blur)="syncMetadata()">
                    <button class="sb__list-del" (click)="removeAuthor($index)">×</button>
                  </div>
                }
                <button class="sb__btn-link" (click)="addAuthor()">+ Añadir autor</button>
              </div>
            </div>

            <div class="sb__row sb__row--col">
              <label class="sb__label">Editores</label>
              <div class="sb__list-editor">
                @for (e of localMetadata.editors; track $index) {
                  <div class="sb__list-item">
                    <input type="text" class="sb__input" [(ngModel)]="localMetadata.editors[$index]" (blur)="syncMetadata()">
                    <button class="sb__list-del" (click)="removeEditor($index)">×</button>
                  </div>
                }
                <button class="sb__btn-link" (click)="addEditor()">+ Añadir editor</button>
              </div>
            </div>

            <div class="sb__section">Impresión</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">Tamaño de página</label>
              <select class="sb__select" [(ngModel)]="localMetadata.paperSize" (change)="syncMetadata()">
                <option value="5x8">Pocket (5 x 8 pulg)</option>
                <option value="6x9">Trade Paperback (6 x 9 pulg)</option>
                <option value="Letter">Carta US (8.5 x 11 pulg)</option>
                <option value="A5">A5 (148 x 210 mm)</option>
                <option value="A4">A4 (210 x 297 mm)</option>
              </select>
            </div>
          </div>
        }

        <!-- EXPORT VIEW -->
        @case ('export') {
          <div class="sb__head">
            <div class="sb__title">Generar Libro</div>
            <div class="sb__author">Exportar a formatos profesionales</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__export-card">
              <div class="sb__export-icon">EPUB</div>
              <div class="sb__export-info">
                <div class="sb__export-name">Libro Electrónico</div>
                <div class="sb__export-desc">Formato estándar compatible con Kindle y Apple Books.</div>
                <button class="sb__btn-primary" (click)="exportService.exportEpub()">Generar EPUB</button>
              </div>
            </div>

            <div class="sb__export-card">
              <div class="sb__export-icon">DOCX</div>
              <div class="sb__export-info">
                <div class="sb__export-name">Microsoft Word</div>
                <div class="sb__export-desc">Para revisiones externas o editores tradicionales.</div>
                <button class="sb__btn-primary" (click)="exportService.exportDocx()">Generar DOCX</button>
              </div>
            </div>

            <div class="sb__section">Opciones de Exportación</div>
            <div class="sb__row">
              <div class="sb__label">Incluir portada</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.exportPrefs.includeCover()" (click)="store.updateExportPrefs({ includeCover: true })">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.exportPrefs.includeCover()" (click)="store.updateExportPrefs({ includeCover: false })">no</button>
              </div>
            </div>
            <div class="sb__row">
              <div class="sb__label">Marginalia (Notas)</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.exportPrefs.includeNotes()" (click)="store.updateExportPrefs({ includeNotes: true })">sí</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.exportPrefs.includeNotes()" (click)="store.updateExportPrefs({ includeNotes: false })">no</button>
              </div>
            </div>
          </div>
        }
        
        <!-- SEARCH VIEW -->
        @case ('search') {
          <div class="sb__head">
            <div class="sb__crumb">
              <span class="sb__dot"></span>
              <span>Buscar y reemplazar</span>
            </div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__row sb__row--col">
              <label class="sb__label">Buscar</label>
              <input class="sb__input" type="text" placeholder="Palabra o frase…" 
                [ngModel]="store.searchQuery()" (ngModelChange)="store.search($event)"
                (keydown.enter)="store.search($any($event.target).value)" autofocus>
            </div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">Reemplazar con</label>
              <div class="sb__search-replace-row">
                <input class="sb__input" type="text" placeholder="Texto de reemplazo…"
                  [ngModel]="store.replaceQuery()" (ngModelChange)="store.setReplaceQuery($event)">
                <button class="sb__btn-primary sb__search-replace-btn" 
                  (click)="store.replaceAll(store.replaceQuery())"
                  [disabled]="!store.searchResults().length">Reemplazar todo</button>
              </div>
            </div>

            <div class="sb__section">
              {{ store.searchResults().length }} resultado{{ store.searchResults().length !== 1 ? 's' : '' }}
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
              <div class="sb__help">Sin resultados para «{{ store.searchQuery() }}».</div>
            }
          </div>
        }

        @case ('settings') {
          <div class="sb__head">
            <div class="sb__title">Ajustes</div>
            <div class="sb__author">Preferencias de la aplicación</div>
          </div>
          <div class="sb__content sb__content--padding">
            <div class="sb__section">Avatar</div>
            <div class="sb__avatar-zone">
              @if (store.personalConfig().avatar) {
                <div class="sb__avatar-preview">
                  <img [src]="store.personalConfig().avatar" alt="Avatar">
                  <button class="sb__avatar-del" (click)="removeAvatar()">×</button>
                  <div class="sb__help">No se usará en el documento, solo personaliza tu instancia de Libria.</div>

                </div>
              } @else {
                <label class="sb__avatar-upload">
                  <input type="file" (change)="onAvatarFile($event)" accept="image/*" hidden>
                  <div class="sb__avatar-icon">👤</div>
                  <div class="sb__avatar-text">Subir foto</div>
                </label>
              }
            </div>

            <div class="sb__section">Perfil</div>
            <div class="sb__row sb__row--col">
              <label class="sb__label">Nombre del Autor</label>
              <input class="sb__input" type="text" placeholder="Tu nombre..."
                [ngModel]="store.personalConfig().userName" (ngModelChange)="updateUserName($event)">
              <div class="sb__help">Este nombre se usará por defecto en los nuevos documentos.</div>
            </div>

            <div class="sb__section">Disposición</div>
            <div class="sb__row">
              <div class="sb__label">Barra lateral</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.sidebar() === 'left'" (click)="store.updateTweak('sidebar', 'left')">izquierda</button>
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.sidebar() === 'right'" (click)="store.updateTweak('sidebar', 'right')">derecha</button>
              </div>
            </div>

            <div class="sb__section">Ortografía</div>
            <div class="sb__row">
              <div class="sb__label">Corrector</div>
              <div class="sb__radio">
                <button class="sb__opt" [class.sb__opt--on]="store.tweaks.spellcheck()" (click)="store.updateTweak('spellcheck', true)">activado</button>
                <button class="sb__opt" [class.sb__opt--on]="!store.tweaks.spellcheck()" (click)="store.updateTweak('spellcheck', false)">desactivado</button>
              </div>
            </div>
            <div class="sb__row" [style.opacity]="store.tweaks.spellcheck() ? '1' : '0.5'" [style.pointer-events]="store.tweaks.spellcheck() ? 'auto' : 'none'">
              <div class="sb__label">Idioma</div>
              <select class="sb__select" [ngModel]="store.tweaks.spellcheckLang()" (ngModelChange)="store.updateTweak('spellcheckLang', $event)">
                <option value="es-MX">Español (México)</option>
                <option value="es-ES">Español (España)</option>
                <option value="en-US">English (US)</option>
                <option value="en-GB">English (UK)</option>
                <option value="fr">Français</option>
                <option value="it">Italiano</option>
              </select>
            </div>

            @if (spellCheckService.isAvailable) {
              <div class="sb__section">Diccionario personal</div>
              <div class="sb__row sb__row--col">
                <label class="sb__label">Añadir palabra</label>
                <div class="sb__dict-add-row">
                  <input class="sb__input" type="text" placeholder="Nueva palabra…" [(ngModel)]="newDictWord" (keydown.enter)="addDictWord()">
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
                <div class="sb__help">El diccionario personal está vacío. Añade palabras que el corrector marca incorrectamente (nombres, lugares, etc.).</div>
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
          title="Eliminar elemento"
          [message]="confirmMessage()"
          (close)="showConfirmModal.set(false)"
          (confirm)="onConfirmDelete()"
        ></app-confirm-modal>
      }
    </aside>

    <ng-template #groupTemplate let-label="label" let-items="items" let-numbered="numbered">
      <div class="sbg">
        <div class="sbg__label">{{ label }}</div>
        <ul class="sbg__list">
          @for (c of items; track c.id) {
            <li>
              <button
                class="sbi"
                [class.sbi--on]="store.activeChapterId() === c.id"
                (click)="store.setActiveChapter(c.id)"
              >
                <span class="sbi__num" (dblclick)="editNumber(c, $event)" title="Doble clic para cambiar número">
                  {{ numbered ? ((c.number || 0) | number:'2.0-0') : '·' }}
                </span>
                <span class="sbi__body">
                  <div class="sbi__title-row">
                    <span class="sbi__t" (dblclick)="editTitle(c, $event)" title="Doble clic para cambiar título">{{ c.title }}</span>
                    <button class="sbi__del" (click)="deleteChapter(c, $event)" title="Eliminar elemento">×</button>
                  </div>
                  <span class="sbi__bar">
                    <span
                      class="sbi__fill"
                      [class]="'sbi__fill--' + (c.status || (c.kind === 'chapter' ? 'ok' : 'front'))"
                      [style.width.%]="c.words ? Math.max(4, Math.round((c.words / store.maxWords()) * 100)) : 6"
                    ></span>
                  </span>
                  <span class="sbi__meta">
                    {{ c.words ? (c.words.toLocaleString('es-ES') + ' palabras') : '—' }}
                    {{ c.readMin ? ' · ' + c.readMin + ' min' : '' }}
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
  readonly exportService = inject(ExportService);
  readonly spellCheckService = inject(SpellCheckService);
  readonly Math = Math;

  dictWords = signal<string[]>([]);
  newDictWord = '';

  showAddMenu = signal(false);

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
        this.store.updateAsset('cover', e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }

  removeCover() {
    this.store.deleteAsset('cover');
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

  @HostListener('document:click')
  onDocumentClick() {
    this.showAddMenu.set(false);
  }

  toggleAddMenu(event: Event) {
    event.stopPropagation();
    this.showAddMenu.update(v => !v);
  }

  add(kind: ChapterKind) {
    this.store.addChapter(kind);
    this.showAddMenu.set(false);
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

  editNumber(chapter: any, event: Event) {
    event.stopPropagation();
    if (chapter.kind !== 'chapter') return;

    this.modalTitle.set('Editar número');
    this.modalLabel.set('Número de capítulo');
    this.modalValue.set(chapter.number || 0);
    this.modalInputType.set('number');
    this.modalTargetId.set(chapter.id);
    this.modalAction.set('number');
    this.showInputModal.set(true);
  }

  editTitle(chapter: any, event: Event) {
    event.stopPropagation();

    this.modalTitle.set('Editar título');
    this.modalLabel.set('Título');
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
    this.confirmMessage.set(`¿Estás seguro de que deseas eliminar "${chapter.title}"? Esta acción no se puede deshacer.`);
    this.confirmTargetId.set(chapter.id);
    this.showConfirmModal.set(true);
  }

  onConfirmDelete() {
    this.store.deleteChapter(this.confirmTargetId());
    this.showConfirmModal.set(false);
  }

  goToResult(r: any) {
    this.store.setActiveChapter(r.chapterId);
    this.store.setNav('manuscript');
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
}
