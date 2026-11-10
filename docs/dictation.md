# Dictado local con Vosk

En escritorio, Libria captura el micrófono predeterminado con CPAL y transcribe con Vosk en un hilo separado. No usa SpeechRecognition del WebView ni envía audio a un servidor. **El dictado funciona sin Internet desde el primer inicio:** el empaquetado prepara el motor y los seis modelos. El código de dictado de la aplicación no descarga archivos.

Coloca el cursor en el texto y pulsa el punto rojo de la barra. El cuadrado detiene la captura y procesa la última frase. Cambiar de capítulo o idioma, empezar a editar, ocultar o cerrar la aplicación cancela la sesión y descarta lo pendiente. Se liberan el micrófono y la memoria del modelo al terminar.

## Modelos incluidos

Se usa el idioma del documento, independientemente de la interfaz. Los seis modelos están instalados, pero solo se carga uno en memoria. Las variantes regionales usan el mismo modelo pequeño; el inglés utiliza el modelo estadounidense y el portugués el brasileño.

| Idioma | Modelo | Archivo comprimido aproximado |
| --- | --- | --- |
| Inglés | `vosk-model-small-en-us-0.15` | 41 MB |
| Francés | `vosk-model-small-fr-0.22` | 42 MB |
| Italiano | `vosk-model-small-it-0.22` | 50 MB |
| Alemán | `vosk-model-small-de-0.15` | 46 MB |
| Portugués | `vosk-model-small-pt-0.3` | 32 MB |
| Español | `vosk-model-small-es-0.42` | 40 MB |

Los seis modelos son Apache-2.0 según el [catálogo oficial](https://alphacephei.com/vosk/models). Los nombres, tamaños exactos y SHA-256 están en `src-tauri/src/speech/models.json`. Se admite la estructura antigua del modelo de portugués.

Los modelos pequeños están destinados a CPU y equipos limitados, pero la memoria utilizada supera el tamaño comprimido: Vosk estima alrededor de 300 MB para un modelo pequeño. La precisión depende del idioma, acento y micrófono. No se añade puntuación automática ni se interpretan comandos de voz.

## Descargas durante el empaquetado

El workflow `.github/workflows/release.yml` ejecuta `bun run vosk:prepare` antes de crear los instaladores de un tag. Este paso:

1. Descarga los seis modelos y el motor correspondiente a la plataforma.
2. Verifica los SHA-256 antes de extraer archivos y falla si un recurso está incompleto.
3. Reutiliza los archivos verificados en `tmp/vosk-downloads`, conservados con `actions/cache` entre builds.
4. Prepara `build/tauri-resources/vosk`, incluido como `runtime/vosk` por Tauri. Los modelos, licencias, avisos y bibliotecas necesarias forman parte del instalador.

`bun run tauri:prepare` también prepara Vosk, de modo que un empaquetado local tiene el mismo resultado. `bun run vosk:verify` ejecuta el binario construido con `--verify-dictation-resources`: carga los seis modelos desde esos recursos sin abrir ventanas ni capturar el micrófono. El workflow exige que pase antes de publicar los artefactos.

El motor de respaldo usa distribuciones oficiales de Vosk en PyPI: 0.3.45 en Linux/Windows y 0.3.42 universal en macOS. Los wheels son contenedores ZIP de bibliotecas nativas; no se instala ni ejecuta Python. Las URL y huellas están en `src-tauri/src/speech/releases.json`.

Windows ARM64 utiliza la biblioteca oficial x64 en un auxiliar x64 (`libria-vosk-host.exe`), mediante la compatibilidad de Windows. No intenta cargar una DLL x64 en el proceso ARM64. El workflow añade el target Rust x64 y compila el auxiliar desde `src-tauri/vosk-host`; ambos procesos funcionan sin red. macOS declara el uso del micrófono y permite cargar la biblioteca externa verificada bajo Hardened Runtime.

## Arch y Fedora/Red Hat: preferir el motor de la distribución

En Linux, la prioridad es siempre:

1. Una biblioteca compatible del sistema en `/usr/lib`, `/usr/lib64`, el directorio multiarch o `/usr/local/lib`.
2. La biblioteca de respaldo del instalador, si existe.

Se comprueban los símbolos de la API C antes de seleccionar la biblioteca del sistema. Los modelos se leen directamente de los recursos del paquete; no se copian al perfil del usuario.

El `PKGBUILD` de Arch declara `vosk-api` como dependencia y prepara los recursos con `LIBRIA_VOSK_SYSTEM_ENGINE=1`, por lo que incluye los seis modelos y omite la biblioteca privada. Los bindings Python no son necesarios. Chromium y Ghostscript también se obtienen de Arch para la exportación PDF.

Para RPM se proporciona `src-tauri/tauri.system-vosk.conf.json`, que declara las dependencias `vosk-api-devel`, `alsa-lib` y `ghostscript`. El paquete `vosk-api-devel` de Fedora incluye la biblioteca compartida. Un empaquetador de Fedora/Red Hat que proporcione esas dependencias puede generar el paquete sin biblioteca privada:

```sh
LIBRIA_VOSK_SYSTEM_ENGINE=1 bun run tauri:build -- --bundles rpm --config src-tauri/tauri.system-vosk.conf.json
```

Los instaladores generales DEB/AppImage conservan el motor de respaldo para no depender de la disponibilidad de un paquete Vosk en cada distribución. Aun así, si hay una biblioteca compatible del sistema, se prefiere esa biblioteca.

## Desarrollo

`bun run tauri:dev` prepara los recursos antes de arrancar el servidor de desarrollo. Las descargas ocurren en esa preparación de desarrollo, nunca al activar el botón de dictado. Después de preparar los recursos, el dictado no requiere conexión. También se puede ejecutar `bun run vosk:prepare` por separado.

Para compilar CPAL en Linux se necesitan las cabeceras ALSA: `libasound2-dev` en Ubuntu, `alsa-lib-devel` en Fedora o `alsa-lib` en Arch. Para preparar el auxiliar desde Windows ARM64 se necesita `rustup target add x86_64-pc-windows-msvc` y las herramientas de enlace MSVC x64.

Las pruebas normales no graban audio ni descargan modelos:

```sh
node --test scripts/prepare-vosk.test.mjs
cargo test --manifest-path src-tauri/Cargo.toml
bun run ng test --watch=false
```

Las pruebas nativas con audio real de archivo o entrada virtual son explícitas (`#[ignore]`, variables `LIBRIA_TEST_VOSK_*`). La prueba de captura requiere un dispositivo virtual aislado; no debe apuntarse al micrófono personal en una ejecución automática.
