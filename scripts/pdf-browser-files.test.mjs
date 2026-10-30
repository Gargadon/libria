import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pdfBrowserFilter } from './pdf-browser-files.mjs';

test('packages supported browser UI locales and preserves document rendering resources', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'libria-browser-'));
  try {
    const source = path.join(directory, 'source');
    const destination = path.join(directory, 'packaged');
    const preserved = ['chrome-headless-shell', 'chrome-headless-shell.exe', 'icudtl.dat',
      'libGLESv2.so', 'libEGL.dll', 'vk_swiftshader.dll', 'v8_context_snapshot.bin',
      'headless_lib_data.pak', 'headless_lib_strings.pak', 'LICENSE.headless_shell',
      'hyphen-data/hyph-ru.hyb', 'locales/en-US.pak', 'locales/en-GB.pak', 'locales/es.pak',
      'locales/es-419.pak', 'locales/de.pak', 'locales/fr.pak', 'locales/it.pak',
      'locales/pt-BR.pak', 'locales/pt-PT.pak'];
    const omitted = ['locales/ru.pak', 'locales/ja.pak', 'locales/zh-CN.pak'];
    for (const file of [...preserved, ...omitted]) {
      const target = path.join(source, 'chrome-headless-shell-platform', file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, 'resource');
    }
    cpSync(source, destination, { recursive: true, filter: pdfBrowserFilter(source) });
    for (const file of preserved) assert.ok(existsSync(path.join(destination, 'chrome-headless-shell-platform', file)), file);
    for (const file of omitted) {
      assert.ok(!existsSync(path.join(destination, 'chrome-headless-shell-platform', file)), file);
      assert.ok(existsSync(path.join(source, 'chrome-headless-shell-platform', file)), 'download cache is untouched');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
