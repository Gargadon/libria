import path from 'node:path';

// Native packages ship prebuilds for several operating systems in one tarball.
// linuxdeploy scans every ELF file, including Android and foreign architectures.
export function runtimeModuleFilter(platform = process.platform, arch = process.arch) {
  return source => {
    if (path.basename(path.dirname(source)) !== 'prebuilds') return true;
    const target = `${platform}-${arch}`;
    const name = path.basename(source);
    return name === target || name.startsWith(`${target}-`);
  };
}
