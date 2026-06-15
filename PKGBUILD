# Maintainer: David Kantun <dkantun@gmail.com>

pkgname=libria
pkgver=1.5.2
pkgrel=1
pkgdesc="Aplicación para la creación y maquetación profesional de libros — editor y maquetador de libros con vista previa en tiempo real, exportación a EPUB/DOCX/PDF y corrección ortográfica"
arch=('x86_64')
url="https://github.com/Gargadon/libria"
license=('MIT')
depends=('electron>=32' 'ghostscript')
makedepends=('nodejs>=20' 'npm' 'python')
provides=("${pkgname}")
source=("${url}/archive/v${pkgver}.tar.gz")
sha256sums=('SKIP')


prepare() {
  cd "${srcdir}/libria-${pkgver}"
  npm install
}

build() {
  cd "${srcdir}/libria-${pkgver}"
  npx ng build
}

package() {
  cd "${srcdir}/libria-${pkgver}"

  # Aplicación
  local _dest="${pkgdir}/opt/libria"
  install -dm755 "${_dest}"
  cp -r dist/libria/browser "${_dest}/browser"
  cp main.js preload.js package.json "${_dest}/"
  cp -r build/licenses "${_dest}/licenses"

  # Script de lanzamiento
  install -dm755 "${pkgdir}/usr/bin"
  cat > "${pkgdir}/usr/bin/libria" << 'SCRIPT'
#!/bin/bash
exec /usr/bin/electron /opt/libria/main.js "$@"
SCRIPT
  chmod 755 "${pkgdir}/usr/bin/libria"

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
  install -Dm644 build/licenses/AGPL-3.0.txt "${pkgdir}/usr/share/licenses/libria/AGPL-3.0.txt"
}
