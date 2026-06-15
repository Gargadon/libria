import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SpellCheckService {
  private get api() {
    return (window as Window & typeof globalThis).electronAPI;
  }

  get isAvailable(): boolean {
    return !!this.api;
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
