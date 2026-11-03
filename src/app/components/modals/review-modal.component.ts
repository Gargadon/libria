import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TranslateModule } from '@ngx-translate/core';
import { NoteRole } from '../../models/book.models';
import { BookStore } from '../../store/book.store';
import { ReviewService } from '../../services/review.service';
import { sanitizeRichHtml } from '../../utils/block-html';
import { ReviewChange } from '../../utils/review-changes';
import { markWholeBlock, renderReviewHtml } from '../../utils/review-marks';

/**
 * Vista de revisión: muestra el documento con las marcas derivadas del estado aceptado
 * y permite aceptar o rechazar cada cambio. No edita el texto: para eso está el editor.
 */
@Component({
  selector: 'app-review-modal',
  standalone: true,
  imports: [TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog aria-labelledby="review-title" (cancel)="review.hide()">
      <header>
        <h2 id="review-title">{{ 'review.title' | translate }}</h2>
        <button autofocus (click)="review.hide()">{{ 'review.close' | translate }}</button>
      </header>

      @if (!review.active()) {
        <p>{{ 'review.startHint' | translate }}</p>
        <div class="rev__start">
          <label>{{ 'review.author' | translate }}
            <input [value]="review.author()" (input)="review.author.set($any($event.target).value)" />
          </label>
          <label>{{ 'review.role' | translate }}
            <select [value]="review.role()" (change)="setRole($any($event.target).value)">
              @for (option of roles; track option) {
                <option [value]="option" [selected]="option === review.role()">{{ roleLabel(option) | translate }}</option>
              }
            </select>
          </label>
          <button [disabled]="!store.book()" (click)="review.start()">{{ 'review.start' | translate }}</button>
        </div>
      } @else {
        <div class="rev__bar">
          <span [attr.aria-live]="'polite'">{{ 'review.pending' | translate: { count: review.count() } }}</span>
          <button [disabled]="!review.count()" (click)="review.acceptAll()">{{ 'review.acceptAll' | translate }}</button>
          <button [disabled]="!review.count()" (click)="review.rejectAll()">{{ 'review.rejectAll' | translate }}</button>
          <button (click)="review.finish()">{{ 'review.finish' | translate }}</button>
          <button (click)="review.discard()">{{ 'review.discard' | translate }}</button>
          <button (click)="review.downloadReport()">{{ 'review.report' | translate }}</button>
        </div>

        @if (!review.count()) {
          <p>{{ 'review.empty' | translate }}</p>
        }
        @for (entry of entries(); track entry.chapter.id) {
          <section>
            <h3>{{ entry.chapter.title }}</h3>
            @for (item of entry.items; track item.change.id) {
              <article>
                <span class="rev__kind" aria-hidden="true">{{ prefix(item.change) }}</span>
                <div class="rev__marks" [innerHTML]="item.html"></div>
                <div class="rev__actions">
                  <button (click)="review.accept(item.change)">{{ 'review.accept' | translate }}</button>
                  <button (click)="review.reject(item.change)">{{ 'review.reject' | translate }}</button>
                </div>
              </article>
            }
          </section>
        }
      }
    </dialog>
  `,
  styles: [`
    dialog::backdrop { background: #0008; }
    dialog { margin: auto; background: var(--paper); color: var(--ink); border: 1px solid var(--rule); border-radius: 10px; padding: 20px 24px; width: min(880px, 92vw); max-height: 88vh; overflow: auto; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .rev__start { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
    .rev__start label { display: flex; flex-direction: column; gap: 4px; }
    .rev__bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; border-block: 1px solid var(--rule); padding-block: 10px; margin-block: 12px; }
    .rev__bar span { margin-right: auto; color: var(--ink-soft); }
    section { margin-top: 18px; }
    h3 { margin: 0 0 8px; font-size: 1em; }
    article { display: flex; gap: 12px; align-items: flex-start; border-left: 3px solid var(--rule); padding: 8px 12px; margin-bottom: 6px; }
    .rev__kind { font-weight: 700; color: var(--ink-soft); min-width: 1ch; }
    .rev__marks { flex: 1; line-height: 1.6; white-space: pre-wrap; }
    .rev__marks :is(ins, del) { border-radius: 2px; }
    .rev__actions { display: flex; gap: 6px; }
    button, input, select { padding: 5px 10px; }
  `],
  host: { '(document:keydown.escape)': 'review.hide()' },
})
export class ReviewModalComponent implements AfterViewInit {
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  readonly review = inject(ReviewService);
  readonly store = inject(BookStore);
  private readonly sanitizer = inject(DomSanitizer);

  readonly roles: NoteRole[] = ['author', 'editor', 'corrector', 'publisher'];

  readonly entries = computed(() =>
    this.review.groups().map((group) => ({
      chapter: group.chapter,
      items: group.changes.map((change) => ({ change, html: this.marksFor(change) })),
    })),
  );

  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal?.();
  }

  setRole(value: string): void {
    this.review.role.set(value as NoteRole);
  }

  roleLabel(role: NoteRole): string {
    return `notes.role${role.charAt(0).toUpperCase()}${role.slice(1)}`;
  }

  prefix(change: ReviewChange): string {
    if (change.kind === 'block-insert') return '+';
    if (change.kind === 'block-delete') return '−';
    if (change.kind === 'chapter-title') return '§';
    return '≈';
  }

  private marksFor(change: ReviewChange): SafeHtml {
    const html = change.kind === 'block-delete'
      ? markWholeBlock(change.beforeHtml, change.before, 'del')
      : change.kind === 'block-insert'
        ? markWholeBlock(change.afterHtml, change.after, 'ins')
        : renderReviewHtml(change.beforeHtml, change.before, change.after);
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeRichHtml(html));
  }
}
