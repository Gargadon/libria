import { createWriteStream } from 'node:fs';
import { rename, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export async function downloadFile(url, destination, { timeout = 180_000, attempts = 2, log = console.log } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const temporary = `${destination}.${randomUUID()}.part`;
    const signal = AbortSignal.timeout(timeout);
    try {
      log(`  Descargando ${new URL(url).pathname} (intento ${attempt}/${attempts})`);
      const response = await fetch(url, { signal, headers: { 'User-Agent': 'Libria' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (!response.body) throw new Error('Respuesta sin contenido');
      let received = 0;
      let lastLog = Date.now();
      const progress = new Transform({
        transform(chunk, encoding, callback) {
          received += chunk.length;
          if (Date.now() - lastLog >= 5000) {
            log(`  Descargados ${(received / 1048576).toFixed(1)} MiB`);
            lastLog = Date.now();
          }
          callback(null, chunk);
        },
      });
      await pipeline(response.body, progress, createWriteStream(temporary, { flags: 'wx' }), { signal });
      if (!received) throw new Error('Descarga vacía');
      await rename(temporary, destination);
      log(`  Descarga completa: ${(received / 1048576).toFixed(1)} MiB`);
      return;
    } catch (error) {
      await rm(temporary, { force: true });
      const message = signal.aborted
        ? `Tiempo de descarga agotado (${timeout / 1000} s)` : error.message;
      if (attempt === attempts) throw new Error(`No se pudo descargar ${new URL(url).pathname}: ${message}`);
      log(`  ${message}; reintentando…`);
    }
  }
}
