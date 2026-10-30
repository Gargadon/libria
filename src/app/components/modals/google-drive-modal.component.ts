import { Component, ChangeDetectionStrategy, inject, HostListener, signal, computed, effect, ElementRef, afterNextRender, DestroyRef } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { GoogleDriveService } from '../../services/google-drive.service';

@Component({
  selector: 'app-google-drive-modal', standalone: true,
  imports: [TranslateModule, DatePipe], changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './google-drive-modal.component.html', styleUrl: './google-drive-modal.component.scss',
})
export class GoogleDriveModalComponent {
  readonly drive = inject(GoogleDriveService);
  readonly tab = signal<'documents' | 'current'>(this.drive.currentRequested() ? 'current' : 'documents');
  readonly query = signal('');
  readonly filteredFiles = computed(() => this.drive.files().filter(file => file.name.toLocaleLowerCase().includes(this.query().trim().toLocaleLowerCase())));
  readonly working = computed(() => this.drive.busy() || this.drive.fileService.syncState() === 'working');
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  constructor() {
    effect(() => { if (this.drive.currentRequested()) this.tab.set('current'); });
    const previous = document.activeElement as HTMLElement | null;
    let wasConfirmingTrash = false;
    effect(() => {
      const confirming = !!this.drive.trashPending();
      if (confirming || wasConfirmingTrash) queueMicrotask(() => {
        this.element.nativeElement.querySelector<HTMLElement>(confirming ? '[data-trash-cancel]' : 'section')?.focus();
      });
      wasConfirmingTrash = confirming;
    });
    afterNextRender(() => this.element.nativeElement.querySelector<HTMLElement>('section')?.focus());
    inject(DestroyRef).onDestroy(() => { if (previous?.isConnected) previous.focus(); });
  }
  @HostListener('document:keydown.escape')
  close() {
    if (this.drive.connecting()) void this.drive.cancel();
    if (this.drive.busy() && !this.drive.connecting()) return;
    if (this.drive.trashPending()) { this.drive.trashPending.set(null); return; }
    this.drive.pending.set(null);
    this.drive.visible.set(false);
  }
  @HostListener('keydown', ['$event'])
  trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;
    const controls = [...this.element.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), summary, [tabindex="0"]')].filter(control => control.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === this.element.nativeElement.querySelector('section'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
}
