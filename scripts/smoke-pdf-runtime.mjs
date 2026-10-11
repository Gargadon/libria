import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'build/tauri-resources');
const scratch = path.join(root, 'tmp');
mkdirSync(scratch, { recursive: true });
const directory = mkdtempSync(path.join(scratch, 'pdf-runtime-check-'));
try {
  const input = path.join(directory, 'book.html');
  const output = path.join(directory, 'book.pdf');
  const options = path.join(directory, 'options.json');
  writeFileSync(input, '<!doctype html><html lang="es"><head><title>Libria</title></head><body><p>Prueba de exportación de Libria.</p></body></html>');
  writeFileSync(options, JSON.stringify({ pageSize: { width: 5, height: 8 } }));
  const result = spawnSync(path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node'), [
    path.join(runtime, 'pdf/pdf-export.mjs'), input, output, options, runtime,
  ], { stdio: 'inherit', windowsHide: true, timeout: 180_000 });
  if (result.error) throw result.error;
  if (result.status !== 0 || readFileSync(output).subarray(0, 5).toString() !== '%PDF-') {
    throw new Error('El runtime empaquetado no pudo generar un PDF válido');
  }
  console.log(`PDF generado con el runtime empaquetado (${process.platform}-${process.arch})`);
} finally {
  if (path.dirname(directory) !== scratch) throw new Error('Directorio de prueba inválido');
  rmSync(directory, { recursive: true, force: true });
}
