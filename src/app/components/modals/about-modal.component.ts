import { Component, input, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';
import packageJson from '../../../../package.json';


@Component({
  selector: 'app-about-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="about-backdrop" (click)="close.emit()">
      <div class="about" role="dialog" aria-modal="true" aria-label="Acerca de Libria" (click)="$event.stopPropagation()">

        <div class="about__spine"></div>

        <div class="about__body">
          <div class="about__logo">
            <img src="libria.svg" alt="Libria" class="app-logo">
          </div>

          <h1 class="about__name">Libria</h1>
           <p class="about__edition">{{ editionName }}</p>

          <div class="about__rule"></div>

          <dl class="about__meta">
            <div class="about__row">
              <dt>{{ 'about.version' | translate }}</dt>
              <dd>{{ environment.version }}</dd>
            </div>
            <div class="about__row">
              <dt>{{ 'about.platform' | translate }}</dt>
              <dd>{{ platform }}</dd>
            </div>
            <div class="about__row">
              <dt>{{ 'about.architecture' | translate }}</dt>
              <dd>{{ arch }}</dd>
            </div>
            <div class="about__row">
              <dt>{{ 'about.license' | translate }}</dt>
              <dd>{{ license }}</dd>
            </div>
          </dl>

          <div class="about__rule"></div>

          <p class="about__tagline">
            {{ 'about.tagline' | translate }}
          </p>

          <p class="about__copy">{{ 'about.copyright' | translate }}</p>

          <div class="about__update" role="status" aria-live="polite">
            @if (update(); as available) {
              @switch (phase()) {
                @case ('downloading') { <p>Descargando Libria {{ available.version }}: {{ progress() }} %</p> }
                @case ('ready') { <p>Libria {{ available.version }} está lista. Se guardarán los cambios antes de reiniciar.</p> }
                @case ('installing') { <p>Preparando la instalación…</p> }
                @default { <p>Libria {{ available.version }} está disponible.</p> }
              }
            }
            @if (status()) { <p>{{ status() }}</p> }
          </div>

          <div class="about__actions">
            <button class="about__btn about__btn--secondary" [disabled]="checking() || phase() === 'downloading' || phase() === 'installing'" (click)="checkRequested.emit()">
              {{ checking() ? 'Buscando…' : ('about.checkForUpdates' | translate) }}
            </button>
            @if (update()) {
              <button class="about__btn" [disabled]="phase() === 'downloading' || phase() === 'installing'" (click)="updateRequested.emit()">
                {{ phase() === 'ready' ? 'Instalar y reiniciar' : phase() === 'downloading' ? 'Descargando…' : phase() === 'installing' ? 'Instalando…' : 'Descargar' }}
              </button>
            }
            <button class="about__btn" (click)="close.emit()">
              {{ 'about.close' | translate }}
            </button>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .about__update { color: var(--ink); font-size: 13px; max-width: 100%; overflow-wrap: anywhere; }
    .about__update p { margin: 0 0 12px; }
    .about__btn:disabled { opacity: .6; cursor: default; }
    .about__btn:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
    .about-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(26, 22, 18, .55);
      backdrop-filter: blur(6px);
      display: grid;
      place-items: center;
      z-index: 9000;
      animation: fadeIn .18s ease;
      overflow-y: auto;
      padding: 20px;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .about {
      display: flex;
      width: min(440px, 100%);
      max-height: calc(100dvh - 40px);
      border-radius: 16px;
      overflow: hidden;
      box-shadow:
        0 40px 80px -20px rgba(26, 22, 18, .5),
        0 0 0 1px rgba(26, 22, 18, .12);
      animation: slideUp .2s cubic-bezier(.22, 1, .36, 1);
    }

    @keyframes slideUp {
      from { transform: translateY(12px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }

    /* Book spine decoration */
    .about__spine {
      width: 10px;
      flex-shrink: 0;
      background: linear-gradient(180deg, var(--terra) 0%, var(--terra-2) 100%);
    }

    .about__body {
      flex: 1;
      min-width: 0;
      overflow-y: auto;
      background: var(--paper);
      padding: 36px 32px 28px;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .about__logo {
      width: 72px;
      height: 72px;
      border-radius: 18px;
      background: var(--paper-2);
      border: 1px solid var(--rule);
      display: grid;
      place-items: center;
      margin-bottom: 18px;
      box-shadow: 0 4px 12px rgba(26, 22, 18, .1);
    }

    .about__name {
      font-family: var(--display);
      font-size: 32px;
      font-weight: 400;
      letter-spacing: -.01em;
      margin: 0 0 4px;
      color: var(--ink);
    }

    .about__edition {
      font-size: 11px;
      letter-spacing: .18em;
      text-transform: uppercase;
      color: var(--terra);
      font-weight: 600;
      margin: 0;
    }

    .about__rule {
      width: 40px;
      height: 1px;
      background: var(--rule);
      margin: 22px 0;
    }

    .about__meta {
      width: 100%;
      margin: 0;
    }

    .about__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 0;
      border-bottom: 1px dashed var(--rule-soft);
      gap: 12px;
    }

    .about__row:last-child {
      border-bottom: none;
    }

    .about__row dt {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .1em;
      color: var(--ink-mute);
      font-weight: 600;
    }

    .about__row dd {
      font-family: var(--ui);
      font-size: 12px;
      color: var(--ink);
      margin: 0;
    }

    .about__tagline {
      font-size: 12px;
      color: var(--ink-soft);
      line-height: 1.6;
      margin: 0;
      font-style: italic;
    }

    .about__copy {
      font-size: 10px;
      color: var(--ink-mute);
      letter-spacing: .04em;
      margin: 14px 0 24px;
    }

    .about__actions {
      display: flex;
      gap: 12px;
      width: 100%;
      justify-content: center;
      flex-wrap: wrap;
    }

    .about__btn {
      padding: 8px 20px;
      border-radius: 8px;
      background: var(--ink);
      color: var(--paper);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--ui);
      border: none;
      cursor: pointer;
      transition: background .15s;
      flex: 1 0 auto;
    }

    .about__btn:hover {
      background: var(--ink-2);
    }

    .about__btn--secondary {
      background: var(--paper-2);
      color: var(--ink);
      border: 1px solid var(--rule);
    }

    .about__btn--secondary:hover {
      background: var(--rule-soft);
    }
  `]
})
export class AboutModalComponent {
  readonly license = packageJson.license;
  close = output<void>();
  checkRequested = output<void>();
  updateRequested = output<void>();
  update = input<DesktopUpdate | null>(null);
  phase = input('available');
  progress = input(0);
  status = input('');
  checking = input(false);
  readonly translate = inject(TranslateService);
  
  readonly platform = (() => {
    const raw = (window as any).desktopAPI?.platform ?? 'web';
    return ({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' } as Record<string, string>)[raw] ?? raw;
  })();
  
  readonly arch = (window as any).desktopAPI?.arch ?? 'unknown';
  readonly environment = environment;
  readonly editionName = `${environment.edition} Edition`;

}
