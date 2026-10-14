import { ChangeDetectionStrategy, AfterViewInit, Component, ElementRef, ViewChild, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RecoveryService } from '../../services/recovery.service';
import { BookStore } from '../../store/book.store';

@Component({
  selector: 'app-recovery-modal',
  standalone: true,
  imports: [TranslateModule, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog aria-labelledby="recovery-title" (cancel)="recovery.visible.set(false)">
        <header><h2 id="recovery-title">{{ 'recovery.title' | translate }}</h2>
          <button autofocus (click)="recovery.visible.set(false)">{{ 'recovery.close' | translate }}</button></header>
        <p>{{ 'recovery.description' | translate }}</p>
        @if (recovery.error()) { <p role="alert">{{ 'recovery.error' | translate }}</p> }
        @if (!recovery.versions().length) { <p>{{ 'recovery.empty' | translate }}</p> }
        @for (version of recovery.versions(); track version.id) {
          <article>
            <strong>{{ version.title }}</strong> <time>{{ version.savedAt | date:'medium' }}</time>
            <button [disabled]="recovery.busy()" (click)="recovery.restore(version)">{{ 'recovery.restore' | translate }}</button>
            @if (store.book()) {
              <label>{{ 'recovery.chapter' | translate }}
                <select #chapter><option value="">—</option>
                  @for (ch of recovery.chapters(version); track ch.id) { <option [value]="ch.id">{{ ch.title }}</option> }
                </select>
              </label>
              <button [disabled]="recovery.busy() || !chapter.value" (click)="recovery.restore(version, chapter.value)">{{ 'recovery.addChapter' | translate }}</button>
            }
          </article>
        }
    </dialog>
  `,
  styles: [`
    dialog::backdrop { background: #0008; }
    dialog { margin: auto; background: var(--paper); color: var(--ink); border: 1px solid var(--rule); border-radius: 10px; padding: 24px; width: min(720px, 90vw); max-height: 85vh; overflow: auto; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    article { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; border-top: 1px solid var(--rule); padding: 16px 0; }
    time { color: var(--ink-soft); } button, select { padding: 6px 10px; } label { display: flex; align-items: center; gap: 8px; }
  `],
  host: { '(document:keydown.escape)': 'recovery.visible.set(false)' },
})
export class RecoveryModalComponent implements AfterViewInit {
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  ngAfterViewInit() { this.dialog.nativeElement.showModal?.(); }
  readonly recovery = inject(RecoveryService);
  readonly store = inject(BookStore);
}
