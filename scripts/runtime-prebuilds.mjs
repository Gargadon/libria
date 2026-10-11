import path from 'node:path';

// Native packages ship prebuilds for several operating systems in one tarball.
// linuxdeploy scans every ELF file, including Android and foreign architectures.
export function runtimeModuleFilter(platform = process.platform, arch = process.arch) {
  return source => {
    const name = path.basename(source);
    // Debugger maps and compile-time declarations are not executed by Node or
    // served by the PDF viewer. Keep JS, package metadata, assets and licenses.
    if (name.endsWith('.map') || /\.d\.(?:ts|mts|cts)$/.test(name)) return false;
    if (/^(?:changelog|changes|history|contributing)(?:\.(?:md|txt|rst))?$/i.test(name)) return false;
    if (path.basename(path.dirname(source)) !== 'prebuilds') return true;
    const target = `${platform}-${arch}`;
    return name === target || name.startsWith(`${target}-`);
  };
}
