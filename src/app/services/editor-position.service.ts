import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class EditorPositionService {
  readonly position = signal<{ chapterId: string; blockIndex: number } | null>(null);
}
