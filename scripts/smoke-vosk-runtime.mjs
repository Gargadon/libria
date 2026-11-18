import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { models, modelReady } from './prepare-vosk.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.resolve(process.argv[2] || path.join(root, 'build/tauri-resources/vosk'));
const binary = path.resolve(process.argv[3] || path.join(root, 'src-tauri/target/release', process.platform === 'win32' ? 'libria.exe' : 'libria'));
const manifest = JSON.parse(readFileSync(path.join(runtime, 'manifest.json')));
for (const [language, model] of Object.entries(models)) {
  if (manifest.models[language]?.sha256 !== model.sha256 || !modelReady(path.join(runtime, 'models', model.name))) {
    throw new Error(`Faltan recursos offline de dictado: ${language}`);
  }
}
if (!manifest.systemEngine && !existsSync(path.join(runtime, 'engine', manifest.engine.library))) throw new Error('Falta el motor Vosk empaquetado');
if (manifest.host && !existsSync(path.join(runtime, manifest.host))) throw new Error('Falta el auxiliar Vosk x64');
// Match the verbatim resource paths returned by Tauri in installed Windows builds.
const resourcePath = process.platform === 'win32' ? path.toNamespacedPath(runtime) : runtime;
const result = spawnSync(binary, ['--verify-dictation-resources', resourcePath], { stdio: 'inherit', windowsHide: true, timeout: 180_000 });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error('No se pudieron cargar el motor y los seis modelos empaquetados');
console.log('Dictado offline verificado: recursos locales completos, sin ventanas ni captura del micrófono.');
