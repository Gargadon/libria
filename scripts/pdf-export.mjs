import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function findBrowser(runtime, env = process.env, platform = process.platform) {
  const manifest = path.join(runtime, 'browser.json');
  const bundled = existsSync(manifest) ? path.join(runtime, JSON.parse(readFileSync(manifest, 'utf8')).executable) : null;
  const candidates = [env.LIBRIA_PDF_BROWSER, bundled];
  if (platform === 'win32') {
    for (const base of [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter(Boolean)) {
      candidates.push(path.join(base, 'Microsoft/Edge/Application/msedge.exe'), path.join(base, 'Google/Chrome/Application/chrome.exe'));
    }
  } else if (platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium');
  } else {
    candidates.push('/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome');
  }
  const found = candidates.find(candidate => candidate && existsSync(candidate));
  if (!found) throw new Error('No se encontró el navegador PDF. Ejecuta bun run tauri:prepare.');
  return found;
}

export function findGhostscript(runtime, env = process.env, platform = process.platform) {
  const bundled = path.join(runtime, 'gs', platform === 'win32' ? 'bin/gswin64c.exe' : 'gs');
  const candidates = [env.LIBRIA_GHOSTSCRIPT, bundled];
  // Development downloads live alongside the prepared runtime.
  candidates.push(path.resolve(runtime, '../bin', platform === 'win32' ? 'win/bin/gswin64c.exe' : platform === 'darwin' ? 'mac/gs' : 'linux/gs'));
  if (platform === 'win32') {
    const root = path.join(env.ProgramFiles || 'C:/Program Files', 'gs');
    if (existsSync(root)) for (const version of readdirSync(root).sort().reverse()) candidates.push(path.join(root, version, 'bin/gswin64c.exe'));
  } else candidates.push('/usr/bin/gs', '/opt/homebrew/bin/gs', '/usr/local/bin/gs');
  const found = candidates.find(candidate => candidate && existsSync(candidate));
  if (!found) throw new Error('Ghostscript es necesario para exportar PDF/X.');
  return found;
}

export async function exportPdf(input, output, options, runtime, dependencies = {}) {
  const width = Number(options?.pageSize?.width);
  const height = Number(options?.pageSize?.height);
  if (![width, height].every(value => Number.isFinite(value) && value > 0 && value <= 100)) throw new Error('Tamaño de página PDF inválido.');
  const executableBrowser = (dependencies.findBrowser || findBrowser)(runtime);
  const gs = options.pdfx ? (dependencies.findGhostscript || findGhostscript)(runtime) : null;
  const build = dependencies.build || (await import('@vivliostyle/cli')).build;
  await build({ input, output, size: `${width}in,${height}in`, logLevel: 'silent', renderMode: 'local', executableBrowser });
  if (gs) {
    const converted = output + '.pdfx';
    const result = (dependencies.spawnSync || spawnSync)(gs, [
      '-dPDFX', '-dNOPAUSE', '-dBATCH', '-sDEVICE=pdfwrite', `-sOutputFile=${converted}`,
      '-dCompatibilityLevel=1.7', '-sColorConversionStrategy=CMYK', '-sColorConversionStrategyForImages=CMYK',
      '-dProcessColorModel=/DeviceCMYK', '-dUseCIEColor', '-dRenderIntent=3', output,
    ], { timeout: 60000, windowsHide: true, stdio: 'pipe' });
    // Never silently return a normal PDF when PDF/X was requested.
    if (result.error || result.status !== 0 || !existsSync(converted)) throw new Error('Ghostscript no pudo convertir el PDF/X.');
    renameSync(converted, output);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [input, output, options, runtime] = process.argv.slice(2);
    if (!input || !output || !options || !runtime) throw new Error('Argumentos PDF inválidos.');
    await exportPdf(input, output, JSON.parse(readFileSync(options, 'utf8')), runtime);
  } catch {
    console.error('No se pudo completar la exportación PDF.');
    process.exitCode = 1;
  }
}
