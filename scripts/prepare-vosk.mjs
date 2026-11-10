import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { downloadFile } from './download-file.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const models = JSON.parse(readFileSync(path.join(root, 'src-tauri/src/speech/models.json')));
export const releases = JSON.parse(readFileSync(path.join(root, 'src-tauri/src/speech/releases.json')));
export function engineRelease(platform, arch, catalog = releases) {
  const key = platform === 'darwin' ? 'macos' : `${platform === 'win32' ? 'windows' : platform}-${({ x64: 'x86_64', arm64: 'aarch64' })[arch] || arch}`;
  // Windows ARM64 uses the official x64 engine in an isolated x64 helper process.
  const release = catalog[platform === 'win32' && arch === 'arm64' ? 'windows-x86_64' : key];
  if (!release) throw new Error(`No hay motor Vosk para ${platform}-${arch}`);
  return release;
}
async function hash(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
async function archive(cache, name, url, sha256, download) {
  const file = path.join(cache, `${sha256}-${name}.zip`);
  if (!existsSync(file) || await hash(file) !== sha256) {
    await rm(file, { force: true });
    await download(url, file, { timeout: 600_000 });
  }
  if (await hash(file) !== sha256) {
    await rm(file, { force: true });
    throw new Error(`SHA-256 incorrecto: ${name}`);
  }
  return file;
}
export async function extractVosk(archive, destination) {
  const zip = await JSZip.loadAsync(await readFile(archive));
  const files = Object.values(zip.files);
  if (files.length > 4096) throw new Error('Demasiadas entradas en el archivo Vosk');
  let bytes = 0;
  for (const file of files) {
    const original = file.unsafeOriginalName || file.name;
    if (original.includes('\\') || original.startsWith('/') || original.split('/').some(part => part === '..' || part.includes(':')) ||
        (Number(file.unixPermissions) & 0o170000) === 0o120000) throw new Error('Ruta insegura en el archivo Vosk');
    const target = path.join(destination, file.name);
    if (file.dir) { await mkdir(target, { recursive: true }); continue; }
    await mkdir(path.dirname(target), { recursive: true });
    const limit = new Transform({ transform(chunk, _encoding, next) {
      bytes += chunk.length;
      next(bytes > 512 * 1024 * 1024 ? new Error('Archivo Vosk demasiado grande') : null, chunk);
    } });
    await pipeline(file.nodeStream(), limit, createWriteStream(target));
  }
}
export function modelReady(directory) {
  return (existsSync(path.join(directory, 'am/final.mdl')) || existsSync(path.join(directory, 'final.mdl'))) &&
    (existsSync(path.join(directory, 'conf/mfcc.conf')) || existsSync(path.join(directory, 'mfcc.conf')));
}
async function buildWindowsHost(destination) {
  const manifest = path.join(root, 'src-tauri/vosk-host/Cargo.toml');
  const targetDir = path.join(root, 'src-tauri/target/vosk-host');
  const args = ['build', '--locked', '--release', '--manifest-path', manifest, '--target', 'x86_64-pc-windows-msvc', '--target-dir', targetDir];
  const result = spawnSync('cargo', args, { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('No se pudo compilar el auxiliar Vosk x64. Instala el target Rust x86_64-pc-windows-msvc.');
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(path.join(targetDir, 'x86_64-pc-windows-msvc/release/libria-vosk-host.exe'), destination);
}
export async function prepareVosk({
  destination = path.join(root, 'build/tauri-resources/vosk'),
  cache = path.join(root, 'tmp/vosk-downloads'), platform = process.platform, arch = process.arch,
  systemEngine = process.env.LIBRIA_VOSK_SYSTEM_ENGINE === '1',
  modelCatalog = models, releaseCatalog = releases, download = downloadFile, buildHost = buildWindowsHost,
} = {}) {
  if (systemEngine && platform !== 'linux') throw new Error('El motor de distribución solo se admite en Linux');
  await mkdir(cache, { recursive: true });
  await mkdir(path.dirname(destination), { recursive: true });
  const staging = await mkdtemp(path.join(path.dirname(destination), '.vosk-'));
  try {
    for (const [language, model] of Object.entries(modelCatalog)) {
      console.log(`Preparando modelo de dictado: ${language} (${model.name})`);
      const file = await archive(cache, model.name, `https://alphacephei.com/vosk/models/${model.name}.zip`, model.sha256, download);
      await extractVosk(file, path.join(staging, 'models'));
      if (!modelReady(path.join(staging, 'models', model.name))) throw new Error(`Modelo incompleto: ${model.name}`);
    }
    if (!systemEngine) {
      const release = engineRelease(platform, arch, releaseCatalog);
      const file = await archive(cache, `vosk-${platform}-${arch}-${release.version}`, release.url, release.sha256, download);
      await extractVosk(file, path.join(staging, 'engine'));
      if (!existsSync(path.join(staging, 'engine', release.library))) throw new Error('Falta la biblioteca Vosk');
      // Retain only native runtime files from the wheel; Python is never needed.
      for (const item of await readdir(path.join(staging, 'engine'))) {
        if (item !== 'vosk') await rm(path.join(staging, 'engine', item), { recursive: true, force: true });
      }
      for (const item of await readdir(path.join(staging, 'engine/vosk'))) {
        if (!/\.(so(?:\.\d+)*|dll|dylib|dyld)$/i.test(item)) await rm(path.join(staging, 'engine/vosk', item), { recursive: true, force: true });
      }
      if (platform === 'win32' && arch === 'arm64') await buildHost(path.join(staging, 'host/libria-vosk-host.exe'));
    }
    await copyFile(path.join(root, 'build/licenses/LICENSE-VOSK.txt'), path.join(staging, 'LICENSE-VOSK.txt'));
    await copyFile(path.join(root, 'build/licenses/NOTICE-VOSK.txt'), path.join(staging, 'NOTICE-VOSK.txt'));
    await writeFile(path.join(staging, 'manifest.json'), JSON.stringify({
      platform, arch, systemEngine, models: modelCatalog,
      engine: systemEngine ? null : engineRelease(platform, arch, releaseCatalog),
      host: platform === 'win32' && arch === 'arm64' ? 'host/libria-vosk-host.exe' : null,
    }, null, 2) + '\n');
    await rm(destination, { recursive: true, force: true });
    await rename(staging, destination);
    console.log(`Dictado preparado sin conexión: ${Object.keys(modelCatalog).join(', ')}`);
  } finally { await rm(staging, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareVosk({ systemEngine: process.argv.includes('--system-engine') || process.env.LIBRIA_VOSK_SYSTEM_ENGINE === '1' });
}
