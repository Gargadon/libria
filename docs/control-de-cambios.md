# Control de cambios en documentos `.libria`

Diseño de referencia para el control de cambios editorial (marcas de revisión, aceptar/rechazar
y exportación con revisiones). Describe el estado actual, el modelo propuesto, el plan por fases
y los riesgos verificados con prototipos.

- Estado: **fases 1–3 implementadas**; pendiente de depuración en uso real.
- Alcance: aplicación de escritorio y web; formato `.libria`; exportadores DOCX, ODT, EPUB y PDF.
- Relacionado: [FORMATO_LIBRIA.md](../FORMATO_LIBRIA.md), [architecture.md](architecture.md),
  [google-drive.md](google-drive.md).

---

## 1. Punto de partida

### 1.1 Lo que ya existe

| Pieza | Ubicación | Reutilizable para |
| --- | --- | --- |
| Escritura atómica (temporal + `fsync` + `persist`) | `src-tauri/src/files.rs:40` | Respaldo antes de aceptar cambios masivos |
| Comparación canónica de contenido (ignora orden de claves) | `src/app/services/file.service.ts:160` | Detectar "sin cambios reales", deduplicar rondas |
| Recolección de cambios con *debounce* y puntos de control | `src/app/services/recovery.service.ts:42` | Disparador del registro de cambios |
| Almacén persistente con poda transaccional | `src/app/services/recovery-storage.service.ts:43` | Copia sombra de las revisiones |
| Marcas de agrupación de acciones (`saveSnapshot`) | `src/app/store/book.store.ts:238` | Delimitar unidades de cambio |
| Roles editoriales (`author`, `editor`, `corrector`, `publisher`) | `src/app/models/book.models.ts:128` | Autoría de cada cambio |
| Registro de cambios fuera de la app | `tmp/manuscript-proofreading/cambios.json` | Especificación funcional del formato de parche |

### 1.2 Lo que falta

1. **Identidad del documento.** Un `.libria` no dice quién lo modificó ni cuándo: `buildDoc`
   (`src/app/services/file.service.ts:203`) no escribe `modifiedBy` ni `revision`.
2. **Anclas estables.** `Block` no tiene `id` (`src/app/models/book.models.ts:4`); las notas al pie y
   los comentarios se anclan con `blockIndex` posicional (`:21`, `:131`). Insertar un párrafo
   desplaza todas las anclas posteriores.
3. **Versión de esquema.** `libriaVersion` es la versión *de la aplicación* (2.1.1), el documento
   de ejemplo dice `1.5.1` y la especificación dice "esquema v1.8.5". Hace falta un número de
   esquema propio para poder migrar revisiones.
4. **Marcas en el HTML.** La lista blanca del saneador (`src/app/utils/block-html.ts:15`) no admite
   `ins`, `del` ni atributos `data-*`. Verificado: con la configuración actual,
   `<b>Hola <del>mal</del><ins>bien</ins></b>` se convierte en `<b>Hola malbien</b>` — el texto
   suprimido reaparece y la inserción se confunde con el original.

---

## 2. Decisión de arquitectura

**Las marcas no se guardan dentro del HTML editable.** Se derivan en tiempo de render a partir de
un diff entre el texto aceptado y el texto propuesto.

### Por qué

El editor reconstruye el DOM del bloque desde `innerHTML` en cada pulsación
(`src/app/components/editor/contenteditable.directive.ts:46`) y **borra `html`** en las operaciones
estructurales (`src/app/store/book.store.ts:783`, `:799`, `:1023`). Además el texto canónico sale de
`innerText` (`src/app/components/editor/editor.component.ts:366`): si se inyectan `<del>` en el bloque
editable, `innerText` incluiría el texto suprimido y divergirían el recuento de palabras, la búsqueda,
la corrección ortográfica y las notas al pie.

Con marcas guardadas en el HTML:

- toda edición posterior puede destruirlas silenciosamente;
- hay que mantener desplazamientos de carácter válidos tras cada tecla (el problema de las OT);
- el saneado, la vista previa y los cuatro exportadores deben entender el marcado nuevo.

Con marcas derivadas:

- `text` sigue siendo canónico: recuento, búsqueda, ortografía y notas no cambian;
- las ediciones posteriores se absorben solas, porque el diff se recalcula;
- un único renderizador alimenta editor, vista previa, PDF, DOCX, ODT y EPUB;
- solo se almacenan los bloques con cambios pendientes: 50 bloques en el manuscrito de prueba, y en el
  libro de ejemplo todo el texto con su estructura ocupa 25 KB de los 1,5 MB del archivo (el 97,6 % son
  imágenes Base64).

### Coste asumido

El marcado fino por autor dentro de un mismo bloque exige rondas de revisión con autoría por ronda.
En la primera versión cada ronda tiene un autor; varias rondas simultáneas sobre el mismo bloque
llegan en una fase posterior.

---

## 3. Modelo de datos

### 3.1 Extensiones del documento

```jsonc
{
  "libriaVersion": "2.2.0",
  "schemaVersion": 2,                 // nuevo: versión del esquema, no de la app
  "revision": 12,                     // nuevo: contador monótono de guardados con contenido
  "modifiedAt": "2026-11-01T18:20:00.000Z",
  "modifiedBy": "David Kantun",
  "metadata": {
    // …campos actuales…
  },
  "chapters": [
    {
      "id": "ch-1",
      "body": [
        { "id": "blk-7f3a", "type": "p", "text": "…", "html": "…" }   // id estable nuevo
      ]
    }
  ],
  "review": {
    "mode": "track",                  // "off" | "track"
    "round": {
      "id": "rv-01",
      "author": "Ana Correctora",
      "role": "corrector",
      "startedAt": "2026-11-01T18:00:00.000Z",
      "baselineRevision": 11
    },
    "changes": [
      {
        "id": "c-01",
        "kind": "text",               // text | block-insert | block-delete | block-replace
        "chapterId": "ch-1",
        "blockId": "blk-7f3a",
        "blockIndex": 4,              // respaldo de anclaje
        "source": "texto aceptado al iniciar la ronda",
        "sourceHtml": "<b>…</b>",     // opcional; permite rechazar sin perder formato
        "target": "texto propuesto",
        "status": "pending",          // pending | stale
        "date": "2026-11-01T18:02:11.000Z"
      }
    ]
  }
}
```

Reglas:

- `review` es opcional: un documento sin revisiones pendientes no lo lleva y sigue siendo válido.
- Mientras hay una ronda abierta, `Block.text` contiene **la propuesta** (lo que se ve y se edita).
- `source` es la versión aceptada; aceptar elimina el cambio, rechazar restaura `source`/`sourceHtml`.
- Los cambios se guardan completos (no como parches) para que la aceptación y el rechazo sean
  independientes del orden y sobrevivan a ediciones posteriores de otros bloques.
- `Chapter.words` y `Chapter.readMin` son métricas descriptivas del texto que contiene el capítulo, no
  estado editorial: mientras hay una ronda abierta cuentan la propuesta, igual que hoy cuentan lo que
  hay en el editor. No requieren código nuevo (`calculateWords` en `book.store.ts:740`, `totalWords`
  derivado en `:160`). El total aceptado, si se muestra, es una cifra calculada para la vista de
  revisión y no se persiste.

### 3.2 Identificadores de bloque

- Se generan al crear el bloque (`addChapter`, `insertBlock`, `splitBlock`, `addChapters`,
  importación DOCX/TXT, plantillas, restauración de recuperación).
- En documentos antiguos se asignan **en memoria al cargar** y se persisten en el siguiente guardado.
- Al fusionar o eliminar un bloque su `id` desaparece: el cambio conserva la carga útil completa del
  bloque y un ancla (`blockId` anterior + `blockIndex`) para poder rechazarlo.

### 3.3 Tipos de cambio y su efecto

| `kind` | Se produce en | Aceptar | Rechazar |
| --- | --- | --- | --- |
| `text` | `updateChapterBlock`, `replaceAll` | Deja el bloque como está y descarta el registro | Restaura `source` + `sourceHtml` |
| `block-insert` | `insertBlock`, pegado multilínea, imágenes | Deja el bloque | Elimina el bloque |
| `block-delete` | `deleteBlock` | Elimina el bloque | Reinserta la carga útil tras el ancla |
| `block-replace` | `splitBlock`, `mergeWithPrevious`, `mergeBlockWithNext`, `setBlockType` | Aplica la nueva estructura | Restaura la estructura anterior |

Las operaciones de imagen (tamaño, rotación, volteo, pie) se registran como `block-replace` del bloque
de imagen correspondiente.

---

## 4. Captura de cambios

El punto de captura es el store, no el DOM: todas las mutaciones de contenido pasan por
`book.store.ts` (`updateChapterBlock:730`, `setBlockType:753`, `insertBlock:768`, `splitBlock:783`,
`mergeWithPrevious:799`, `deleteBlock:823`, `mergeBlockWithNext:834`, `replaceAll:1023`).

- **Granularidad:** el editor agrupa la actualización del store en ráfagas de 200 ms
  (`editor.component.ts:352`) y abre un punto de deshacer por cada ráfaga de escritura agrupada a 1 s.
  Cada llamada a `updateChapterBlock` con `review.mode === "track"` produce **un cambio por bloque y
  ráfaga**, que es la agrupación que un corrector espera ver.
- **Autoría:** `personalConfig.userName` es local al dispositivo; al activar el modo revisión se pide
  nombre y rol una vez por ronda y se guardan en `review.round`. No se mezcla con el perfil local.
- **Formato (negrita, cursiva, subrayado):** el diff es textual. Cambiar solo el formato no genera
  cambio de texto; se registra como `block-replace` con `sourceHtml`/`targetHtml` (fase 2).
- **Texto frente a HTML desalineado:** verificado en el manuscrito de prueba, 1 de 186 bloques tiene
  `text` distinto del `textContent` del HTML (un espacio inicial). El renderizador diferencia contra
  el **texto visible** del HTML, no contra `text`, y al aceptar se reescriben ambos campos.

---

## 5. Renderizado de marcas

Algoritmo (prototipo verificado, ver §8):

1. Se tokeniza en palabras y espacios y se calcula un LCS para obtener operaciones
   `equal | insert | delete`.
2. Se proyectan las operaciones sobre el texto visible del HTML del bloque.
3. Se recorren los nodos de texto en orden de documento con su desplazamiento acumulado; cada nodo se
   parte en segmentos y los segmentos insertados/eliminados se envuelven en `<ins class="rev-ins">` /
   `<del class="rev-del">`. El formato existente (`b`, `i`, `u`, `em`, `strong`) se conserva porque los
   segmentos se insertan como hermanos dentro del mismo padre.
4. Aceptar = eliminar `del` y desenvolver `ins`; rechazar = lo contrario.

Propiedades que el prototipo cumple sobre el manuscrito real (50 bloques con cambios, 26 con HTML rico):

- aceptar todo devuelve exactamente el texto propuesto: 50/50;
- rechazar todo devuelve exactamente el texto original: 50/50;
- la secuencia de etiquetas de formato es idéntica a la original: 50/50, 0 fallos.

### Saneador

Hay que ampliar la lista blanca de `block-html.ts:15` con `ins`, `del` y los atributos de autoría
(`data-rev-author`, `data-rev-date`). Verificado: con la lista ampliada, `ins`/`del` y sus atributos
sobreviven al saneado; con la actual, no.

### Dónde se muestran

| Superficie | Marcas |
| --- | --- |
| Editor (modo normal) | Indicador en el margen del bloque con cambios pendientes; sin marcas dentro del texto editable |
| Vista de revisión (nueva, solo lectura) | Marcas completas, navegación cambio a cambio, aceptar/rechazar |
| Vista previa de impresión | Marcas si el modo revisión está activo; CSS en `print-html.service.ts:528` |
| Exportación | Según §6 |

Mostrar las marcas dentro del bloque editable es la fase 3, opcional: exige normalizar selección y
cursor entre `<ins>`/`<del>` (`editor-dom.ts`, `editor-selection`) y es la parte de mayor riesgo.

---

## 6. Exportación

| Formato | Revisión nativa | Estrategia |
| --- | --- | --- |
| DOCX | Sí | `InsertedTextRun` / `DeletedTextRun` con `{ id, author, date }` y `features.trackRevisions` (soportado por la versión instalada de `docx`). Requiere sustituir el tokenizador por expresiones regulares de `docx-block-renderer.ts:62` (ignora atributos) por un recorrido real del DOM; hoy `ins` se interpreta como subrayado (`:92`). |
| ODT | No (equivalente visual) | `<text:span text:style-name="RevInsert">` / `RevDelete` con estilos dedicados. LibreOffice los muestra como formato, no como cambios registrados. |
| EPUB | No | Clases `rev-ins` / `rev-del` con CSS; en distribución se exporta sin marcas (aceptar todo) más un informe de cambios. |
| PDF | No | CSS de `print-html.service.ts`: color, subrayado, tachado y barra de cambio en el margen. |
| Informe | — | `cambios.md`/`cambios.json` con autor, fecha, ubicación y texto anterior/nuevo, como el registro de `tmp/docx-proofreading/Registro de correcciones.md`. |

Cada exportación con marcas debe ofrecer: documento final, documento con marcas, y solo el informe.

---

## 7. Compatibilidad y migración

- `validateLibriaDocument` no rechaza propiedades desconocidas, así que una versión anterior **lee** un
  documento con `review`; pero `buildDoc` construye un objeto literal y **lo pierde al guardar**.
- Medidas:
  1. `schemaVersion` explícito y comprobación al abrir; aviso claro si el documento trae revisiones y
     la versión es anterior.
  2. Copia sombra de `review` en el almacén de recuperación (IndexedDB), indexada por hash de
     contenido, para poder recuperar una ronda perdida por un guardado antiguo.
  3. Migración perezosa de `id` de bloque: no reescribir el archivo hasta el primer guardado real.
- `FORMATO_LIBRIA.md` debe documentar `schemaVersion`, `Block.id`, `metadata.revision|modifiedAt|modifiedBy`
  y el objeto `review`, y separar de una vez la versión de esquema de la versión de la aplicación.

---

## 8. Verificación

Prototipos ejecutados sobre `tmp/manuscript-proofreading/original.libria` y `corregido.libria`:

- `tmp/libria-review-poc/render-marks.mjs` — diff, render de marcas, aceptar/rechazar y saneado.
  Resultado: 50 bloques con cambios, 26 con HTML rico, 50/50 correctos, 0 fallos de etiquetas.
- `tmp/libria-diff-poc/diff.mjs` — motor de diferencias estructural (capítulos, bloques, palabras).
- Mediciones: `JSON.parse` de 1,5 MB en 2,07 ms; SHA-256 del texto en 0,85 ms; instantánea completa en
  3,93 ms. El 97,6 % de un `.libria` con imágenes son datos Base64, por lo que el historial y las
  marcas deben referirse a bloques, no a copias del archivo.

Pruebas a añadir (Vitest, con `jsdom` como en los prototipos):

1. `render-marks.spec.ts`: ida y vuelta aceptar/rechazar sobre HTML con formato anidado, entidades,
   comillas tipográficas y emojis (pares sustitutos).
2. `review-store.spec.ts`: cada operación del store produce el `kind` esperado; aceptar y rechazar
   dejan `text`, `html`, `words` y `readMin` coherentes.
3. `review-format.spec.ts`: documento con `review` valida; documento antiguo migra y asigna `id`.
4. Exportación: `accept-all` → DOCX/ODT/EPUB idénticos a los actuales; con marcas → `w:ins`/`w:del`
   presentes y autoría correcta.
5. Regresión: abrir `review` con una versión anterior y guardar avisa antes de perder la ronda.

---

## 9. Plan por fases

| Fase | Contenido | Archivos principales | Estado |
| --- | --- | --- | --- |
| 0. Cimientos | `schemaVersion`, `Block.id` perezoso, `revision`/`modifiedAt`/`modifiedBy`, migración y pruebas | `book.models.ts`, `ids.ts`, `document-validator.ts`, `book.store.ts`, `file.service.ts` | **Hecha** |
| 1. Modelo y captura | `review` en el documento, estado en el store, anclaje por `id`, aceptar/rechazar | `review-changes.ts`, `review.service.ts`, `book.store.ts` | **Hecha** |
| 2. Render y vista de revisión | Diff palabra a palabra, marcas `ins`/`del`, vista de revisión, i18n ×6 | `review-marks.ts`, `review-modal.component.ts`, `public/i18n/*.json` | **Hecha** |
| 3. Exportación | DOCX nativo, ODT/EPUB/PDF con estilos, informe de cambios | `docx-block-renderer.ts`, `odt-export.service.ts`, `epub-export.service.ts`, `pdf-export.service.ts` | **Hecha** |
| 4. Marcas en el editor | Marcas en línea mientras se edita, cursor entre marcas | — | Descartada (decisión: vista de revisión) |

### Qué quedó implementado

| Módulo | Responsabilidad |
| --- | --- |
| `src/app/utils/review-marks.ts` | Diff palabra a palabra, render de `<ins>`/`<del>` sobre HTML rico, aceptar y rechazar un HTML marcado. Protege pares sustitutos y usa prefijo/sufijo cuando el diff excedería el presupuesto de memoria. |
| `src/app/utils/review-changes.ts` | Alineación de bloques por `id`, cálculo de cambios (`text`, `block-insert`, `block-delete`, `block-replace`, `chapter-title`), rebase del estado aceptado y `withReviewMarks` para exportar. |
| `src/app/services/review.service.ts` | Abrir y cerrar rondas, aceptar y rechazar por cambio o en bloque, informe en Markdown. |
| `src/app/components/modals/review-modal.component.ts` | Vista de revisión con marcas, acciones por cambio y totales. Se abre desde la barra superior. |
| `src/app/store/book.store.ts` | Estado `review`, `beginReview`, `setReviewBaseline`, `endReview`, `setChapters`, `replaceBlock`, `insertBlockAt` y la preferencia `exportPrefs.includeReviewMarks`. |
| Exportadores | `withReviewMarks` alimenta los cuatro formatos; DOCX emite `w:ins`/`w:del` nativos, ODT estilos `RevInsert`/`RevDelete`, EPUB y PDF estilos en línea. |

Comportamiento acordado:

- Una sola ronda por documento; el autor y el rol se piden al abrirla y quedan en `review.round`.
- Lo propuesto se guarda en `chapters`; lo aceptado en `review.baseline`. Las marcas se derivan.
- `words`/`readMin` describen el texto propuesto, como en el editor (`review.service.ts` no los toca).
- El panel de exportación muestra «Incluir marcas de revisión» solo mientras hay una ronda abierta.
- Sin ronda, los exportadores producen exactamente el mismo resultado que antes (verificado con las
  instantáneas de DOCX y ODT).

Limitaciones conocidas, pendientes de depuración:

- Los cambios de **formato** sin cambio de texto (por ejemplo, añadir una cursiva) no generan marca:
  el diff es textual.
- El texto se guarda por bloques: dividir o fusionar párrafos se ve como un cambio de texto más una
  inserción o eliminación, no como una operación estructural de Word.
- En ODT y EPUB las marcas son formato, no revisiones nativas del formato.
- Una versión anterior de Libria descarta `review` al guardar: conviene cerrar la ronda antes.


---

## 10. Riesgos

| Riesgo | Nivel | Mitigación |
| --- | --- | --- |
| El editor destruye marcas en línea (`innerHTML` regenerado, `html` borrado en fusiones) | Alto | Marcas derivadas en vista de revisión; fase 4 opcional y aislada |
| `text` y `html` desalineados (1/186 bloques en el manuscrito de prueba) | Medio | Diferenciar contra el texto visible; reescribir ambos campos al aceptar |
| Un guardado con versión antigua pierde la ronda | Medio | `schemaVersion` + aviso + copia sombra en IndexedDB |
| Anclas obsoletas tras editar sin modo revisión | Medio | Reanclaje por `id` → índice + huella de texto; marcar `stale` y pedir revisión |
| Exportadores con tokenizador por expresiones regulares | Medio | Sustituirlo por recorrido del DOM (el WebView ya tiene `DOMParser`) |
| Crecimiento del documento | Bajo | Unos pocos KB por ronda; los assets siguen dominando el tamaño |
| Expectativa de paridad exacta con Word | Medio | Documentar qué se exporta de forma nativa (DOCX) y qué de forma visual (ODT, EPUB, PDF) |

---

## 11. Decisiones

1. **Las marcas viajan dentro del `.libria`.** Necesario para enviar el manuscrito a un corrector y
   recibirlo de vuelta. Se asume la extensión del formato con `schemaVersion` y copia sombra para no
   perder rondas abiertas con versiones anteriores.
2. ~~¿`words`/`readMin` reflejan la propuesta o el texto aceptado mientras hay una ronda abierta?~~
   **Resuelto:** son métricas descriptivas del texto. Reflejan la propuesta, como hoy reflejan lo que
   hay en el editor; sin código adicional. El total aceptado, si se necesita, se calcula en la vista de
   revisión y no se guarda.
3. **Una sola ronda pendiente por documento.** Cubre el flujo autor → corrector sin introducir
   concurrencia. Varias rondas superpuestas quedan para una fase posterior.
4. **Las marcas se ven en la vista de revisión, no dentro del bloque editable.** El editor sigue
   editando texto normal; la fase 4 (marcas en línea) queda descartada por ahora.
