import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Build a drag-to-Applications image without create-dmg's attach/detach cycle. */
export function buildMacosDmg(root, { arch, version, run = execFileSync }) {
  if (!['x64', 'arm64'].includes(arch)) throw new Error(`Arquitectura macOS inválida: ${arch}`);
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(version)) throw new Error('Versión de DMG inválida.');
  const bundle = path.resolve(root, 'src-tauri/target/release/bundle');
  const app = path.join(bundle, 'macos/Libria.app');
  if (!existsSync(app) || !statSync(app).isDirectory()) throw new Error(`No se encontró la aplicación: ${app}`);
  const destination = path.join(bundle, 'dmg');
  mkdirSync(destination, { recursive: true });
  const scratch = mkdtempSync(path.join(bundle, '.libria-dmg-'));
  const output = path.join(destination, `Libria_${version}_${arch}.dmg`);
  const execute = (command, args) => run(command, args, { stdio: 'inherit', timeout: 600_000, windowsHide: true });
  try {
    const content = path.join(scratch, 'content');
    mkdirSync(content);
    // ditto preserves the signed bundle, resource forks, and framework symlinks.
    execute('/usr/bin/ditto', [app, path.join(content, 'Libria.app')]);
    execute('/bin/ln', ['-s', '/Applications', path.join(content, 'Applications')]);
    const image = path.join(scratch, 'Libria.dmg');
    execute('/usr/bin/hdiutil', ['create', '-volname', 'Libria', '-srcfolder', content,
      '-format', 'UDZO', '-fs', 'HFS+', image]);
    execute('/usr/bin/hdiutil', ['verify', image]);
    if (!existsSync(image) || statSync(image).size === 0) throw new Error('El DMG generado está vacío o no existe.');
    // Publish only the completed, verified image; leave any previous installer intact on failure.
    renameSync(image, output);
    return output;
  } finally {
    if (path.dirname(scratch) !== bundle || !path.basename(scratch).startsWith('.libria-dmg-')) {
      throw new Error('Ruta temporal de DMG fuera del directorio de empaquetado.');
    }
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.platform !== 'darwin') throw new Error('Este script requiere macOS y hdiutil.');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    console.log(buildMacosDmg(root, { arch: process.arch, version }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
