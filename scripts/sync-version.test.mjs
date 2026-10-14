import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncVersion } from './sync-version.mjs';

function fixture(t, version = '2.1.0-beta.2+build.3') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'libria-version-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('libria-version-'));
    rmSync(root, { recursive: true, force: true });
  });
  const write = (file, value) => {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
  };
  const read = file => readFileSync(path.join(root, file), 'utf8');
  write('package.json', { name: 'libria', version });
  write('src-tauri/Cargo.toml', '[package]\r\nname = "libria"\r\nversion = "2.0.0"\r\n\r\n[dependencies]\r\nother = "2.0.0"\r\n');
  write('src-tauri/Cargo.lock', '[[package]]\nname = "other"\nversion = "2.0.0"\n\n[[package]]\nname = "libria"\nversion = "2.0.0"\n');
  write('runtime/pdf/package.json', { name: 'libria-pdf-runtime', version: '2.0.0', private: true, dependencies: { other: '2.0.0' } });
  write('runtime/pdf/package-lock.json', { version: '2.0.0', lockfileVersion: 3, packages: {
    '': { version: '2.0.0' }, 'node_modules/other': { version: '2.0.0' },
  } });
  return { root, write, read };
}

test('propagates the root version, preserves dependency versions and line endings, and is idempotent', t => {
  const f = fixture(t);
  const result = syncVersion(f.root);
  assert.equal(result.updated.length, 4);
  assert.match(f.read('src-tauri/Cargo.toml'), /version = "2\.1\.0-beta\.2\+build\.3"\r\n/);
  assert.match(f.read('src-tauri/Cargo.toml'), /other = "2\.0\.0"/);
  assert.match(f.read('src-tauri/Cargo.lock'), /name = "other"\nversion = "2\.0\.0"/);
  assert.match(f.read('src-tauri/Cargo.lock'), /name = "libria"\nversion = "2\.1\.0-beta\.2\+build\.3"/);
  assert.equal(JSON.parse(f.read('runtime/pdf/package.json')).version, result.version);
  const lock = JSON.parse(f.read('runtime/pdf/package-lock.json'));
  assert.equal(lock.version, result.version);
  assert.equal(lock.packages[''].version, result.version);
  assert.equal(lock.packages['node_modules/other'].version, '2.0.0');
  assert.deepEqual(syncVersion(f.root).updated, []);
});

test('rejects invalid versions without changing any mirror', t => {
  const f = fixture(t, '2.0.0-beta.01');
  const before = f.read('src-tauri/Cargo.toml');
  assert.throws(() => syncVersion(f.root), /SemVer/);
  assert.equal(f.read('src-tauri/Cargo.toml'), before);
});

test('validates all manifests before writing so an invalid lockfile cannot leave partial updates', t => {
  const f = fixture(t, '3.0.0');
  const before = f.read('src-tauri/Cargo.toml');
  f.write('runtime/pdf/package-lock.json', { version: '2.0.0' });
  assert.throws(() => syncVersion(f.root), /paquete raíz/);
  assert.equal(f.read('src-tauri/Cargo.toml'), before);
});
