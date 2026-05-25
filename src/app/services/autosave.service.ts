import { Injectable, inject, signal } from '@angular/core';
import { BookStore } from '../store/book.store';
import { FileService } from './file.service';

@Injectable({ providedIn: 'root' })
export class AutosaveService {
  private readonly store = inject(BookStore);
  private readonly fileService = inject(FileService);

  readonly lastSavedAt = signal<Date | null>(null);

  private intervalId: ReturnType<typeof setInterval> | null = null;

  init(intervalMs = 120_000) {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      if (this.store.isDirty() && this.fileService.canSilentSave) {
        this.fileService.saveLibriaFile().then(() => {
          this.lastSavedAt.set(new Date());
        });
      }
    }, intervalMs);
  }
}
