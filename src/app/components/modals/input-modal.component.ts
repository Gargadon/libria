import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-input-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal__head">
          <h2 class="modal__title">{{ title() }}</h2>
          <button class="modal__close" (click)="close.emit()">×</button>
        </div>
        
        <div class="modal__body">
          <div class="form-group">
            <label>{{ label() }}</label>
            <input 
              [type]="inputType()" 
              [(ngModel)]="value" 
              [placeholder]="placeholder()"
              (keydown.enter)="save()"
              #inputField
              autofocus
            >
          </div>
        </div>

        <div class="modal__foot">
          <button class="btn" (click)="close.emit()">{{ 'input.cancel' | translate }}</button>
          <button class="btn btn--primary" (click)="save()">{{ 'input.accept' | translate }}</button>
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
      color: var(--ink);
    }
    .modal__close {
      font-size: 24px;
      color: var(--ink-mute);
      cursor: pointer;
    }
    .modal__body {
      padding: 20px;
    }
    .modal__foot {
      padding: 12px 20px;
      border-top: 1px solid var(--rule-soft);
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    input {
      width: 100%;
      padding: 10px;
      border: 1px solid var(--rule);
      border-radius: 8px;
      background: var(--paper);
      color: var(--ink);
      font-size: 14px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      color: var(--ink-mute);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
  `]
})
export class InputModalComponent {
  title = input<string>('Editar');
  label = input<string>('Valor');
  placeholder = input<string>('');
  inputType = input<string>('text');
  initialValue = input<string | number>('');

  close = output();
  submit = output<string | number>();
  
  value: string | number = '';

  ngOnInit() {
    this.value = this.initialValue();
  }

  save() {
    this.submit.emit(this.value);
  }
}
