import { Injectable, inject, signal } from '@angular/core';
import { BookStore } from '../store/book.store';
import { AssetService } from './asset.service';
import { parseDocxHtml } from '../utils/docx-import';
import { Chapter } from '../models/book.models';
@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private readonly store = inject(BookStore);
  private _mammoth?: typeof import('mammoth');

  private readonly assets = inject(AssetService);
  readonly warnings = signal<string[]>([]);

  async importDocx(file: File) {
    this.warnings.set([]);
    if (!this._mammoth) this._mammoth = await import('mammoth/mammoth.browser');
    const result = await this._mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() }, {
      externalFileAccess: false,
      styleMap: ["u => u", "strike => s"],
    });
    const parsed = parseDocxHtml(result.value);
    this.warnings.set([...new Set([
      ...result.messages.map(message => message.message),
      ...parsed.warnings,
    ])]);
    if (!parsed.chapters.length) throw new Error('No se encontró contenido importable en el documento.');
    this.store.saveSnapshot();
    for (const [key, data] of Object.entries(parsed.assets)) this.assets.set(key, data);
    this.updateStoreWithImport(parsed.chapters);
  }

  async importTxt(file: File) {
    this.warnings.set([]);
    const text = await file.text();
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
          id: 'ch-' + Math.random().toString(36).substr(2, 9),
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
            id: 'ch-initial',
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

    if (chapters.length > 0) {
      this.updateStoreWithImport(chapters);
    }
  }

  private updateStoreWithImport(newChapters: Chapter[]) {
    // We add words and readMin before updating store
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

    this.store.addChapters(processed);
  }
}
