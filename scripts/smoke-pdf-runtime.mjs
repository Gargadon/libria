import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.resolve(process.argv[2] || path.join(root, 'build/tauri-resources'));
const scratch = path.join(root, 'tmp');
mkdirSync(scratch, { recursive: true });
const directory = mkdtempSync(path.join(scratch, 'pdf-runtime-check-'));
try {
  const input = path.join(directory, 'book.html');
  const output = path.join(directory, 'book.pdf');
  const options = path.join(directory, 'options.json');
  // Exercise offline assets, paged CSS, accented text and image embedding.
  const fonts = readFileSync(path.join(runtime, 'assets/fonts.css'), 'utf8').replace(
    /url\(([^)]+)\)/g,
    (_, relative) => `url(data:font/woff2;base64,${readFileSync(path.join(runtime, 'assets', relative)).toString('base64')})`,
  );
  const image = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="blue"/></svg>').toString('base64')}`;
  writeFileSync(input, `<!doctype html><html lang="es"><head><title>Libria</title><style>
    ${fonts}
    body { font-family: 'DM Serif Display'; }
    section + section { break-before: page; }
  </style></head><body><section><h1>Exportación de Libria</h1>
    <p>Español: áéíóú, ü, ñ. Français: œ, ç. Português: ã, õ.</p>
    <img alt="Imagen de prueba" src="${image}"></section>
    <section><h2>Segunda página</h2><p>Fuentes y recursos sin conexión.</p></section></body></html>`);
  writeFileSync(options, JSON.stringify({ pageSize: { width: 5, height: 8 } }));
  const result = spawnSync(path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'), [
    path.join(runtime, 'pdf/pdf-export.mjs'), input, output, options, runtime,
  ], { stdio: 'inherit', windowsHide: true, timeout: 180_000 });
  if (result.error) throw result.error;
  if (result.status !== 0 || readFileSync(output).subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('El runtime empaquetado no pudo generar un PDF válido');
  }
  const { PDFDocument, PDFDict, PDFName } = createRequire(path.join(runtime, 'pdf/package.json'))('pdf-lib');
  const document = await PDFDocument.load(readFileSync(output));
  if (document.getPageCount() !== 2) throw new Error('La exportación no conserva los saltos de página');
  for (const page of document.getPages()) {
    if (Math.abs(page.getWidth() - 360) > 1 || Math.abs(page.getHeight() - 576) > 1) {
      throw new Error('La exportación no conserva el tamaño de página');
    }
  }
  const fontNames = document.getPages().flatMap(page => {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    return (fonts?.values() || []).map(reference =>
      document.context.lookup(reference, PDFDict).lookupMaybe(PDFName.of('BaseFont'), PDFName)?.decodeText())
      .filter(Boolean);
  });
  if (!fontNames.some(name => /DM\s*Serif\s*Display/i.test(name))) {
    throw new Error(`La fuente local no se ha incorporado al PDF: ${fontNames.join(', ')}`);
  }
  console.log(`PDF generado con el runtime empaquetado (${process.platform}-${process.arch})`);
} finally {
  if (path.dirname(directory) !== scratch) throw new Error('Directorio de prueba inválido');
  rmSync(directory, { recursive: true, force: true });
}
