import { Injectable } from '@angular/core';
import { RecentProject } from '../models/book.models';

const STORAGE_KEY = 'libria-recent-projects';
const MAX_ITEMS = 5;

@Injectable({ providedIn: 'root' })
export class RecentProjectsService {
  getAll(): RecentProject[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const stored: RecentProject[] = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(stored)) return [];
      const local = stored.filter(project => project && typeof project.path === 'string' &&
        !/(^|\/)drive-cache\//i.test(project.path.replace(/\\/g, '/'))).slice(0, MAX_ITEMS);
      if (local.length !== stored.length) this.save(local);
      return local;
    } catch {
      return [];
    }
  }

  add(path: string, title: string, source: 'local' | 'drive' = 'local'): void {
    const list = this.getAll().filter(p => p.path !== path);
    if (source === 'drive' || /(^|\/)drive-cache\//i.test(path.replace(/\\/g, '/'))) {
      this.save(list);
      return;
    }
    list.unshift({ path, title, date: new Date().toISOString() });
    if (list.length > MAX_ITEMS) list.length = MAX_ITEMS;
    this.save(list);
  }

  remove(path: string): void {
    const list = this.getAll().filter(p => p.path !== path);
    this.save(list);
  }

  clear(): void {
    localStorage.removeItem(STORAGE_KEY);
  }

  private save(list: RecentProject[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {}
  }
}
