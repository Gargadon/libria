import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { installerTargets, stageInstallers } from './stage-installers.mjs';

const expected = {
  'windows-x64': ['libria-2.0.0-win-x64.exe'],
  'windows-arm64': ['libria-2.0.0-win-arm64.exe'],
  'linux-x64': ['libria-2.0.0-linux-amd64.deb', 'libria-2.0.0-linux-x86_64.AppImage'],
  'linux-arm64': ['libria-2.0.0-linux-arm64.deb', 'libria-2.0.0-linux-arm64.AppImage'],
  'macos-x64': ['libria-2.0.0-mac-x64.dmg'],
  'macos-arm64': ['libria-2.0.0-mac-arm64.dmg'],
};

for (const [platform, names] of Object.entries(expected)) {
  test(`stages all installers for ${platform} with the previous release naming`, () => {
    const root = mkdtempSync(path.join(tmpdir(), 'libria-installers-'));
    try {
      for (const target of installerTargets(platform)) {
        const folder = path.join(root, 'src-tauri/target/release/bundle', target.folder);
        mkdirSync(folder, { recursive: true });
        writeFileSync(path.join(folder, `Libria_2.0.0${target.extension}`), platform);
      }
      assert.deepEqual(stageInstallers(root, platform, '2.0.0'), names);
      for (const name of names) assert.equal(readFileSync(path.join(root, 'dist/installers', name), 'utf8'), platform);
      const target = installerTargets(platform)[0];
      writeFileSync(path.join(root, 'src-tauri/target/release/bundle', target.folder, `duplicate${target.extension}`), 'unexpected');
      assert.throws(() => stageInstallers(root, platform, '2.0.0'), /encontrados: 2/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

test('rejects unknown platforms instead of publishing an incorrectly named installer', () => {
  assert.throws(() => installerTargets('linux-ia32'), /Plataforma inválida/);
});
