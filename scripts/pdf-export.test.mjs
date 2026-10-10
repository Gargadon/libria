import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { exportPdf, findBrowser } from './pdf-export.mjs';

test('rejects invalid page sizes before starting a browser', async () => {
  for (const width of [0, -1, Infinity, NaN, 101]) {
    await assert.rejects(exportPdf('in', 'out', { pageSize: { width, height: 8 } }, '.'), /Tamaño/);
  }
});

test('passes the selected browser and exact page size to Vivliostyle', async () => {
  let options;
  await exportPdf('book.html', 'book.pdf', { pageSize: { width: 5, height: 8 } }, '.', {
    findBrowser: () => '/browser', build: async value => { options = value; },
  });
  assert.equal(options.size, '5in,8in');
  assert.equal(options.executableBrowser, '/browser');
  assert.equal(options.renderMode, 'local');
});

test('PDF/X conversion errors fail instead of returning a normal PDF', async () => {
  await assert.rejects(exportPdf('in', 'out', { pageSize: { width: 5, height: 8 }, pdfx: true }, '.', {
    findBrowser: () => '/browser', findGhostscript: () => '/gs', build: async () => {},
    spawnSync: () => ({ status: 1 }),
  }), /Ghostscript/);
});

test('uses the bundled offline browser and replaces the PDF after successful conversion', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'libria-pdf-test-'));
  try {
    writeFileSync(path.join(dir, 'browser'), '');
    writeFileSync(path.join(dir, 'browser.json'), JSON.stringify({ executable: 'browser' }));
    assert.equal(findBrowser(dir, {}, 'linux'), path.join(dir, 'browser'));
    const output = path.join(dir, 'book.pdf');
    await exportPdf('in', output, { pageSize: { width: 5, height: 8 }, pdfx: true }, dir, {
      findBrowser: () => '/browser', findGhostscript: () => '/gs', build: async () => writeFileSync(output, 'original'),
      spawnSync: (_gs, args) => {
        assert.ok(args.includes('-dPDFX'));
        writeFileSync(args.find(arg => arg.startsWith('-sOutputFile=')).slice(13), 'converted');
        return { status: 0 };
      },
    });
    assert.equal(readFileSync(output, 'utf8'), 'converted');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
