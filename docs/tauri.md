# Libria con Tauri 2

Angular conserva el editor, el estado, el formato `.libria`, la previsualización y las exportaciones EPUB/DOCX/ODT. `src/desktop.ts` instala `window.desktopAPI` antes de arrancar Angular. En el navegador no lo instala y se mantienen las alternativas web.

El backend Rust en `src-tauri` gestiona ventanas, archivos, diálogos, asociación de documentos, instancia única, diccionario personal y Google Drive. Los tokens de Drive se guardan en el almacén de credenciales del sistema mediante `keyring`; no llegan al frontend. La interfaz usa el menú integrado de Libria y sus atajos, también en Windows y macOS. La consulta de actualizaciones abre la página de descargas; no instala actualizaciones automáticamente.

## Desarrollo

Las tipografías instaladas se consultan desde Rust mediante `fontdb`, sin solicitar el permiso de fuentes locales del WebView. El catálogo se carga una vez por proceso y los datos de cada variante se leen cuando hacen falta para incrustarlos en las exportaciones. Las colecciones TTC/OTC se separan por variante. La versión web conserva `queryLocalFonts()` y los permisos del navegador.

Se necesitan Node.js 22.12 o superior, Bun, Rust estable y los [prerrequisitos de Tauri](https://v2.tauri.app/start/prerequisites/) del sistema. En Windows: herramientas C++ de Visual Studio y WebView2. En Linux: WebKitGTK 4.1 y las bibliotecas de compilación; para Drive también un servicio Secret Service desbloqueado.

```sh
bun install --frozen-lockfile
bun run tauri:dev
```

Para probar PDF durante el desarrollo, basta con Edge/Chrome/Chromium instalado. `LIBRIA_PDF_BROWSER` permite indicar su ejecutable. El proceso exportador usa Node del PATH en desarrollo. Para PDF/X hace falta Ghostscript; se detecta en el sistema y puede indicarse con `LIBRIA_GHOSTSCRIPT`.

```sh
bun run test -- --watch=false
bun run test:desktop
bun run test:native
bun run tauri:build
```

`tauri:build` compila Angular y prepara los recursos antes de compilar Rust. `tauri:prepare` instala las dependencias de `runtime/pdf` mediante `npm ci` y su `package-lock.json`, incluye un ejecutable Node, las fuentes, las licencias y Chrome Headless Shell para permitir PDF sin conexión. Los recursos generados están excluidos de Git. Se debe preparar y compilar en la plataforma de destino. Los instaladores quedan en `src-tauri/target/release/bundle`.

Angular inserta estilos de componentes en ejecución. La configuración conserva `style-src 'unsafe-inline'` y evita que Tauri añada un nonce a esa directiva; las restricciones de scripts siguen activas. El build de Angular desactiva `inlineCritical` para no generar un `onload` inline bloqueado por la política de scripts.

El documento local `/vivliostyle/index.html` permite además `unsafe-eval`, necesario para las expresiones `data-bind` de su interfaz Knockout. El callback de recursos limita esa excepción a ese HTML; Angular y los documentos de libros mantienen su política de scripts.

El workflow genera Windows x64, Linux x64 y macOS x64/arm64. Windows y Linux arm64 necesitan todavía un runtime PDF y un runner compatibles; no se generan instaladores para esas arquitecturas en esta primera migración.

## PDF y consumo

Vivliostyle se ejecuta en un proceso independiente solo durante la exportación. El backend crea un directorio temporal, incrusta las fuentes, inicia el worker con argumentos controlados y espera como máximo tres minutos. El proceso directo se termina si se cancela la tarea; el directorio temporal se elimina al terminar. Ghostscript solo se ejecuta si se solicita PDF/X. Un fallo de conversión se informa como error; nunca se devuelve silenciosamente el PDF sin convertir.

La ventana habitual usa WebView2 en Windows y WebKit en macOS/Linux. El motor adicional para PDF no permanece abierto al escribir, pero sí ocupa espacio en el paquete. Esta migración no garantiza un instalador menor ni una reducción concreta de memoria: hay que medir la suma de todos los procesos y comparar libros iguales, con y sin previsualización.

En Windows, `bun run download:gs:win` instala una copia completa de Ghostscript en `build/bin/win`, que se incluye al preparar los recursos. En macOS/Linux se usa Ghostscript del sistema; copiar únicamente un ejecutable ligado a bibliotecas de Homebrew o de una distribución no produce un runtime portable. En Debian el paquete declara la dependencia. Para AppImage/macOS hay que instalarlo si se necesita PDF/X.

## Compatibilidad con la versión Electron

- Los `.libria` y `.libria-theme` existentes siguen siendo compatibles y se pueden abrir desde disco.
- Tauri tiene su propio almacenamiento de aplicación. Preferencias, temas guardados en LocalStorage, recientes y recuperaciones automáticas de Electron no se importan todavía. Guarda los documentos y exporta los temas personalizados desde Electron antes del cambio. Los datos antiguos no se borran.
- Drive requiere una nueva autorización. Los tokens cifrados por Electron no se importan al llavero. Las copias antiguas de `drive-cache` pueden abrirse como documentos locales.
- El subrayado y las sugerencias ortográficas dependen del WebView y del sistema. El diccionario personal de Libria se conserva en un JSON nativo, pero sus adiciones no se inyectan todavía en el corrector del WebView. La selección de idiomas también depende de los diccionarios del sistema.
- La previsualización de Vivliostyle y el editor necesitan pruebas visuales en WebKit real de macOS/Linux. La exportación PDF usa el navegador empaquetado para mantener un motor consistente entre plataformas.

La conexión OAuth real, la fidelidad de libros extensos y los instaladores deben probarse en los tres sistemas antes de publicar una versión estable.

## Verificación local de esta migración

En Windows x64 se comprobó el arranque de la ventana WebView2, la presentación con estilos y fuentes, la lectura y escritura nativa de un documento UTF-8, el rechazo de extensiones ajenas a documentos, la edición de texto, la previsualización paginada de Vivliostyle y la generación de PDF mediante IPC. El cierre detectó cambios sin guardar, permitió cancelarlo y cerró al descartarlos. La prueba del editor terminó sin errores JavaScript ni de CSP. También se generó un PDF usando el navegador empaquetado en lugar de Edge.

Las pruebas de Angular, Rust y del worker PDF/credenciales se ejecutan por separado. La autenticación real de Google no se ejercita automáticamente y requiere autorizar la cuenta en el navegador.
