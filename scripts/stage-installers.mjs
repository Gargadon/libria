import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

export function installerTargets(platform) {
  const match = /^(windows|linux|macos)-(x64|arm64)$/.exec(platform);
  if (!match) throw new Error(`Plataforma inválida: ${platform}`);
  const [, os, arch] = match;
  if (os === 'windows') return [{ folder: 'nsis', extension: '.exe', suffix: `win-${arch}` }];
  if (os === 'macos') return [{ folder: 'dmg', extension: '.dmg', suffix: `mac-${arch}` }];
  return [
    { folder: 'deb', extension: '.deb', suffix: `linux-${arch === 'x64' ? 'amd64' : arch}` },
    { folder: 'appimage', extension: '.AppImage', suffix: `linux-${arch === 'x64' ? 'x86_64' : arch}` },
  ];
}

export function stageInstallers(root, platform, version) {
  const destination = path.join(root, 'dist/installers');
  mkdirSync(destination, { recursive: true });
  const staged = [];
  for (const target of installerTargets(platform)) {
    const folder = path.join(root, 'src-tauri/target/release/bundle', target.folder);
    const files = readdirSync(folder, { withFileTypes: true })
      .filter(file => file.isFile() && file.name.endsWith(target.extension));
    if (files.length !== 1) throw new Error(`Se esperaba un instalador ${target.extension} para ${platform}; encontrados: ${files.length}`);
    const name = `libria-${version}-${target.suffix}${target.extension}`;
    copyFileSync(path.join(folder, files[0].name), path.join(destination, name));
    staged.push(name);
  }
  return staged;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { version } = createRequire(import.meta.url)('../package.json');
  console.log(stageInstallers(root, process.argv[2], version).join('\n'));
}
