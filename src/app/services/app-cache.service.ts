import { Injectable, inject, signal } from '@angular/core';
import { HyphenService } from './hyphen.service';
import { SpellCheckService } from './spell-check.service';

@Injectable({ providedIn: 'root' })
export class AppCacheService {
  private readonly hyphenation = inject(HyphenService);
  private readonly spelling = inject(SpellCheckService);
  private readonly generation = signal(0);
  readonly revision = this.generation.asReadonly();

  async clear(): Promise<void> {
    try {
      const storage = globalThis.caches;
      if (storage) {
        const names = await storage.keys();
        await Promise.all(names.map(name => storage.delete(name)));
      }
    } finally {
      this.hyphenation.clearCache();
      this.spelling.clearCache();
      this.generation.update(value => value + 1);
    }
  }
}
