import { Injectable } from '@angular/core';
import { PersonalConfig } from '../models/book.models';

const STORAGE_KEY = 'libria-personal-config';

const defaults: PersonalConfig = {
  avatar: ''
};

@Injectable({ providedIn: 'root' })
export class PersonalConfigService {

  load(): PersonalConfig {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return { ...defaults, ...JSON.parse(raw) };
      }
    } catch {}
    return { ...defaults };
  }

  save(config: PersonalConfig) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }
}
