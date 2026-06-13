import { Injectable, inject, effect } from '@angular/core';
import { BookStore } from '../store/book.store';
import hyphen from 'hyphen';

type PatternModule = { default?: any; patterns?: any };

const PATTERN_LOADERS: Record<string, () => Promise<PatternModule>> = {
  es: () => import('hyphen/patterns/es'),
  'en-us': () => import('hyphen/patterns/en-us'),
  'en-gb': () => import('hyphen/patterns/en-gb'),
  fr: () => import('hyphen/patterns/fr'),
  it: () => import('hyphen/patterns/it'),
  de: () => import('hyphen/patterns/de-1996'),
  pt: () => import('hyphen/patterns/pt'),
};

function extractPattern(mod: PatternModule): any {
  if (!mod) return null;
  return mod.default || (mod.patterns ? mod : null) || mod;
}

@Injectable({ providedIn: 'root' })
export class HyphenService {
  private hyphenators = new Map<string, any>();
  private loading = new Set<string>();
  private store = inject(BookStore);

  constructor() {
    effect(() => {
      const lang = this.store.domLang().toLowerCase();
      if (this.store.tweaks.hyphenation()) {
        this.ensurePattern(lang);
      }
    });
  }

  private async ensurePattern(lang: string): Promise<void> {
    const key = lang.split('-')[0];
    const cacheKey = (PATTERN_LOADERS[lang] ? lang : PATTERN_LOADERS[key] ? key : '') as string;
    if (!cacheKey || this.hyphenators.has(cacheKey) || this.loading.has(cacheKey)) return;

    this.loading.add(cacheKey);
    try {
      const mod = await PATTERN_LOADERS[cacheKey]();
      const pattern = extractPattern(mod);
      if (pattern) {
        this.hyphenators.set(cacheKey, hyphen(pattern, { html: true }));
      }
    } catch {
      // pattern loading failed silently
    }
  }

  hyphenateHtml(htmlOrText: string): string {
    if (!htmlOrText) return '';

    const isEnabled = this.store.tweaks.hyphenation();
    if (!isEnabled) return htmlOrText;

    const lang = this.store.domLang().toLowerCase();
    const key = lang.split('-')[0];
    const cacheKey = (PATTERN_LOADERS[lang] ? lang : PATTERN_LOADERS[key] ? key : '') as string;
    if (!cacheKey) return htmlOrText;

    const hyphenator = this.hyphenators.get(cacheKey);
    if (!hyphenator) {
      this.ensurePattern(lang);
      return htmlOrText;
    }

    try {
      return hyphenator(htmlOrText);
    } catch {
      return htmlOrText;
    }
  }
}
