# Especificación del Formato `.libria` (Esquema 2)

Un archivo `.libria` contiene un objeto JSON en UTF-8. Reúne los capítulos y bloques del manuscrito, sus metadatos, las preferencias de maquetación, las fichas, las notas y los recursos incrustados. Libria 2.4.0 guarda con el **esquema 2**. Las incorporaciones de esta versión son campos opcionales.

---

## Estructura del Archivo

Un documento `.libria` es un objeto JSON raíz con las siguientes propiedades:

### 1. `libriaVersion` (string)
Identifica la versión de la aplicación que guardó el archivo, por ejemplo `"2.4.0"`.

### 1b. `schemaVersion` (number, opcional)
Versión del **esquema del formato**, independiente de la versión de la aplicación. Los documentos anteriores a la identidad de bloques no lo declaran y se tratan como versión `1`; la versión actual es `2`. Una versión de Libria rechaza los documentos con un `schemaVersion` mayor que el que admite, para no degradar datos que no comprende.

### 1c. `revision`, `modifiedAt`, `modifiedBy` (opcionales)
Sello de la última edición del documento, escrito por el guardado:

- `revision` (number): contador monótono que avanza con cada guardado con contenido. Es la base para comparar versiones y anclar revisiones editoriales.
- `modifiedAt` (string): fecha ISO 8601 del último guardado.
- `modifiedBy` (string): nombre visible del autor del último guardado.

La lectura conserva estos campos. Pueden faltar en archivos antiguos. Un proyecto recién creado parte de la revisión `0` y puede tener fechas y nombre de modificación vacíos antes de su primer guardado.

### 2. `metadata` (object)
Información bibliográfica básica de la obra. Basado en la interfaz `Book`.

- `title` (string): Título de la obra.
- `subtitle` (string, opcional): Subtítulo.
- `author` (string): Autor principal.
- `authors` (array of strings): Lista completa de autores.
- `editors` (array of strings, opcional): Lista de editores participantes.
- `publisher` (string, opcional): Editorial.
- `year` (number, opcional): Año de publicación.
- `isbn` (string, opcional): ISBN o identificador similar.
- `headingImage` (object, opcional): Ilustración predeterminada de apertura de los capítulos. Contiene `assetId` (clave de imagen PNG o JPEG en `assets`) y dimensiones de presentación `width` y `height` en píxeles.
- `paperSize` (string): Formato de página (`"5x8"`, `"6x9"`, `"A5"`, `"A4"`, `"A6"`, `"Letter"`).
- `lang` (string, opcional): Código del idioma del documento (ej: `"es-MX"`).

### 3. `preferences` (object)
Configuración detallada de diseño, tipografía y maquetación (interfaz `Tweaks`).

El color de la interfaz (`mode`), su estilo visual, el idioma de la aplicación, el perfil de usuario y el ancho de la vista previa se guardan como preferencias personales. El vínculo con Google Drive y las copias automáticas de recuperación también viven fuera del archivo. La posición de la barra lateral y la activación del corrector se serializan en `preferences`, pero la configuración personal tiene prioridad al abrir el libro si define esos valores.

- **Generales**:
  - `sidebar` (string): Orientación de la barra lateral (`"left"` o `"right"`).
  - `spellcheck` (boolean): Activa o desactiva la revisión ortográfica integrada.
  - `pdfxCompliant` (boolean): Activa la exportación PDF compatible con el estándar PDF/X.
- **Tipografía y Fuente**:
  - `bookFont` (string): Identificador de la fuente para el cuerpo del texto (`"spectral"`, `"lora"`, `"eb-garamond"`, `"crimson-pro"`, `"inter"`, `"montserrat"`).
  - `customBookFont` (string, opcional): Nombre de una fuente personalizada del sistema.
  - `fontSize` (number): Tamaño de la fuente base en puntos tipográficos (pt).
  - `lineHeight` (number): Interlineado del texto (ej: `1.5`).
  - `paragraphSpacing` (number): Espaciado adicional entre párrafos en puntos tipográficos (pt).
  - `indentFirstLine` (boolean): Indica si se debe aplicar sangría a la primera línea de los párrafos.
  - `indentSize` (number): Tamaño de la sangría en centímetros, por ejemplo `0.5`.
  - `justifyText` (boolean): Justificación completa del texto del manuscrito.
- **Márgenes de Página (en mm)**:
  - `marginTop` (number)
  - `marginBottom` (number)
  - `marginInner` (number)
  - `marginOuter` (number)
- **Encabezados y Números de Página**:
  - `showHeader` (boolean): Activa la cabecera en las páginas del libro.
  - `headerText` (string): Texto estático a mostrar en el encabezado.
  - `showPageNumbers` (boolean): Activa la numeración de páginas.
  - `hideBlankPageNumbers` (boolean): Oculta el número visible de las páginas en blanco, que siguen contando.
  - `pageNumberingStart` (string): `"document"` numera desde el inicio del documento y `"body"` empieza en el primer capítulo del cuerpo.
  - `pageNumberPosition` (string): Ubicación de la numeración (`"bottom-center"`, `"bottom-edges"`, `"top-edges"`).
- **Estilo de Títulos de Capítulos**:
  - `titleFont` (string): Tipografía de los títulos (`"spectral"`, etc.).
  - `customTitleFont` (string, opcional): Fuente personalizada de títulos instalada en el sistema.
  - `titleFontSize` (number): Tamaño de fuente de los títulos principales en puntos tipográficos (pt).
  - `titleAlignment` (string): Alineación del título (`"left"`, `"center"`, `"right"`).
  - `titleBold` (boolean): Aplica negrita al título.
  - `titleItalic` (boolean): Aplica cursiva al título.
  - `titleUnderline` (boolean): Aplica subrayado al título.
- **Detalles Tipográficos y de Automatización**:
  - `dropCap` (boolean): Habilita letras capitulares al inicio de cada capítulo.
  - `dropCapLines` (number): Número de líneas de altura para la letra capitular (ej: `3`).
  - `firstParagraphSmallCaps` (boolean): Versalitas en la primera línea del párrafo inicial. Por defecto `true` para documentos anteriores.
  - `hideFirstPageHeaderFooter` (boolean): Oculta encabezado y número de página en la primera hoja. Por defecto `true` para documentos anteriores; no reinicia la numeración.
  - `hyphenation` (boolean): Activa el guionado (separación silábica) automático.
  - `sceneBreakType` (string): Estilo de separador de escenas (`"asterisks"`, `"asterisks3"`, `"dots"`, `"flourish"`, `"none"`).
  - `smartQuotes` (boolean): Conversión automática a comillas inteligentes.
  - `smartDashes` (boolean): Conversión automática a guiones cortos/largos (em/en dashes).
  - `smartEllipsis` (boolean): Conversión automática de tres puntos en el glifo de puntos suspensivos.
  - `smartOpeningSigns` (boolean): Ajuste automático de signos de apertura de interrogación y exclamación.

### 4. `session` (object)
Guarda datos de sesión de la última edición. La aplicación admite que el objeto falte en archivos antiguos.
- `lastActiveChapterId` (string): ID del último capítulo seleccionado en el editor.

### 4b. `review` (object, opcional)
Control de cambios editorial. Las marcas **no** se guardan: se derivan comparando `baseline` (estado aceptado) con `chapters` (estado propuesto).

- `mode` (string): `"off"` o `"track"`.
- `round` (object, opcional): ronda abierta. Contiene `id`, `author`, `role` (`"author"`, `"editor"`, `"corrector"`, `"publisher"`), `startedAt` (ISO 8601), `baselineRevision` (revisión del documento al abrirla) y `schemaVersion`.
- `baseline` (array, opcional): copia del estado aceptado de los capítulos al iniciar la ronda, con los mismos identificadores de bloque que `chapters`. Aceptar un cambio actualiza ese estado. Rechazarlo restaura el bloque correspondiente en `chapters`.

Mientras hay una ronda abierta, `chapters` contiene el texto propuesto (lo que se muestra y se edita) y `baseline` el aceptado. `words` y `readMin` describen siempre el texto de `chapters`. Una versión anterior de Libria lee este objeto pero lo descarta al guardar, así que conviene cerrar la ronda antes de volver a una versión antigua.

### 5. `chapters` (array)
Lista ordenada de objetos `Chapter`. Cada capítulo se compone de:

- `id` (string): Identificador único del capítulo.
- `kind` (string): Sección general (`"front"`, `"chapter"`, `"back"`).
- `title` (string): Título o descripción del capítulo en el manuscrito.
- `words` (number): Conteo actual de palabras en el capítulo.
- `readMin` (number, opcional): Tiempo de lectura estimado en minutos.
- `number` (number, opcional): Número del capítulo (generado si corresponde).
- `status` (string, opcional): Progreso del capítulo (`"ok"`, `"draft"`, `"outline"`, `"front"`, `"back"`).
- `forceOddPage` (boolean, opcional): Fuerza al capítulo a iniciar en página impar (maquetación impresa).
- `templateId` (string, opcional): Identificador de plantilla si es un capítulo especial de maquetación (`"title-page"`, `"credits"`, `"dedication"`, `"acknowledgments"`, `"toc"`).
- `body` (array): Lista de **bloques** (`Block`) que contienen el texto y recursos del capítulo:
  - `id` (string, opcional): Identificador estable del bloque. El control de cambios usa este identificador para reconocer el bloque aunque cambie de posición. Los comentarios y las notas al pie almacenan índices posicionales. Los documentos que no lo traen lo reciben al cargarse y se persiste en el siguiente guardado. Debe ser único dentro del capítulo.
  - `type` (string): Tipo de bloque. Ejemplos:
    - `"halftitle"`: Portadilla.
    - `"title"` / `"subtitle"` / `"author"` / `"publisher"`: Datos de portada.
    - `"dedication"`: Texto de dedicatoria.
    - `"chapter-num"`: Número o rótulo visible del capítulo.
    - `"chapter-title"`: Título del capítulo.
    - `"first-p"`: Primer párrafo del capítulo (sin sangría, apto para dropcaps).
    - `"p"`: Párrafo normal.
    - `"h1"`, `"h2"`, `"h3"`: Encabezados.
    - `"blockquote"`: Cita en bloque.
    - `"epigraph"`: Epígrafe con atribución opcional.
    - `"verse"`: Poesía o estrofas.
    - `"code"`: Código preformateado.
    - `"table"`: Tabla almacenada como HTML enriquecido.
    - `"scene-break"`: Separador visual de escenas.
    - `"page-break"`: Salto de página manual.
    - `"image"`: Bloque de imagen.
    - `"list-unordered"` / `"list-ordered"`: Contenedores de listas.
  - `text` (string, opcional): Texto plano del bloque.
  - `html` (string, opcional): Texto con formato HTML seguro.
  - `drop` (string, opcional): Inicial reservada para dropcaps.
  - **Metadatos de Imagen (solo para bloques `"image"`)**:
    - `src` (string): Clave de referencia del recurso en el diccionario `assets`.
    - `width` / `height` (number, opcional): Dimensiones de presentación en píxeles, independientes de la resolución del recurso. El editor, la vista previa y las salidas HTML de PDF y EPUB limitan el ancho al espacio disponible y calculan la altura a partir de la proporción de la imagen.
    - `caption` (string, opcional): Pie de foto o leyenda.
    - `rotation` (number, opcional): Rotación en grados (`0`, `90`, `180`, `270`).
    - `flipH` / `flipV` (boolean, opcional): Volteo horizontal y vertical.
  - **Metadatos de Cita (para bloques `"epigraph"`)**:
    - `attribution` (string, opcional): Autor/fuente de la cita de epígrafe.
- `tocOptions` (object, opcional): Opciones de un elemento con `templateId: "toc"`. Sus campos booleanos son `includeFrontMatter`, `includeBackMatter`, `showChapterNumbers` y `showPageNumbers`. Cada opción está activada por defecto y se desactiva con `false`. El índice excluye sus propios elementos de tipo `toc`.
- `headingImage` (object o null, opcional): Solo se aplica a elementos del cuerpo (`kind: "chapter"`) que no sean un índice. Si falta el campo, se usa la imagen de `metadata.headingImage`. Un objeto selecciona una imagen propia y `null` oculta la ilustración.
- `synopsis` (string, opcional): Sinopsis que muestra el esquema del manuscrito.
- `writingNotes` (string, opcional): Notas privadas del capítulo. Ambos campos de planificación se guardan en el archivo `.libria` y quedan fuera de las exportaciones del libro.
- `footnotes` (array, opcional): Notas al pie del capítulo. Cada nota contiene:
  - `id` (string): Identificador único de la nota.
  - `blockIndex` (number): Índice del bloque, empezando en cero. La referencia dentro de `body[blockIndex].html` lleva el mismo `id` en un elemento `<sup data-fn="…">`.
  - `content` (string): Texto descriptivo de la nota al pie.

### 6. `notes` (array)
Comentarios de revisión y notas al margen del libro.

- `id` (string): Identificador único de la nota editorial.
- `chapterId` (string): ID del capítulo de referencia.
- `blockIndex` (number): Índice del bloque donde se ubica la nota, empezando en cero.
- `role` (string): Rol del autor (`"author"`, `"editor"`, `"corrector"`, `"publisher"`).
- `authorName` (string): Nombre visible del autor del comentario.
- `content` (string): Texto del comentario.
- `date` (string): Fecha de creación/último cambio.
- `status` (string): Estado actual de la nota (`"unresolved"`, `"resolved"`, `"not-applicable"`).
- `replies` (array): Hilo de respuestas a la nota. Cada respuesta contiene:
  - `id` (string)
  - `authorName` (string)
  - `role` (string)
  - `content` (string)
  - `date` (string)

### 7. `assets` (object)
Diccionario de recursos incrustados. Cada clave identifica una URL de datos con MIME y contenido en Base64, por ejemplo `data:image/jpeg;base64,…`.

- `cover` identifica la imagen de portada.
- Las claves `img-…` identifican imágenes insertadas en el editor. Un bloque de imagen las referencia mediante `src`.
- Las claves `heading-…` identifican ilustraciones de apertura en PNG o JPEG. `headingImage.assetId` apunta al recurso y `width` y `height` indican sus dimensiones de presentación. El renderizador admite enteros de 1 a 360 px para cada dimensión. Si falta el recurso, se omite la ilustración.

Un mismo recurso de encabezado puede presentarse en varios capítulos sin duplicar sus datos en el JSON.

### 8. `writingGoals` (object, opcional)
Configuración de objetivos de redacción del libro.
- `targetWords` (number): Meta total de palabras. `0` desactiva la meta.
- `deadline` (string): Fecha límite local en formato `YYYY-MM-DD`. La cadena vacía indica que no hay plazo.
- `dailyTargetWords` (integer, opcional): Meta diaria. El valor `0` desactiva la meta.
- `dailyProgress` (object, opcional): Cambio neto en el recuento de palabras por fecha local `YYYY-MM-DD`. Los valores son enteros seguros de JavaScript y pueden ser negativos si los recortes superan el texto añadido. Abrir un libro establece el recuento de partida sin sumarlo al historial.

### 9. `characters` (array, opcional)
Fichas de personajes asociadas al manuscrito. Cada objeto contiene:

- `id` (string): Identificador único de la ficha.
- `name` (string): Nombre del personaje.
- `content` (string): Contenido libre de la ficha.
- `chapterIds` (array de strings, opcional): Identificadores de capítulos vinculados. La vista muestra los vínculos que apuntan a capítulos presentes en el manuscrito.

### 10. `locations` (array, opcional)
Fichas de lugares asociadas al manuscrito. Cada objeto contiene:

- `id` (string): Identificador único de la ficha.
- `name` (string): Nombre del lugar.
- `content` (string): Contenido libre de la ficha.
- `chapterIds` (array de strings, opcional): Identificadores de capítulos vinculados. La vista muestra los vínculos que apuntan a capítulos presentes en el manuscrito.

---

## Compatibilidad, migración y validación

Antes de validar, Libria normaliza documentos creados por versiones anteriores:

- crea arreglos vacíos para `chapters`, `notes`, `characters` y `locations` cuando faltan;
- crea objetos vacíos para `session` y `assets` cuando faltan;
- deriva `metadata.authors` desde `metadata.author`, inicializa `metadata.editors` y usa `"es-MX"` como idioma predeterminado;
- migra las preferencias antiguas `emDash`/`enDash`, `ellipsis` y `openingSigns` a `smartDashes`, `smartEllipsis` y `smartOpeningSigns`, respectivamente, cuando no está definida la preferencia nueva;
- asigna identificadores a los bloques heredados, también dentro de `review.baseline`;
- aplica `true` a `firstParagraphSmallCaps` y `hideFirstPageHeaderFooter` cuando faltan.

El cargador comprueba la estructura tras esa migración. Entre sus límites están **10 000 capítulos**, **100 000 bloques por capítulo**, **200 caracteres por identificador de bloque** y **104 857 600 caracteres por valor en `assets`**, incluido el prefijo de la URL de datos. Rechaza identificadores de capítulo repetidos y de bloque repetidos dentro de un capítulo, tipos de papel desconocidos y valores no textuales en `text` y `html`.

Los consumidores deben tratar `html` como contenido no confiable. Los exportadores sanean el HTML enriquecido y admiten, entre otras etiquetas, `a`, `s`, `b`, `i`, `u`, `strong`, `em`, `sup`, `br`, párrafos, listas y tablas. Cuando Libria genera marcas editoriales con `ins` y `del`, las deriva de `review.baseline` y de los capítulos actuales.

El esquema de abajo describe los campos del formato para integraciones. La validación de apertura usa el migrador y el validador de Libria. Algunas reglas, como la unicidad de los identificadores, se comprueban en el código. La compatibilidad permite abrir manuscritos anteriores desde 2.4.0. Si se vuelve a guardar desde una versión anterior, algunos campos nuevos pueden perderse.

---

## JSON Schema (Draft 7)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Libria Document Schema v2",
  "definitions": {
    "headingImage": {
      "type": "object",
      "required": ["assetId", "width", "height"],
      "properties": {
        "assetId": { "type": "string", "pattern": "^heading-[a-zA-Z0-9-]+$" },
        "width": { "type": "integer", "minimum": 1, "maximum": 360 },
        "height": { "type": "integer", "minimum": 1, "maximum": 360 }
      }
    }
  },
  "type": "object",
  "required": ["libriaVersion", "metadata", "preferences", "chapters"],
  "properties": {
    "libriaVersion": { "type": "string" },
    "schemaVersion": { "type": "integer", "minimum": 1, "maximum": 2 },
    "revision": { "type": "integer", "minimum": 0 },
    "modifiedAt": { "type": "string" },
    "modifiedBy": { "type": "string" },
    "metadata": {
      "type": "object",
      "required": ["title", "author", "paperSize"],
      "properties": {
        "title": { "type": "string" },
        "subtitle": { "type": "string" },
        "author": { "type": "string" },
        "authors": { "type": "array", "items": { "type": "string" } },
        "editors": { "type": "array", "items": { "type": "string" } },
        "publisher": { "type": "string" },
        "year": { "type": "integer" },
        "isbn": { "type": "string" },
        "headingImage": { "$ref": "#/definitions/headingImage" },
        "paperSize": { "enum": ["5x8", "6x9", "A5", "A4", "A6", "Letter"] },
        "lang": { "type": "string" }
      }
    },
    "preferences": {
      "type": "object",
      "properties": {
        "sidebar": { "enum": ["left", "right"] },
        "spellcheck": { "type": "boolean" },
        "pdfxCompliant": { "type": "boolean" },
        "bookFont": { "type": "string" },
        "customBookFont": { "type": ["string", "null"] },
        "fontSize": { "type": "number", "minimum": 8 },
        "lineHeight": { "type": "number" },
        "paragraphSpacing": { "type": "number" },
        "indentFirstLine": { "type": "boolean" },
        "indentSize": { "type": "number" },
        "justifyText": { "type": "boolean" },
        "marginTop": { "type": "number" },
        "marginBottom": { "type": "number" },
        "marginInner": { "type": "number" },
        "marginOuter": { "type": "number" },
        "showPageNumbers": { "type": "boolean" },
        "hideBlankPageNumbers": { "type": "boolean" },
        "pageNumberingStart": { "enum": ["document", "body"] },
        "showHeader": { "type": "boolean" },
        "headerText": { "type": "string" },
        "sceneBreakType": { "enum": ["asterisks", "asterisks3", "dots", "flourish", "none"] },
        "titleAlignment": { "enum": ["left", "center", "right"] },
        "titleFontSize": { "type": "number" },
        "titleFont": { "type": "string" },
        "customTitleFont": { "type": ["string", "null"] },
        "titleBold": { "type": "boolean" },
        "titleItalic": { "type": "boolean" },
        "titleUnderline": { "type": "boolean" },
        "pageNumberPosition": { "enum": ["bottom-center", "bottom-edges", "top-edges"] },
        "dropCap": { "type": "boolean" },
        "dropCapLines": { "type": "number" },
        "firstParagraphSmallCaps": { "type": "boolean", "default": true },
        "hideFirstPageHeaderFooter": { "type": "boolean", "default": true },
        "hyphenation": { "type": "boolean" },
        "smartQuotes": { "type": "boolean" },
        "smartDashes": { "type": "boolean" },
        "smartEllipsis": { "type": "boolean" },
        "smartOpeningSigns": { "type": "boolean" }
      }
    },
    "session": {
      "type": "object",
      "properties": {
        "lastActiveChapterId": { "type": "string" }
      }
    },
    "chapters": {
      "type": "array",
      "maxItems": 10000,
      "items": {
        "type": "object",
        "required": ["id", "kind", "title", "body"],
        "properties": {
          "id": { "type": "string" },
          "kind": { "enum": ["front", "chapter", "back"] },
          "title": { "type": "string" },
          "words": { "type": "integer" },
          "readMin": { "type": "integer" },
          "number": { "type": "integer" },
          "status": { "type": "string" },
          "forceOddPage": { "type": "boolean" },
          "templateId": { "enum": ["title-page", "credits", "dedication", "acknowledgments", "toc"] },
          "tocOptions": {
            "type": "object",
            "properties": {
              "includeFrontMatter": { "type": "boolean", "default": true },
              "includeBackMatter": { "type": "boolean", "default": true },
              "showChapterNumbers": { "type": "boolean", "default": true },
              "showPageNumbers": { "type": "boolean", "default": true }
            }
          },
          "body": {
            "type": "array",
            "maxItems": 100000,
            "items": {
              "type": "object",
              "required": ["type"],
              "properties": {
                "id": { "type": "string", "minLength": 1, "maxLength": 200 },
                "type": { "type": "string" },
                "text": { "type": "string" },
                "html": { "type": "string" },
                "drop": { "type": "string" },
                "src": { "type": "string" },
                "width": { "type": "number" },
                "height": { "type": "number" },
                "caption": { "type": "string" },
                "attribution": { "type": "string" },
                "rotation": { "type": "integer" },
                "flipH": { "type": "boolean" },
                "flipV": { "type": "boolean" }
              }
            }
          },
          "headingImage": { "anyOf": [{ "$ref": "#/definitions/headingImage" }, { "type": "null" }] },
          "synopsis": { "type": "string" },
          "writingNotes": { "type": "string" },
          "footnotes": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "blockIndex", "content"],
              "properties": {
                "id": { "type": "string" },
                "blockIndex": { "type": "integer" },
                "content": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "notes": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "chapterId", "blockIndex", "role", "authorName", "content", "date", "status"],
        "properties": {
          "id": { "type": "string" },
          "chapterId": { "type": "string" },
          "blockIndex": { "type": "integer" },
          "role": { "enum": ["author", "editor", "corrector", "publisher"] },
          "authorName": { "type": "string" },
          "content": { "type": "string" },
          "date": { "type": "string" },
          "status": { "enum": ["unresolved", "resolved", "not-applicable"] },
          "replies": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["id", "authorName", "role", "content", "date"],
              "properties": {
                "id": { "type": "string" },
                "authorName": { "type": "string" },
                "role": { "enum": ["author", "editor", "corrector", "publisher"] },
                "content": { "type": "string" },
                "date": { "type": "string" }
              }
            }
          }
        }
      }
    },
    "assets": {
      "type": "object",
      "propertyNames": { "minLength": 1 },
      "additionalProperties": { "type": "string", "maxLength": 104857600 }
    },
    "writingGoals": {
      "type": "object",
      "properties": {
        "targetWords": { "type": "integer" },
        "deadline": { "type": "string" },
        "dailyTargetWords": { "type": "integer", "minimum": 0 },
        "dailyProgress": {
          "type": "object",
          "propertyNames": { "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" },
          "additionalProperties": { "type": "integer" }
        }
      }
    },
    "review": {
      "type": ["object", "null"],
      "properties": {
        "mode": { "enum": ["off", "track"] },
        "round": {
          "type": ["object", "null"],
          "properties": {
            "id": { "type": "string" },
            "author": { "type": "string" },
            "role": { "enum": ["author", "editor", "corrector", "publisher"] },
            "startedAt": { "type": "string" },
            "baselineRevision": { "type": "integer", "minimum": 0 },
            "schemaVersion": { "type": "integer", "minimum": 1 }
          }
        },
        "baseline": { "type": ["array", "null"], "items": { "type": "object" } }
      }
    },
    "characters": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "content"],
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "content": { "type": "string" },
          "chapterIds": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "locations": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "content"],
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "content": { "type": "string" },
          "chapterIds": { "type": "array", "items": { "type": "string" } }
        }
      }
    }
  }
}
```
