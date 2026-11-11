# Maintainer: David Kantun <dkantun@gmail.com>

pkgname=libria
pkgver=2.3.0
pkgrel=2
pkgdesc="Creación y maquetación de libros con dictado local sin conexión"
arch=('x86_64')
url="https://github.com/Gargadon/libria"
license=('AGPL-3.0-only')
depends=('webkit2gtk-4.1' 'libappindicator-gtk3' 'alsa-lib' 'dbus' 'ghostscript' 'chromium' 'vosk-api')
makedepends=('bun' 'nodejs' 'npm' 'rust' 'pkgconf')
provides=("${pkgname}")
source=("${url}/archive/v${pkgver}.tar.gz")
sha256sums=('SKIP')

prepare() {
  cd "${srcdir}/libria-${pkgver}"
  bun install --frozen-lockfile
}

build() {
  cd "${srcdir}/libria-${pkgver}"
  bun run build
  # Download the six models at build time; Vosk and Chromium come from Arch.
  LIBRIA_VOSK_SYSTEM_ENGINE=1 node scripts/prepare-tauri.mjs --system-browser
  cargo build --locked --release --features custom-protocol --manifest-path src-tauri/Cargo.toml
  src-tauri/target/release/libria --verify-dictation-resources build/tauri-resources/vosk
}

package() {
  cd "${srcdir}/libria-${pkgver}"

  install -Dm755 src-tauri/target/release/libria "${pkgdir}/usr/bin/libria"
  install -dm755 "${pkgdir}/usr/lib/Libria/runtime"
  cp -a build/tauri-resources/. "${pkgdir}/usr/lib/Libria/runtime/"
  chmod -R u=rwX,go=rX "${pkgdir}/usr/lib/Libria/runtime"

  # Desktop entry
  install -dm755 "${pkgdir}/usr/share/applications"
  cat > "${pkgdir}/usr/share/applications/libria.desktop" << 'DESKTOP'
[Desktop Entry]
Name=Libria
Comment=Editor y maquetador profesional de libros
Exec=/usr/bin/libria %F
Icon=libria
Terminal=false
Type=Application
MimeType=application/x-libria;
Categories=Office;WordProcessor;
StartupWMClass=Libria
DESKTOP

  # Icono
  install -Dm644 build/icon.png "${pkgdir}/usr/share/icons/hicolor/256x256/apps/libria.png"

  # Asociación de archivos .libria
  install -dm755 "${pkgdir}/usr/share/mime/packages"
  cat > "${pkgdir}/usr/share/mime/packages/libria.xml" << 'MIME'
<?xml version="1.0" encoding="UTF-8"?>
<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">
  <mime-type type="application/x-libria">
    <comment>Documento Libria</comment>
    <glob pattern="*.libria"/>
    <icon name="libria"/>
  </mime-type>
</mime-info>
MIME

  # Licencias
  install -Dm644 LICENSE "${pkgdir}/usr/share/licenses/libria/LICENSE"
  cp -a build/licenses/. "${pkgdir}/usr/share/licenses/libria/"
}
