import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { BookStore } from '../../store/book.store';

@Component({
  selector: 'app-outline',
  imports: [FormsModule, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './outline.component.html',
  styleUrl: './outline.component.scss',
})
export class OutlineComponent {
  readonly store = inject(BookStore);
  readonly sections = computed(() => {
    const chapters = this.store.chapters();
    return [
      { label: 'sidebar.preliminares', items: chapters.filter(chapter => chapter.kind === 'front') },
      { label: 'sidebar.body', items: chapters.filter(chapter => (chapter.kind ?? 'chapter') === 'chapter') },
      { label: 'sidebar.posliminares', items: chapters.filter(chapter => chapter.kind === 'back') },
    ].filter(section => section.items.length > 0);
  });

  openChapter(id: string) {
    this.store.setActiveChapter(id);
    this.store.setNav('manuscript');
  }
}
