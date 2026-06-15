import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AssetService {
  private _map = new Map<string, string>();
  readonly assets = signal<Record<string, string>>({});

  get(id: string): string | undefined {
    return this._map.get(id);
  }

  set(id: string, data: string) {
    this._map.set(id, data);
    this.assets.set(Object.fromEntries(this._map));
  }

  remove(id: string) {
    this._map.delete(id);
    this.assets.set(Object.fromEntries(this._map));
  }

  getAll(): Record<string, string> {
    return Object.fromEntries(this._map);
  }

  load(assets: Record<string, string> = {}) {
    this._map = new Map(Object.entries(assets));
    this.assets.set({ ...assets });
  }

  clear() {
    this._map.clear();
    this.assets.set({});
  }
}
