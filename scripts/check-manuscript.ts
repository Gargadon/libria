// Local manuscript regression check. No manuscript content is stored in the repository.
// Run: bun scripts/check-manuscript.ts /absolute/path/book.libria
import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';
import hyphen from 'hyphen';
import spanish from 'hyphen/patterns/es';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { BookStore } from '../src/app/store/book.store';
import { AssetService } from '../src/app/services/asset.service';
import { HyphenService } from '../src/app/services/hyphen.service';
import { FontService } from '../src/app/services/font.service';
import { migrateLibriaDocument, validateLibriaDocument } from '../src/app/utils/document-validator';
import { pageSizeInches } from '../src/app/utils/block-maps';

const source = process.argv[2];
if (!source) throw new Error('Provide an absolute manuscript path');
const original = await readFile(source);
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const doc = migrateLibriaDocument(JSON.parse(original.toString()));
validateLibriaDocument(doc);
if (process.argv.includes('--with-frontmatter')) {
  const dedication = doc.chapters.find(c => c.title === 'Dedicatoria');
  if (dedication) for (const block of dedication.body) if (block.type === 'first-p') block.type = 'dedication';
  doc.chapters.unshift({ id: 'test-toc', kind: 'front', title: 'Índice', words: 0, body: [], templateId: 'toc' });
}
const dom = new JSDOM('');
Object.assign(globalThis, { window: dom.window, document: dom.window.document, DOMParser: dom.window.DOMParser });
const { ExportService } = await import('../src/app/services/export.service');
const output = await mkdtemp(join(tmpdir(), 'libria-manuscript-'));
const prefs = { includeCover: true, includeNotes: false, exportMode: 'all', selectedChapterIds: [] };
const store = {
  book: () => doc.metadata, chapters: () => doc.chapters, tweaks: () => doc.preferences,
  exportPrefs: () => prefs, bookFontFamily: () => 'Lora', titleFontFamily: () => 'Spectral',
  setExporting: () => {}, printPageMap: () => ({}),
};
const injector = Injector.create({ providers: [
  { provide: BookStore, useValue: store },
  { provide: TranslateService, useValue: { instant: (s: string) => s } },
  { provide: AssetService, useValue: { getAll: () => doc.assets || {} } },
  { provide: HyphenService, useValue: { hyphenateHtml: doc.preferences.hyphenation ? hyphen(spanish, { html: true }) : (s: string) => s } },
  { provide: FontService, useValue: {} },
] });
const exporter = runInInjectionContext(injector, () => new ExportService());
// Resolve bundled font requests locally; no manuscript data leaves this process.
globalThis.fetch = (async (url: string) => new Response(await readFile(join(import.meta.dir, '../public', url)))) as typeof fetch;
class NodeZip extends JSZip {
  override generateAsync(options: any): any { return super.generateAsync({ ...options, type: 'uint8array' }); }
}
(exporter as any)._jszip = NodeZip;
const writes: Promise<void>[] = [];
let epub: Uint8Array;
(exporter as any).downloadFile = (data: Uint8Array) => {
  epub = data;
  writes.push(writeFile(join(output, 'book.epub'), data));
};
await exporter.exportEpub();
await Promise.all(writes);
const zip = await JSZip.loadAsync(epub!);
const errors: string[] = [];
const visible = (block: { text?: string; html?: string }) => block.html
  ? new JSDOM(block.html).window.document.body.textContent || '' : block.text || '';
for (const chapter of doc.chapters) {
  const xml = await zip.file(`OEBPS/chapters/${chapter.id}.xhtml`)!.async('string');
  const parsed = new dom.window.DOMParser().parseFromString(xml, 'application/xhtml+xml');
  if (parsed.querySelector('parsererror')) errors.push(`Invalid XHTML: ${chapter.id}`);
  const text = parsed.documentElement.textContent || '';
  for (const block of chapter.body) {
    if (!text.includes(visible(block))) errors.push(`Missing EPUB text: ${chapter.id}/${block.type}`);
  }
}
const html = exporter.buildPrintHtml(doc.metadata, doc.chapters, doc.preferences, 'Lora', 'Spectral', undefined, doc.assets);
await writeFile(join(output, 'print.html'), html);
await writeFile(join(output, 'options.json'), JSON.stringify({ pageSize: pageSizeInches(doc.metadata!.paperSize), printBackground: true, margins: { top: doc.preferences.marginTop / 25.4, bottom: doc.preferences.marginBottom / 25.4, left: 0, right: 0 } }));
const print = new JSDOM(html).window.document;
for (const chapter of doc.chapters) {
  const text = (print.querySelector(`[data-id="${chapter.id}"]`)?.textContent || '').replace(/\u00ad/g, '');
  for (const block of chapter.body) {
    if (!text.includes(visible(block))) errors.push(`Missing print text: ${chapter.id}/${block.type}`);
  }
}
if (hash(original) !== hash(await readFile(source))) throw new Error('Source changed during check');
console.log(JSON.stringify({ output, chapters: doc.chapters.length, blocks: doc.chapters.reduce((n,c) => n+c.body.length,0), errors, sourceUnchanged: true }, null, 2));
if (errors.length) process.exitCode = 1;
