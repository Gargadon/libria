import { Injectable, inject } from '@angular/core';
import { BookStore } from '../store/book.store';
import { Chapter, Block } from '../models/book.models';
@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private readonly store = inject(BookStore);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mammoth: any;

  async importDocx(file: File) {
    if (!this._mammoth) this._mammoth = await import('mammoth');
    const arrayBuffer = await file.arrayBuffer();
    const result = await this._mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
    const html = result.value;
// ... (rest of code)
    // Parse HTML to Libria Blocks
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const chapters: Chapter[] = [];
    let currentChapter: Chapter | null = null;

    const nodes = Array.from(doc.body.childNodes);
    
    nodes.forEach(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as HTMLElement;
      const tag = el.tagName.toLowerCase();
      const text = el.innerText.trim();
      
      if (!text && tag !== 'br') return;

      // Start new chapter on H1, H2 or if "Capítulo" is detected
      if (tag === 'h1' || tag === 'h2' || text.toLowerCase().startsWith('capítulo') || text.toLowerCase().startsWith('chapter')) {
        if (currentChapter) chapters.push(currentChapter);
        
        currentChapter = {
          id: 'ch-' + Math.random().toString(36).substr(2, 9),
          kind: 'chapter',
          title: text || 'Capítulo ' + (chapters.length + 1),
          words: 0,
          readMin: 0,
          number: chapters.length + 1,
          status: 'draft',
          body: []
        };
        
        currentChapter.body.push({ type: 'chapter-title', text: text });
      } else {
        if (!currentChapter) {
          // Create initial chapter if content starts without header
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
        
        if (tag === 'p') {
          // Preserve some basic HTML formatting if possible, but Libria prefers clean text
          // For now, let's keep it simple
          currentChapter.body.push({ 
            type: currentChapter.body.length === 1 && currentChapter.body[0].type === 'chapter-title' ? 'first-p' : 'p', 
            text: text 
          });
        } else if (tag === 'blockquote') {
          currentChapter.body.push({ type: 'blockquote', text: text });
        }
      }
    });

    if (currentChapter) chapters.push(currentChapter);

    if (chapters.length > 0) {
      this.updateStoreWithImport(chapters);
    }
  }

  async importTxt(file: File) {
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
