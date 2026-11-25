import { Injectable, inject, signal } from '@angular/core';
import { BookStore } from '../store/book.store';
import { AssetService } from './asset.service';
import { FileService } from './file.service';
import { parseDocxHtml } from '../utils/docx-import';
import { Chapter } from '../models/book.models';
import { createId } from '../utils/ids';
@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private readonly store = inject(BookStore);
  private _mammoth?: typeof import('mammoth');

  private readonly assets = inject(AssetService);
  private readonly files = inject(FileService);
  readonly warnings = signal<string[]>([]);
  readonly importing = signal(false);

  async importFile(file: File): Promise<void> {
    const extension = file.name.split('.').at(-1)?.toLowerCase();
    if (this.importing() || (extension !== 'txt' && extension !== 'docx')) return;

    const session = this.store.documentSession();
    this.importing.set(true);
    try {
      if (extension === 'docx') await this.importDocx(file);
      else await this.importTxt(file);
    } catch (error) {
      if (session === this.store.documentSession()) {
        this.warnings.set([error instanceof Error ? error.message : String(error)]);
      }
    } finally {
      this.importing.set(false);
    }
  }

  async importDocx(file: File) {
    const session = this.store.documentSession();
    this.warnings.set([]);
    if (!this._mammoth) this._mammoth = await import('mammoth/mammoth.browser');
    const result = await this._mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
      externalFileAccess: false,
      styleMap: ["u => u", "strike => s"],
    });
    if (session !== this.store.documentSession()) return;
    const parsed = parseDocxHtml(result.value);
    this.warnings.set([...new Set([
      ...result.messages.map(message => message.message),
      ...parsed.warnings,
    ])]);
    this.updateStoreWithImport(file, parsed.chapters, parsed.assets);
  }

  async importTxt(file: File) {
    const session = this.store.documentSession();
    this.warnings.set([]);
    const text = await file.text();
    if (session !== this.store.documentSession()) return;
    const lines = text.split(/\r?\n/);
    const chapters: Chapter[] = [];
    let currentChapter: Chapter | null = null;
    
    let currentParagraph = '';

    const flushParagraph = () => {
      if (currentParagraph.trim() && currentChapter) {
        currentChapter.body.push({ 
          type: currentChapter.body.length === 0 ? 'first-p' : 'p', 
          text: currentParagraph.trim() 
        });
        currentParagraph = '';
      }
    };

    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Look for chapter headings
      if (trimmed.toLowerCase().startsWith('capítulo') || trimmed.toLowerCase().startsWith('chapter')) {
        flushParagraph();
        if (currentChapter) chapters.push(currentChapter);
        
        currentChapter = {
          id: createId('ch'),
          kind: 'chapter',
          title: trimmed,
          words: 0,
          readMin: 0,
          number: chapters.length + 1,
          status: 'draft',
          body: [{ type: 'chapter-title', text: trimmed }]
        };
      } else if (trimmed === '') {
        flushParagraph();
      } else {
        if (!currentChapter) {
          currentChapter = {
            id: createId('ch'),
            kind: 'chapter',
            title: 'Inicio',
            words: 0,
            readMin: 0,
            number: 1,
            status: 'draft',
            body: []
          };
        }
        currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
      }
    });

    flushParagraph();
    if (currentChapter) chapters.push(currentChapter);

    this.updateStoreWithImport(file, chapters);
  }

  private updateStoreWithImport(file: File, newChapters: Chapter[], assets: Record<string, string> = {}) {
    if (!newChapters.length) throw new Error('No se encontró contenido importable en el documento.');
    const processed = newChapters.map(c => {
      const words = c.body.reduce((s, b) => {
        if (b.text) return s + b.text.split(/\s+/).filter(w => w.length > 0).length;
        return s;
      }, 0);
      return {
        ...c,
        words,
        readMin: Math.max(1, Math.ceil(words / 200))
      };
    });

    if (this.store.book()) {
      this.store.saveSnapshot();
      this.store.addChapters(processed);
    } else {
      this.files.newProject({ title: file.name.replace(/\.(docx|txt)$/i, '').trim(), chapters: processed });
    }
    for (const [key, data] of Object.entries(assets)) this.assets.set(key, data);
  }
}
