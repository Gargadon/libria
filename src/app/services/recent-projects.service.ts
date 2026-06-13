import { Injectable } from '@angular/core';
import { RecentProject } from '../models/book.models';

const STORAGE_KEY = 'libria-recent-projects';
const MAX_ITEMS = 10;

@Injectable({ providedIn: 'root' })
export class RecentProjectsService {
  getAll(): RecentProject[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  add(path: string, title: string): void {
    const list = this.getAll().filter(p => p.path !== path);
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
