import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { BookStore } from '../store/book.store';
import { FileService } from './file.service';
import { RecoveryStorageService, RecoveryVersion } from './recovery-storage.service';
import { AssetService } from './asset.service';

@Injectable({ providedIn: 'root' })
export class RecoveryService {
  private readonly store = inject(BookStore);
  private readonly files = inject(FileService);
  private readonly storage = inject(RecoveryStorageService);
  private readonly assets = inject(AssetService);
  readonly versions = signal<RecoveryVersion[]>([]);
  readonly error = signal(false);
  readonly visible = signal(false);
  readonly busy = signal(false);
  private session = -1;
  private projectId = '';
  private pending?: RecoveryVersion;
  private lastContent = '';
  private checkpointId = '';
  private checkpointStarted = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private writeFailed = false;
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    void this.refresh();
    effect(() => {
      const session = this.store.documentSession();
      const book = this.store.book();
      // Track document and asset changes, including manuscripts that have never been saved.
      const content = book ? this.files.documentContent() : '';
      untracked(() => {
        if (session !== this.session) {
          void this.flush();
          this.session = session;
          this.projectId = crypto.randomUUID();
          this.lastContent = '';
          this.checkpointStarted = 0;
        }
        if (!book || content === this.lastContent) return;
        this.lastContent = content;
        if (!this.checkpointStarted || Date.now() - this.checkpointStarted >= 120_000) {
          this.checkpointId = crypto.randomUUID();
          this.checkpointStarted = Date.now();
        }
        this.pending = { id: this.checkpointId, projectId: this.projectId, title: book.title,
          savedAt: new Date().toISOString(), content };
        // Bounded interval: continuous typing cannot indefinitely postpone recovery.
        if (!this.timer) this.timer = setTimeout(() => { void this.flush(); }, 5000);
      });
    });
    const onHide = () => { if (document.visibilityState === 'hidden') void this.flush(); };
    const onPageHide = () => { void this.flush(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      void this.flush();
    });
  }

  async refresh(): Promise<void> {
    try { this.versions.set(await this.storage.list()); this.error.set(this.writeFailed); }
    catch { this.error.set(true); }
  }

  flush(): Promise<void> {
    clearTimeout(this.timer); this.timer = undefined;
    const version = this.pending;
    this.pending = undefined;
    if (!version) return this.queue;
    this.queue = this.queue.then(async () => {
      try {
        await this.storage.put(version);
        this.writeFailed = false;
        await this.refresh();
      } catch {
        this.writeFailed = true;
        this.error.set(true);
        if (!this.pending) this.pending = version;
      }
    });
    return this.queue;
  }

  async show(): Promise<void> {
    await this.flush(); await this.refresh(); this.visible.set(true);
  }

  async restore(version: RecoveryVersion, chapterId = ''): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      // Back up current work before replacing it. Never overwrite its original file.
      const current = this.files.documentContent();
      await this.flush();
      if (this.files.documentContent() !== current) return;
      if (this.error() && this.store.book()) return;
      this.files.validateExternalDocument(version.content);
      if (chapterId && this.store.book()) {
        const document = JSON.parse(version.content);
        const chapter = document.chapters.find((ch: { id: string }) => ch.id === chapterId);
        if (!chapter) throw new Error('Chapter not found');
        // Import as a new chapter; the existing chapter and its notes remain intact.
        const restored = structuredClone(chapter);
        restored.id = 'ch-' + crypto.randomUUID();
        restored.title += ' (' + new Date(version.savedAt).toLocaleString() + ')';
        for (const block of restored.body) {
          if (block.src && document.assets?.[block.src]) {
            const key = 'recovered-' + crypto.randomUUID();
            this.assets.set(key, document.assets[block.src]);
            block.src = key;
          }
        }
        this.store.saveSnapshot();
        const notes = (document.notes || []).filter((note: { chapterId: string }) => note.chapterId === chapterId)
          .map((note: object) => ({ ...note, id: 'note-' + crypto.randomUUID(), chapterId: restored.id }));
        this.store.addChapters([restored], notes);
      } else {
        this.files.openExternalDocument(version.content);
        this.store.markAsDirty();
      }
      this.visible.set(false);
    } catch { this.error.set(true); }
    finally { this.busy.set(false); }
  }

  chapters(version: RecoveryVersion): { id: string; title: string }[] {
    try { return JSON.parse(version.content).chapters; } catch { return []; }
  }
}
