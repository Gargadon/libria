import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { prepareVosk, extractVosk, engineRelease, models, releases } from './prepare-vosk.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'libria-vosk-package-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const blobs = new Map(), catalog = {};
  for (const [language, model] of Object.entries(models)) {
    const zip = new JSZip();
    zip.file(`${model.name}/${language === 'pt' ? 'final.mdl' : 'am/final.mdl'}`, 'acoustic');
    zip.file(`${model.name}/${language === 'pt' ? 'mfcc.conf' : 'conf/mfcc.conf'}`, 'configuration');
    zip.file(`${model.name}/README`, model.license);
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    blobs.set(`https://alphacephei.com/vosk/models/${model.name}.zip`, bytes);
    catalog[language] = { ...model, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  const zip = new JSZip();
  for (const file of ['libvosk.so', 'libvosk.dll', 'libvosk.dylib', 'libvosk.dyld', 'libgcc_s_seh-1.dll']) zip.file(`vosk/${file}`, 'native');
  zip.file('vosk/__init__.py', 'unused');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  const engines = Object.fromEntries(Object.entries(releases).map(([key, release]) => {
    blobs.set(release.url, bytes);
    return [key, { ...release, sha256: createHash('sha256').update(bytes).digest('hex') }];
  }));
  const calls = [];
  const options = { destination: path.join(root, 'runtime'), cache: path.join(root, 'cache'), platform: 'linux', arch: 'x64',
    systemEngine: false, modelCatalog: catalog, releaseCatalog: engines,
    download: async (url, file) => { calls.push(url); assert.ok(blobs.has(url)); await writeFile(file, blobs.get(url)); } };
  return { root, options, calls };
}
test('bundles all six models and the native engine, reusing verified build downloads', async t => {
  const f = await fixture(t);
  await prepareVosk(f.options);
  assert.equal(f.calls.length, 7);
  if (process.platform !== 'win32') {
    assert.equal((await stat(f.options.destination)).mode & 0o777, 0o755);
    const model = path.join(f.options.destination, 'models', models.es.name);
    assert.equal((await stat(model)).mode & 0o777, 0o755);
    assert.equal((await stat(path.join(model, 'am/final.mdl'))).mode & 0o777, 0o644);
  }
  const manifest = JSON.parse(await readFile(path.join(f.options.destination, 'manifest.json')));
  assert.deepEqual(Object.keys(manifest.models).sort(), ['de', 'en', 'es', 'fr', 'it', 'pt']);
  assert.ok(existsSync(path.join(f.options.destination, 'models', models.pt.name, 'final.mdl')));
  assert.ok(existsSync(path.join(f.options.destination, 'engine/vosk/libvosk.so')));
  assert.ok(!existsSync(path.join(f.options.destination, 'engine/vosk/__init__.py')));
  await prepareVosk(f.options);
  assert.equal(f.calls.length, 7, 'cached archives must not be downloaded again');
});
test('distribution packages include all models while omitting the private engine', async t => {
  const f = await fixture(t);
  await prepareVosk({ ...f.options, systemEngine: true });
  assert.equal(f.calls.length, 6);
  assert.ok(!existsSync(path.join(f.options.destination, 'engine')));
  assert.equal(JSON.parse(await readFile(path.join(f.options.destination, 'manifest.json'))).systemEngine, true);
});
test('a bad checksum fails the build and preserves the previous completed runtime', async t => {
  const f = await fixture(t);
  await mkdir(f.options.destination, { recursive: true });
  await writeFile(path.join(f.options.destination, 'previous'), 'valid');
  f.options.modelCatalog.en.sha256 = '0'.repeat(64);
  await assert.rejects(prepareVosk(f.options), /SHA-256/);
  assert.equal(await readFile(path.join(f.options.destination, 'previous'), 'utf8'), 'valid');
});
test('unsafe archive paths cannot escape the staging directory', async t => {
  const f = await fixture(t);
  const zip = new JSZip(); zip.file('../outside', 'unsafe');
  const archive = path.join(f.root, 'unsafe.zip');
  await writeFile(archive, await zip.generateAsync({ type: 'nodebuffer' }));
  await assert.rejects(extractVosk(archive, f.options.destination), /Ruta insegura/);
  assert.ok(!existsSync(path.join(f.root, 'outside')));
});
test('macOS preserves the upstream dyld library filename', async t => {
  const f = await fixture(t);
  await prepareVosk({ ...f.options, platform: 'darwin', arch: 'arm64' });
  assert.ok(existsSync(path.join(f.options.destination, 'engine/vosk/libvosk.dyld')));
});
test('Windows ARM64 bundles the x64 library and requires its isolated helper', async t => {
  const f = await fixture(t);
  let built = false;
  await prepareVosk({ ...f.options, platform: 'win32', arch: 'arm64', buildHost: async file => {
    built = true; await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, 'helper');
  } });
  assert.ok(built);
  assert.ok(existsSync(path.join(f.options.destination, 'host/libria-vosk-host.exe')));
  assert.ok(existsSync(path.join(f.options.destination, 'engine/vosk/libgcc_s_seh-1.dll')));
  assert.equal(engineRelease('win32', 'arm64').library, 'vosk/libvosk.dll');
});
