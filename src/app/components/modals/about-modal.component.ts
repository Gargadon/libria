import { Component, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';


@Component({
  selector: 'app-about-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="about-backdrop" (click)="close.emit()">
      <div class="about" (click)="$event.stopPropagation()">

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
              <dd>MIT</dd>
            </div>
          </dl>

          <div class="about__rule"></div>

          <p class="about__tagline">
            {{ 'about.tagline' | translate }}
          </p>

          <p class="about__copy">{{ 'about.copyright' | translate }}</p>

          <button class="about__close" (click)="close.emit()">{{ 'about.close' | translate }}</button>
        </div>

      </div>
    </div>
  `,
  styles: [`
    .about-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(26, 22, 18, .55);
      backdrop-filter: blur(6px);
      display: grid;
      place-items: center;
      z-index: 9000;
      animation: fadeIn .18s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .about {
      display: flex;
      width: 380px;
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
      font-family: var(--mono);
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
      margin: 14px 0 0;
    }

    .about__close {
      margin-top: 24px;
      padding: 8px 28px;
      border-radius: 8px;
      background: var(--ink);
      color: var(--paper);
      font-size: 13px;
      font-weight: 500;
      font-family: var(--ui);
      border: none;
      cursor: pointer;
      transition: background .15s;
    }

    .about__close:hover {
      background: var(--ink-2);
    }
  `]
})
export class AboutModalComponent {
  close = output<void>();
  readonly translate = inject(TranslateService);
  
  readonly platform = (() => {
    const raw = (window as any).electronAPI?.platform ?? 'web';
    return ({ win32: 'Windows', darwin: 'macOS', linux: 'Linux' } as Record<string, string>)[raw] ?? raw;
  })();
  
  readonly arch = (window as any).electronAPI?.arch ?? 'unknown';
  readonly environment = environment;
  readonly editionName = `${environment.edition} Edition`;
}
