import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const numeric = '(?:0|[1-9][0-9]*)';
const identifier = `(?:${numeric}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const semver = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);

/** package.json is authoritative; the other manifests are generated mirrors. */
export function syncVersion(root = projectRoot) {
  const read = relative => readFileSync(path.join(root, relative), 'utf8');
  const version = JSON.parse(read('package.json')).version;
  if (typeof version !== 'string' || !semver.test(version)) throw new Error('package.json: version debe ser una versión SemVer válida.');
  const edits = [];
  const plan = (relative, update) => {
    const before = read(relative), after = update(before);
    if (before !== after) edits.push({ relative, after });
  };
  const replaceRequired = (text, pattern, label) => {
    if (!pattern.test(text)) throw new Error(`No se encontró la versión de Libria en ${label}.`);
    return text.replace(pattern, (_match, prefix, suffix) => `${prefix}${version}${suffix}`);
  };
  plan('src-tauri/Cargo.toml', text => replaceRequired(text,
    /(\[package\][^\[]*?\bversion\s*=\s*")[^"]*(")/, 'Cargo.toml'));
  plan('src-tauri/Cargo.lock', text => replaceRequired(text,
    /(\[\[package\]\]\r?\nname = "libria"\r?\nversion = ")[^"]*(")/, 'Cargo.lock'));
  for (const relative of ['runtime/pdf/package.json', 'runtime/pdf/package-lock.json']) {
    plan(relative, text => {
      const data = JSON.parse(text);
      const locked = relative.endsWith('package-lock.json');
      if (locked && !data.packages?.['']) throw new Error(`${relative}: falta el paquete raíz.`);
      if (data.version === version && (!locked || data.packages[''].version === version)) return text;
      data.version = version;
      if (locked) data.packages[''].version = version;
      const result = JSON.stringify(data, null, 2) + '\n';
      return text.includes('\r\n') ? result.replaceAll('\n', '\r\n') : result;
    });
  }
  // Validate every input before modifying any manifest. Dependencies stay untouched.
  for (const { relative, after } of edits) writeFileSync(path.join(root, relative), after);
  return { version, updated: edits.map(edit => edit.relative) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { version, updated } = syncVersion();
    if (updated.length) console.log(`Versión ${version} sincronizada en ${updated.length} archivos.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
