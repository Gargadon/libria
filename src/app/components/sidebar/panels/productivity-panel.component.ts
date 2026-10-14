import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { BookStore } from '../../../store/book.store';

import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { FormsModule } from '@angular/forms';

import { PomodoroService } from '../../../services/pomodoro.service';

@Component({
  selector: 'app-sidebar-productivity',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  templateUrl: './productivity-panel.component.html',
})
export class SidebarProductivityPanelComponent {
  readonly maxWords = computed(() => {
    const counts = this.mainChapters().map((c) => c.words);
    return Math.max(100, ...counts);
  });

  readonly averageWords = computed(() => {
    const chapters = this.mainChapters();
    if (chapters.length === 0) return 0;
    const total = chapters.reduce((sum, c) => sum + c.words, 0);
    return Math.round(total / chapters.length);
  });

  readonly pomo = inject(PomodoroService);

  readonly dailyTargetWords = computed(() => {
    const target = this.store.writingGoals.targetWords();
    const current = this.store.totalWords();
    const days = this.store.daysToDeadline();
    if (target <= 0 || days === null || days <= 0) return 0;
    const remaining = target - current;
    if (remaining <= 0) return 0;
    return Math.round(remaining / days);
  });

  readonly mainChapters = computed(() => this.store.chapters().filter((c) => c.kind === 'chapter'));

  readonly store = inject(BookStore);
}
