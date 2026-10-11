import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runtimeModuleFilter } from './runtime-prebuilds.mjs';

for (const [platform, arch] of [['linux', 'x64'], ['win32', 'x64'], ['darwin', 'x64'], ['darwin', 'arm64']]) {
  test(`PDF runtime only includes native prebuilds for ${platform}-${arch}`, () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'libria-prebuilds-'));
    try {
      const source = path.join(dir, 'source');
      const destination = path.join(dir, 'destination');
      const targets = ['android-ia32', 'android-arm64', 'linux-x64', 'linux-arm64',
        'linux-x64-glibc', 'linux-x64-musl', 'win32-x64', 'darwin-x64', 'darwin-arm64'];
      for (const target of targets) {
        const folder = path.join(source, 'nested', 'bare-fs', 'prebuilds', target);
        mkdirSync(folder, { recursive: true });
        writeFileSync(path.join(folder, 'binding.bare'), 'native binary');
      }
      writeFileSync(path.join(source, 'nested', 'bare-fs', 'index.js'), 'module code');
      cpSync(source, destination, { recursive: true, filter: runtimeModuleFilter(platform, arch) });
      assert.ok(existsSync(path.join(destination, 'nested', 'bare-fs', 'index.js')));
      for (const target of targets) {
        const expected = target === `${platform}-${arch}` || target.startsWith(`${platform}-${arch}-`);
        assert.equal(existsSync(path.join(destination, 'nested', 'bare-fs', 'prebuilds', target, 'binding.bare')), expected, target);
      }
      // The installed dependencies must remain untouched.
      assert.ok(existsSync(path.join(source, 'nested', 'bare-fs', 'prebuilds', 'android-ia32', 'binding.bare')));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
