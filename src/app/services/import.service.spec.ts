import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { Document, HeadingLevel, ImageRun, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import { ImportService } from './import.service';
import { BookStore } from '../store/book.store';
import { AssetService } from './asset.service';

// Exercise real DOCX -> Mammoth -> blocks, rather than mocking the converter.
describe('file import', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('starts a new manuscript only after importing content successfully', async () => {
    const store = TestBed.inject(BookStore);
    const importer = TestBed.inject(ImportService);
    await importer.importFile({ name: 'Vacío.txt', text: async () => ' ' } as File);
    expect(store.book()).toBeNull();
    expect(importer.warnings()).toHaveLength(1);

    await importer.importFile({
      name: 'Ejemplo.TXT',
      text: async () => 'Capítulo uno\n\nUn texto.',
    } as File);
    expect(store.book()?.title).toBe('Ejemplo');
    expect(store.chapters()).toHaveLength(1);
    expect(store.activeChapter()?.title).toBe('Capítulo uno');
    expect(store.activeChapter()?.body.every(block => block.id)).toBe(true);

    await importer.importFile({ name: 'Anexo.txt', text: async () => 'Más texto.' } as File);
    expect(store.book()?.title).toBe('Ejemplo');
    expect(store.chapters()).toHaveLength(2);
  });

  it('retains rich text, lists, tables and embedded images from a real archive', async () => {
    const store = TestBed.inject(BookStore);
    store.createNewProject();
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aDPsAAAAASUVORK5CYII='), ch => ch.charCodeAt(0));
    const doc = new Document({ sections: [{ children: [
      new Paragraph({ text: 'Importado', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun({ text: 'Negrita', bold: true }), new TextRun({ text: ' cursiva', italics: true })] }),
      new Paragraph({ text: 'Elemento', bullet: { level: 0 } }),
      new Table({ rows: [new TableRow({ children: [new TableCell({ children: [new Paragraph('Celda')] })] })] }),
      new Paragraph({ children: [new ImageRun({ type: 'png', data: png, transformation: { width: 1, height: 1 } })] }),
    ] }] });
    const buffer = await Packer.toArrayBuffer(doc);
    await TestBed.inject(ImportService).importDocx({ arrayBuffer: async () => buffer } as File);
    const imported = store.chapters().at(-1)!;
    expect(imported.title).toBe('Importado');
    expect(imported.body[1].html).toContain('<strong>Negrita</strong>');
    expect(imported.body[1].html).toContain('<em> cursiva</em>');
    expect(imported.body.some(b => b.type === 'list-unordered')).toBe(true);
    expect(imported.body.find(b => b.type === 'table')?.html).toContain('Celda');
    const image = imported.body.find(b => b.type === 'image')!;
    expect(TestBed.inject(AssetService).get(image.src!)).toContain('data:image/png;base64,');
  });
});
