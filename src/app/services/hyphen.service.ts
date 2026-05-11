import { Injectable, inject } from '@angular/core';
import { BookStore } from '../store/book.store';
import hyphen from 'hyphen';

// Importing patterns
import * as patternEs from 'hyphen/patterns/es';
import * as patternEnUs from 'hyphen/patterns/en-us';
import * as patternEnGb from 'hyphen/patterns/en-gb';
import * as patternFr from 'hyphen/patterns/fr';
import * as patternIt from 'hyphen/patterns/it';

@Injectable({ providedIn: 'root' })
export class HyphenService {
  private hyphenators = new Map<string, any>();
  private store = inject(BookStore);

  constructor() {
    this.init();
  }

  private init() {
    try {
      const getP = (p: any) => {
        if (!p) return null;
        return p.default || (p.patterns ? p : null) || p;
      };
      
      const es = getP(patternEs);
      const enUs = getP(patternEnUs);
      
      if (es) this.hyphenators.set('es', hyphen(es, { html: true }));
      if (enUs) this.hyphenators.set('en-us', hyphen(enUs, { html: true }));
      if (getP(patternEnGb)) this.hyphenators.set('en-gb', hyphen(getP(patternEnGb), { html: true }));
      if (getP(patternFr)) this.hyphenators.set('fr', hyphen(getP(patternFr), { html: true }));
      if (getP(patternIt)) this.hyphenators.set('it', hyphen(getP(patternIt), { html: true }));
    } catch (e) {
      // Silent fail in production
    }
  }

  hyphenateHtml(htmlOrText: string): string {
    if (!htmlOrText) return '';
    
    const isEnabled = this.store.tweaks.hyphenation();
    if (!isEnabled) return htmlOrText;

    const lang = this.store.domLang().toLowerCase();
    const hyphenator = this.hyphenators.get(lang) || this.hyphenators.get(lang.split('-')[0]);
    
    if (!hyphenator) {
      if (this.hyphenators.size === 0) {
        this.init();
        return this.hyphenateHtml(htmlOrText);
      }
      return htmlOrText;
    }
    
    try {
      return hyphenator(htmlOrText);
    } catch (e) {
      return htmlOrText;
    }
  }
}
