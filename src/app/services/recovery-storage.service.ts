import { Injectable } from '@angular/core';

export interface RecoveryVersion {
  id: string;
  projectId: string;
  title: string;
  savedAt: string;
  content: string;
}

type ChapterSummary = { id: string; title: string };
export type RecoveryMetadata = Omit<RecoveryVersion, 'content'> & { chapters: ChapterSummary[]; size: number };

function summarize({ content, ...metadata }: RecoveryVersion, chapters?: ChapterSummary[]): RecoveryMetadata {
  if (!chapters) {
    try {
      chapters = JSON.parse(content).chapters.map(({ id, title }: ChapterSummary) => ({ id, title }));
    } catch {
      chapters = [];
    }
  }
  return { ...metadata, chapters: chapters ?? [], size: content.length * 2 };
}

/** Separate from user files and Drive; a failed transaction leaves older copies intact. */
@Injectable({ providedIn: 'root' })
export class RecoveryStorageService {
  private database?: Promise<IDBDatabase>;

  private async open(): Promise<IDBDatabase> {
    this.database ??= new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB unavailable')); return; }
      // Accept histories opened by earlier local builds without downgrading or deleting them.
      const request = indexedDB.open('libria-recovery', 2);
      request.onupgradeneeded = (event) => {
        const metadata = request.result.createObjectStore('metadata', { keyPath: 'id' });
        if (event.oldVersion === 0) {
          request.result.createObjectStore('versions', { keyPath: 'id' });
          return;
        }
        const cursor = request.transaction!.objectStore('versions').openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          metadata.put(summarize(row.value));
          row.continue();
        };
      };
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

  async list(): Promise<RecoveryMetadata[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('metadata', 'readonly');
      const request = tx.objectStore('metadata').getAll();
      tx.oncomplete = () => resolve((request.result as RecoveryMetadata[]).sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async read(id: string): Promise<string> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = db.transaction('versions').objectStore('versions').get(id);
      request.onsuccess = () => {
        if (request.result) resolve(request.result.content);
        else reject(new Error('Recovery version not found'));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async put(version: RecoveryVersion, chapters: ChapterSummary[]): Promise<void> {
    const entry = summarize(version, chapters);
    if (entry.size > 200 * 1024 * 1024) throw new Error('Recovery copy too large');
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['versions', 'metadata'], 'readwrite');
      const store = tx.objectStore('versions');
      const metadata = tx.objectStore('metadata');
      const request = metadata.getAll();
      request.onsuccess = () => {
        const all = [entry, ...(request.result as RecoveryMetadata[]).filter(v => v.id !== version.id)]
          .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
        const counts = new Map<string, number>();
        let bytes = 0;
        let retained = 0;
        all.forEach(v => {
          const count = counts.get(v.projectId) ?? 0;
          const size = v.size;
          // Prune in the same transaction as the new copy: quota failures roll everything back.
          if (count >= 10 || retained >= 50 || bytes + size > 200 * 1024 * 1024) {
            store.delete(v.id);
            metadata.delete(v.id);
          } else {
            counts.set(v.projectId, count + 1);
            bytes += size;
            retained++;
          }
        });
        store.put(version);
        metadata.put(entry);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
}
