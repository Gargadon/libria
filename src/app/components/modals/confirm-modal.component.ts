import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal__head">
          <h2 class="modal__title">{{ title() }}</h2>
          <button class="modal__close" (click)="close.emit()">×</button>
        </div>
        
        <div class="modal__body">
          <p class="modal__text">{{ message() }}</p>
        </div>

        <div class="modal__foot">
          <button class="btn" (click)="close.emit()">{{ 'confirm.cancel' | translate }}</button>
          <button class="btn btn--danger" (click)="confirm.emit()">{{ 'confirm.confirm' | translate }}</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      backdrop-filter: blur(4px);
      display: grid;
      place-items: center;
      z-index: 3100;
    }
    .modal {
      background: var(--paper, #ffffff);
      width: 400px;
      max-width: 90vw;
      border-radius: 16px;
      box-shadow: var(--shadow-lg);
      border: 1px solid var(--rule);
      display: flex;
      flex-direction: column;
    }
    .modal__head {
      padding: 16px 20px;
      border-bottom: 1px solid var(--rule-soft);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal__title {
      font-family: var(--display);
      font-size: 18px;
      margin: 0;
    }
    .modal__close {
      font-size: 24px;
      color: var(--ink-mute);
      cursor: pointer;
    }
    .modal__body {
      padding: 24px;
    }
    .modal__text {
      font-size: 14px;
      line-height: 1.5;
      color: var(--ink-2);
      margin: 0;
    }
    .modal__foot {
      padding: 12px 20px;
      border-top: 1px solid var(--rule-soft);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .btn--danger {
      background: var(--terra);
      color: white;
    }
    .btn--danger:hover {
      background: #8e5233;
    }
  `]
})
export class ConfirmModalComponent {
  title = input<string>('Confirmar acción');
  message = input<string>('¿Estás seguro de que deseas realizar esta acción?');

  close = output();
  confirm = output();
}
