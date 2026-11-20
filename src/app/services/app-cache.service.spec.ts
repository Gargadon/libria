import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppCacheService } from './app-cache.service';
import { HyphenService } from './hyphen.service';
import { SpellCheckService } from './spell-check.service';

describe('AppCacheService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('clears origin caches and invalidates derived data while keeping saved settings', async () => {
    const hyphenation = { clearCache: vi.fn() };
    const spelling = { clearCache: vi.fn() };
    const removeCache = vi.fn(async () => true);
    vi.stubGlobal('caches', { keys: async () => ['assets', 'fonts'], delete: removeCache });
    const removeSetting = vi.spyOn(Storage.prototype, 'removeItem');
    const clearSettings = vi.spyOn(Storage.prototype, 'clear');
    TestBed.configureTestingModule({ providers: [
      { provide: HyphenService, useValue: hyphenation },
      { provide: SpellCheckService, useValue: spelling },
    ] });

    try {
      const service = TestBed.inject(AppCacheService);
      await service.clear();

      expect(removeCache.mock.calls).toEqual([['assets'], ['fonts']]);
      expect(hyphenation.clearCache).toHaveBeenCalledOnce();
      expect(spelling.clearCache).toHaveBeenCalledOnce();
      expect(service.revision()).toBe(1);
      expect(removeSetting).not.toHaveBeenCalled();
      expect(clearSettings).not.toHaveBeenCalled();
    } finally {
      removeSetting.mockRestore();
      clearSettings.mockRestore();
    }
  });
});
