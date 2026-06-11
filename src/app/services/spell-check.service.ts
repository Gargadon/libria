import { Injectable, signal, computed } from '@angular/core';
import { Block, Misspelling } from '../models/book.models';
import nspell from 'nspell';

interface NSpellInstance {
  correct(word: string): boolean;
  suggest(word: string): string[];
  add(word: string): void;
  remove(word: string): void;
  wordCharacters(): string;
}

@Injectable({ providedIn: 'root' })
export class SpellCheckService {
  readonly ready = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  private nspell: NSpellInstance | null = null;
  private currentLang = '';
  private ignoredWords = new Set<string>();

  private get api() {
    return (window as Window & typeof globalThis).electronAPI;
  }

  get isAvailable(): boolean {
    return !!this.api;
  }

  private async loadDictionary(lang: string): Promise<void> {
    const langMap: Record<string, string> = {
      es: 'es',
      'en-us': 'en',
      'en-gb': 'en',
      en: 'en',
      fr: 'fr',
      it: 'it',
      pt: 'pt',
      'pt-br': 'pt',
    };
    const dictLang = langMap[lang] || 'en';

    if (this.currentLang === dictLang && this.nspell) {
      this.ready.set(true);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const affUrl = `dictionaries/${dictLang}/index.aff`;
      const dicUrl = `dictionaries/${dictLang}/index.dic`;

      const [affText, dicText] = await Promise.all([
        fetch(affUrl).then(r => {
          if (!r.ok) throw new Error(`Failed to load ${affUrl}`);
          return r.text();
        }),
        fetch(dicUrl).then(r => {
          if (!r.ok) throw new Error(`Failed to load ${dicUrl}`);
          return r.text();
        }),
      ]);

      this.nspell = nspell(affText, dicText) as unknown as NSpellInstance;
      this.currentLang = dictLang;
      this.ready.set(true);
      this.loading.set(false);
    } catch (err) {
      this.error.set(String(err));
      this.loading.set(false);
      this.ready.set(false);
    }
  }

  checkWord(word: string): boolean {
    if (!this.nspell || !word.trim()) return true;
    if (this.ignoredWords.has(word.toLowerCase())) return true;
    return this.nspell.correct(word);
  }

  getSuggestions(word: string): string[] {
    if (!this.nspell) return [];
    return this.nspell.suggest(word).slice(0, 8);
  }

  checkChapter(body: Block[], lang: string = 'en'): Promise<Misspelling[]> {
    return new Promise(async (resolve) => {
      await this.loadDictionary(lang);

      if (!this.nspell) {
        resolve([]);
        return;
      }

      const results: Misspelling[] = [];

      for (let i = 0; i < body.length; i++) {
        const block = body[i];
        const text = block.text || '';

        const wordChars = this.nspell!.wordCharacters();
        const regex = new RegExp(`[${wordChars}]+|[${wordChars}]+(?:'[${wordChars}]+)?`, 'g');
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
          const word = match[0];
          if (word.length <= 1) continue;
          if (this.ignoredWords.has(word.toLowerCase())) continue;
          if (!this.isProperNoun(word) && !this.checkWord(word)) {
            results.push({
              word,
              blockIndex: i,
              start: match.index,
              end: match.index + word.length,
              suggestions: this.getSuggestions(word),
            });
          }
        }
      }

      resolve(results);
    });
  }

  private isProperNoun(word: string): boolean {
    return /^[A-ZÁÉÍÓÚÀÈÌÒÙÄËÏÖÜ][a-záéíóúàèìòùäëïöü]+$/.test(word);
  }

  ignoreWord(word: string): void {
    this.ignoredWords.add(word.toLowerCase());
  }

  ignoreAllInChapter(word: string): void {
    this.ignoredWords.add(word.toLowerCase());
  }

  addToDictionary(word: string): void {
    this.ignoredWords.add(word.toLowerCase());
    if (this.api) {
      this.api.addWordToDictionary(word);
    }
  }

  resetIgnored(): void {
    this.ignoredWords.clear();
  }

  setLanguage(lang: string): Promise<void> {
    return this.api?.setSpellCheckerLanguage(lang) ?? Promise.resolve();
  }

  getCustomDictionary(): Promise<string[]> {
    return this.api?.getCustomDictionary() ?? Promise.resolve([]);
  }

  addWord(word: string): Promise<boolean> {
    return this.api?.addWordToDictionary(word) ?? Promise.resolve(false);
  }

  removeWord(word: string): Promise<boolean> {
    return this.api?.removeWordFromDictionary(word) ?? Promise.resolve(false);
  }
}
