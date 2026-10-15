import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildMacosDmg } from './build-macos-dmg.mjs';
import { stageInstallers } from './stage-installers.mjs';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'libria-dmg-test-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(tmpdir()));
    assert.ok(path.basename(root).startsWith('libria-dmg-test-'));
    rmSync(root, { recursive: true, force: true });
  });
  const bundle = path.join(root, 'src-tauri/target/release/bundle');
  const app = path.join(bundle, 'macos/Libria.app');
  mkdirSync(path.join(app, 'Contents/Resources'), { recursive: true });
  writeFileSync(path.join(app, 'Contents/Resources/runtime.txt'), 'bundled PDF runtime');
  return { root, bundle, app };
}

for (const arch of ['x64', 'arm64']) {
  test(`creates, verifies, and stages a ${arch} DMG without attach/detach`, t => {
    const { root, bundle } = fixture(t);
    const calls = [];
    const output = buildMacosDmg(root, { arch, version: '2.1.0', run(command, args) {
      calls.push({ command, args });
      if (command.endsWith('/ditto')) cpSync(args[0], args[1], { recursive: true });
      if (args[0] === 'create') {
        const content = args[args.indexOf('-srcfolder') + 1];
        assert.equal(readFileSync(path.join(content, 'Libria.app/Contents/Resources/runtime.txt'), 'utf8'), 'bundled PDF runtime');
        writeFileSync(args.at(-1), 'verified disk image');
      }
    } });
    assert.deepEqual(calls.map(call => [call.command, call.args[0]]), [
      ['/usr/bin/ditto', path.join(bundle, 'macos/Libria.app')],
      ['/bin/ln', '-s'], ['/usr/bin/hdiutil', 'create'], ['/usr/bin/hdiutil', 'verify'],
    ]);
    assert.equal(calls[1].args[1], '/Applications');
    assert.equal(readFileSync(output, 'utf8'), 'verified disk image');
    assert.deepEqual(stageInstallers(root, `macos-${arch}`, '2.1.0'), [`libria-2.1.0-mac-${arch}.dmg`]);
    assert.ok(!readdirSync(bundle).some(name => name.startsWith('.libria-dmg-')));
    assert.ok(existsSync(path.join(bundle, 'macos/Libria.app/Contents/Resources/runtime.txt')));
  });
}

test('a failed image verification preserves the previous installer and cleans temporary files', t => {
  const { root, bundle } = fixture(t);
  const output = path.join(bundle, 'dmg/Libria_2.1.0_x64.dmg');
  mkdirSync(path.dirname(output));
  writeFileSync(output, 'previous installer');
  assert.throws(() => buildMacosDmg(root, { arch: 'x64', version: '2.1.0', run(command, args) {
    if (args[0] === 'create') writeFileSync(args.at(-1), 'unfinished image');
    if (args[0] === 'verify') throw new Error('checksum failed');
  } }), /checksum failed/);
  assert.equal(readFileSync(output, 'utf8'), 'previous installer');
  assert.ok(!readdirSync(bundle).some(name => name.startsWith('.libria-dmg-')));
});

test('rejects a missing application before running any packaging commands', t => {
  const { root } = fixture(t);
  assert.throws(() => buildMacosDmg(path.join(root, 'missing'), { arch: 'x64', version: '2.1.0' }), /No se encontró/);
  assert.throws(() => buildMacosDmg(root, { arch: 'ia32', version: '2.1.0' }), /Arquitectura/);
});

test('builds and verifies a real disk image on macOS', { skip: process.platform !== 'darwin' }, t => {
  const { root } = fixture(t);
  const output = buildMacosDmg(root, { arch: process.arch, version: '2.1.0' });
  assert.ok(existsSync(output));
});
