// Run on the target platform: packages a PDF-only runtime, never an Electron runtime.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const destination = path.join(root, 'build/tauri-resources');
const runtimeSource = path.join(root, 'runtime/pdf');
const pdf = path.join(destination, 'pdf');
mkdirSync(pdf, { recursive: true });
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}`);
};
if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', 'npm ci --omit=dev --ignore-scripts'], runtimeSource);
else run('npm', ['ci', '--omit=dev', '--ignore-scripts'], runtimeSource);
cpSync(path.join(runtimeSource, 'node_modules'), path.join(pdf, 'node_modules'), { recursive: true, dereference: true });
copyFileSync(path.join(runtimeSource, 'package.json'), path.join(pdf, 'package.json'));
copyFileSync(path.join(root, 'scripts/pdf-export.mjs'), path.join(pdf, 'pdf-export.mjs'));
copyFileSync(process.execPath, path.join(destination, process.platform === 'win32' ? 'node.exe' : 'node'));
if (process.platform !== 'win32') chmodSync(path.join(destination, 'node'), 0o755);
mkdirSync(path.join(destination, 'assets'), { recursive: true });
copyFileSync(path.join(root, 'public/fonts.css'), path.join(destination, 'assets/fonts.css'));
cpSync(path.join(root, 'public/fonts'), path.join(destination, 'assets/fonts'), { recursive: true });
cpSync(path.join(root, 'build/licenses'), path.join(destination, 'licenses'), { recursive: true });
const nodeLicense = await fetch(`https://raw.githubusercontent.com/nodejs/node/v${process.versions.node}/LICENSE`);
if (!nodeLicense.ok) throw new Error('No se pudo obtener la licencia del runtime Node.');
writeFileSync(path.join(destination, 'licenses/Node-LICENSE.txt'), await nodeLicense.text());

const platform = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
const gs = path.join(root, 'build/bin', platform);
if (platform === 'win' && existsSync(gs)) cpSync(gs, path.join(destination, 'gs'), { recursive: true });

// A bundled browser keeps PDF export available offline, independently of system browsers.
// For local development only, --system-browser skips this download and uses Edge/Chrome.
if (!process.argv.includes('--system-browser')) {
  const runtimeRequire = createRequire(path.join(runtimeSource, 'package.json'));
  const cliRequire = createRequire(runtimeRequire.resolve('@vivliostyle/cli/package.json'));
  const browsers = await import(pathToFileURL(cliRequire.resolve('@puppeteer/browsers')).href);
  const cliRoot = path.dirname(runtimeRequire.resolve('@vivliostyle/cli/package.json'));
  const { DEFAULT_BROWSER_VERSIONS } = await import(pathToFileURL(path.join(cliRoot, 'dist/constants.js')).href);
  const browser = browsers.Browser.CHROMEHEADLESSSHELL;
  const browserPlatform = browsers.detectBrowserPlatform();
  if (!browserPlatform) throw new Error('Plataforma PDF no soportada.');
  const version = DEFAULT_BROWSER_VERSIONS.chrome?.[browserPlatform] ?? 'stable';
  const buildId = await browsers.resolveBuildId(browser, browserPlatform, version);
  const installed = await browsers.install({ browser, platform: browserPlatform, buildId, cacheDir: path.join(destination, 'browsers') });
  writeFileSync(path.join(destination, 'browser.json'), JSON.stringify({ executable: path.relative(destination, installed.executablePath) }) + '\n');
}
console.log('Runtime PDF de Tauri preparado.');
