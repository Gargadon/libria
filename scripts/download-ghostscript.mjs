#!/usr/bin/env node

import { mkdirSync, chmodSync, existsSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { downloadFile as fetch } from './download-file.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BIN = join(ROOT, 'build', 'bin');

const GS_VER = '10.07.0';
const GS_TAG = `gs${GS_VER.replace(/\./g, '')}`;
const BASE = 'https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download';
const GHCR = 'https://ghcr.io/v2/homebrew/core/ghostscript/blobs';

function brewGsBinary() {
  // Try `brew --prefix ghostscript`
  const r = spawnSync('brew', ['--prefix', 'ghostscript']);
  if (r.status === 0) {
    const prefix = r.stdout.toString().trim();
    const binary = join(prefix, 'bin', 'gs');
    if (existsSync(binary)) return binary;
  }
  // Fallback: common cellar paths
  for (const v of ['10.07.1', '10.07.0', '10.06.0', GS_VER]) {
    for (const arch of ['arm64_sequoia', 'arm64_sonoma', 'arm64_ventura', 'sequoia', 'sonoma', 'ventura']) {
      const p = join('/opt/homebrew/Cellar/ghostscript', v, 'bin', 'gs');
      if (existsSync(p)) return p;
      const p2 = join('/usr/local/Cellar/ghostscript', v, 'bin', 'gs');
      if (existsSync(p2)) return p2;
    }
  }
  // Check these too
  for (const p of ['/opt/homebrew/bin/gs', '/usr/local/bin/gs']) {
    if (existsSync(p)) return p;
  }
  return null;
}

async function main() {
  const platArg = process.argv[2] || process.platform;
  const norm = { win: 'win32', win32: 'win32', mac: 'darwin', darwin: 'darwin', linux: 'linux' };
  const plat = norm[platArg] || platArg;
  const map = { win32: 'win', darwin: 'mac', linux: 'linux' };
  const dir = join(BIN, map[plat] || plat);
  mkdirSync(dir, { recursive: true });

  if (plat === 'win32') {
    const name = `${GS_TAG}w64.exe`;
    const url = `${BASE}/${GS_TAG}/${name}`;
    const installer = join(dir, 'ghostscript-installer.exe');
    // Extract NSIS data without executing an installer or changing the registry.
    const sevenZip = ['7z', join(process.env.ProgramFiles || 'C:/Program Files', '7-Zip', '7z.exe')]
      .find(command => spawnSync(command, ['i'], { windowsHide: true, timeout: 10_000 }).status === 0);
    if (!sevenZip) throw new Error('Se necesita 7-Zip para desempaquetar Ghostscript.');
    await fetch(url, installer);
    const installed = join(dir, 'bin', 'gswin64c.exe');
    console.log('  Extrayendo Ghostscript con 7-Zip…');
    const result = spawnSync(sevenZip, ['x', installer, `-o${dir}`, '-y', 'bin/*', 'lib/*', 'Resource/*', 'doc/*', 'LICENSE*'], {
      stdio: 'inherit', windowsHide: true, timeout: 120_000,
    });
    if (result.error || result.status !== 0 || !existsSync(installed) || !existsSync(join(dir, 'bin', 'gsdll64.dll'))) {
      throw new Error(`No se pudo extraer Ghostscript: ${result.error?.message || result.status}`);
    }
    console.log('  Comprobando el intérprete Ghostscript…');
    const check = spawnSync(installed, ['-dNODISPLAY', '-dBATCH', '-dNOPAUSE', '-c', '(Ghostscript listo) =', '-c', 'quit'], {
      stdio: 'inherit', windowsHide: true, timeout: 30_000,
    });
    if (check.error || check.status !== 0) throw new Error('El Ghostscript extraído no funciona.');
    unlinkSync(installer);
    console.log(`  ✓ ${installed}`);

  } else if (plat === 'linux') {
    // Prefer system-installed GS (works on all architectures)
    const which = spawnSync('which', ['gs']);
    if (which.status === 0) {
      const src = which.stdout.toString().trim();
      copyFileSync(src, join(dir, 'gs'));
      chmodSync(join(dir, 'gs'), 0o755);
      console.log(`  ✓ Copied from system: ${src} → ${join(dir, 'gs')}`);
      process.exit(0);
    }
    console.error(`
  No Ghostscript binary found on the system.
  Install it via your package manager, e.g.:
    sudo apt install ghostscript   # Debian/Ubuntu
    sudo pacman -S ghostscript      # Arch Linux
    brew install ghostscript        # macOS
  Then run again.
`);
    process.exit(1);

  } else if (plat === 'darwin') {
    console.log('\n[macOS]');

    // 1. Try Homebrew
    const brewBin = brewGsBinary();
    if (brewBin) {
      const out = join(dir, 'gs');
      copyFileSync(brewBin, out);
      chmodSync(out, 0o755);
      console.log(`  ✓ Copied from Homebrew: ${brewBin} → ${out}`);
      process.exit(0);
    }

    // 2. Try downloading Homebrew bottle
    console.log('  Homebrew not found. Trying direct bottle download...');
    const ver = '10.07.1';
    const sha265 = '0b9439cfee392a9c32e20817cd38e98f7c8a4ea5452a87ad99cd668a77ec2e72'; // arm64_sequoia
    const sha264 = 'f31cee04ad0ccc5bf7b874d7ca5e6260a445f95fde9afcc345c72bcf5c1e378a'; // sequoia
    try {
      const url = `${GHCR}/sha256:${sha265}`;
      const tgz = join(dir, 'gs-bottle.tar.gz');
      console.log(`  Downloading bottle (arm64)...`);
      await fetch(url, tgz);
      const r = spawnSync('tar', ['-xzf', tgz, '--strip-components=2', '-C', dir, '*/bin/gs']);
      if (r.status !== 0) {
        // try Intel variant
        console.log('  arm64 failed, trying Intel...');
        const url2 = `${GHCR}/sha256:${sha264}`;
        await fetch(url2, tgz);
        spawnSync('tar', ['-xzf', tgz, '--strip-components=2', '-C', dir, '*/bin/gs']);
      }
      unlinkSync(tgz);
      if (existsSync(join(dir, 'gs'))) {
        chmodSync(join(dir, 'gs'), 0o755);
        console.log(`  ✓ ${join(dir, 'gs')}`);
        process.exit(0);
      }
    } catch (e) {
      console.log(`  Bottle download failed: ${e.message}`);
    }

    console.error(`
  No Ghostscript binary found for macOS.

  Install via Homebrew:  brew install ghostscript
  Then run again:        bun run download:gs
`);
    process.exit(1);

  } else {
    console.error(`Unsupported: ${plat}`);
    process.exit(1);
  }

  console.log('\nDone.');
}

main().catch((e) => { console.error(e); process.exit(1); });
