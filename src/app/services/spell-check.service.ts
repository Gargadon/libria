import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SpellCheckService {
  readonly revision = signal(0);
  private readonly browserDictionaryKey = 'libria-spelling-dictionary';
  private readonly dictionaries = new Map<string, Promise<import('nspell')>>();

  loadDictionary(language: string): Promise<import('nspell')> {
    const lang = language.split('-')[0];
    if (!['es', 'en', 'fr', 'it', 'pt'].includes(lang)) {
      return Promise.reject(new Error('Unsupported spelling language: ' + language));
    }
    let dictionary = this.dictionaries.get(lang);
    if (!dictionary) {
      dictionary = (async () => {
        const [{ default: nspell }, aff, dic] = await Promise.all([
          import('nspell'),
          fetch(new URL(`dictionaries/${lang}/index.aff`, document.baseURI)),
          fetch(new URL(`dictionaries/${lang}/index.dic`, document.baseURI)),
        ]);
        if (!aff.ok || !dic.ok) throw new Error('Cannot load spelling dictionary');
        const engine = nspell(await aff.text(), await dic.text());
        for (const word of await this.getCustomDictionary()) engine.add(word);
        return engine;
      })();
      this.dictionaries.set(lang, dictionary);
      void dictionary.catch(() => this.dictionaries.delete(lang));
    }
    return dictionary;
  }
  private get api() {
    return (window as Window & typeof globalThis).desktopAPI;
  }

  get isAvailable(): boolean {
    return !!this.api;
  }

  setLanguage(lang: string): Promise<void> {
    return this.api?.setSpellCheckerLanguage(lang) ?? Promise.resolve();
  }

  getCustomDictionary(): Promise<string[]> {
    if (this.api) return this.api.getCustomDictionary();
    try {
      const words: unknown = JSON.parse(localStorage.getItem(this.browserDictionaryKey) || '[]');
      return Promise.resolve(Array.isArray(words) ? words.filter((word): word is string => typeof word === 'string') : []);
    } catch { return Promise.resolve([]); }
  }

  async addWord(word: string): Promise<boolean> {
    let success: boolean;
    if (this.api) success = await this.api.addWordToDictionary(word);
    else {
      try {
        localStorage.setItem(this.browserDictionaryKey, JSON.stringify([...new Set([...await this.getCustomDictionary(), word])]));
        success = true;
      } catch { success = false; }
    }
    if (success) {
      for (const engine of this.dictionaries.values()) (await engine).add(word);
      this.revision.update(value => value + 1);
    }
    return success;
  }

  async removeWord(word: string): Promise<boolean> {
    let success: boolean;
    if (this.api) success = await this.api.removeWordFromDictionary(word);
    else {
      try {
        localStorage.setItem(this.browserDictionaryKey, JSON.stringify((await this.getCustomDictionary()).filter(value => value !== word)));
        success = true;
      } catch { success = false; }
    }
    if (success) {
      this.dictionaries.clear();
      this.revision.update(value => value + 1);
    }
    return success;
  }
}
