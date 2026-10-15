# Benchmark interno de CPU y RAM

El benchmark ejecuta Libria nativa en Windows, con Angular de producción y Rust
`release`. Automatiza la interfaz mediante CDP y suma el consumo de `libria.exe`
y todos sus procesos descendientes, incluidos WebView2 y su GPU. No cuenta el
proceso de automatización, PowerShell ni otros WebView2 del sistema.

[Resultados de Windows del 14 de octubre de 2026](benchmarks/windows-2026-10-14.md).

## Repetir la medición

Desde PowerShell, con las dependencias y recursos nativos preparados:

```powershell
bun run build
bun run tauri:prepare
$env:TAURI_CONFIG = '{"identifier":"com.libria.benchmark"}'
cargo build --release --manifest-path src-tauri/Cargo.toml --features custom-protocol
Remove-Item Env:TAURI_CONFIG
bun run benchmark:desktop
```

El identificador separado evita compartir los datos nativos y la instancia con
la aplicación habitual. El ejecutable resultante es una compilación para
benchmark; recompila con la configuración habitual antes de distribuirlo.
Cada repetición crea un perfil WebView2 vacío y copias de los documentos en
`tmp/benchmark-<fecha>/`. No modifica el libro original. El script comprueba el
identificador aislado y las fuentes empaquetadas antes de abrir documentos.

Opciones: `LIBRIA_BENCH_RUNS` (3 por defecto), `LIBRIA_BENCH_SECONDS` (20 segundos
por fase estable, mínimo 5) y `LIBRIA_BENCH_EXE` (ruta alternativa al ejecutable).
La automatización usa el puerto local 9432, que debe estar disponible.

## Escenarios

1. Inicio y reposo de la bienvenida.
2. Apertura de una copia de `El_Principito.libria`, reposo, escritura de unos cinco
   caracteres por segundo y reposo posterior, con vista Kindle activa.
3. Cambio a Papel, paginación y reposo con vista de impresión activa.
4. Apertura de un documento sintético de 60 000 palabras, 30 capítulos y 600
   párrafos, reposo, escritura y reposo posterior, con vista Kindle activa.

Se conservan las preferencias del documento de ejemplo, incluidas corrección
ortográfica, separación silábica y tipografías. La paginación se considera
estable tras cinco lecturas consecutivas sin cambio en el número de páginas;
su tiempo incluye esa espera de confirmación.

## Métricas y límites

- Muestras aproximadamente cada segundo; los intervalos que cruzan un cambio
  de escenario se excluyen de los promedios.
- CPU de máquina: incremento del tiempo acumulado de CPU de todos los procesos,
  dividido por el tiempo real y por el número de procesadores lógicos. El 100 %
  representa todos los procesadores ocupados. También se guarda el porcentaje
  equivalente de un núcleo (puede superar el 100 %).
- RAM residente: suma de `WorkingSet64`, expresada en MiB. Incluye páginas
  compartidas contadas en cada proceso; no es memoria física exclusiva.
- Memoria privada: suma de `PrivateMemorySize64`, en MiB. Es memoria comprometida
  privada y puede incluir páginas fuera de RAM; no equivale a RAM residente.
- Promedios ponderados por tiempo y máximos de las muestras. Los picos menores
  de un segundo pueden pasar inadvertidos. Los procesos que nacen y terminan
  entre muestras no se capturan; de procesos terminados se conserva la última
  lectura de CPU disponible.
- `results.json` conserva cada repetición; `samples.jsonl` registra cada proceso
  y contador; `metadata.json` identifica el equipo, versión, commit y binario.
- Son pruebas de una sesión local y secuencial: el caché del sistema operativo
  no se vacía, los escenarios posteriores heredan memoria y cachés de los
  anteriores, y CDP y el muestreo introducen algo de sobrecarga. No permiten
  concluir que exista una fuga de memoria ni extrapolar a otros equipos.
- No mide exportación PDF/DOCX/EPUB/ODT, sincronización Drive, uso prolongado,
  consumo energético ni memoria de GPU. La vista Papel no es una exportación PDF.
