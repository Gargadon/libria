import { Injectable } from '@angular/core';

export interface RecoveryVersion {
  id: string;
  projectId: string;
  title: string;
  savedAt: string;
  content: string;
}

/** Separate from user files and Drive; a failed transaction leaves older copies intact. */
@Injectable({ providedIn: 'root' })
export class RecoveryStorageService {
  private database?: Promise<IDBDatabase>;

  private async open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      const request = indexedDB.open('libria-recovery', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('versions', { keyPath: 'id' });
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); this.database = undefined; };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Recovery database blocked'));
    });
    try { return await this.database; }
    catch (error) { this.database = undefined; throw error; }
  }

  async list(): Promise<RecoveryVersion[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readonly');
      const request = tx.objectStore('versions').getAll();
      tx.oncomplete = () => resolve((request.result as RecoveryVersion[]).sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async put(version: RecoveryVersion): Promise<void> {
    if (version.content.length * 2 > 200 * 1024 * 1024) throw new Error('Recovery copy too large');
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('versions', 'readwrite');
      const store = tx.objectStore('versions');
      const request = store.getAll();
      request.onsuccess = () => {
        const all = [version, ...(request.result as RecoveryVersion[]).filter(v => v.id !== version.id)]
          .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        const counts = new Map<string, number>();
        let bytes = 0;
        let retained = 0;
        all.forEach(v => {
          const count = counts.get(v.projectId) ?? 0;
          const size = v.content.length * 2;
          // Prune in the same transaction as the new copy: quota failures roll everything back.
          if (count >= 10 || retained >= 50 || bytes + size > 200 * 1024 * 1024) store.delete(v.id);
          else {
            counts.set(v.projectId, count + 1);
            bytes += size;
            retained++;
          }
        });
        store.put(version);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}
