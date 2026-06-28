# Especificación del Formato `.libria` (Esquema v1.5.1)

El formato `.libria` es un estándar basado en JSON diseñado para el almacenamiento persistente de manuscritos en la aplicación Libria. Permite agrupar en un único archivo el contenido textual (organizado en bloques y capítulos), la estructura jerárquica del libro, los metadatos bibliográficos, los comentarios editoriales enriquecidos, los objetivos de escritura y los ajustes finos de maquetación tipográfica.

---

## Estructura del Archivo

Un documento `.libria` es un objeto JSON raíz con las siguientes propiedades:

### 1. `libriaVersion` (string)
Indica la versión de Libria con la que se generó el archivo. Ej: `"1.5.1"`.

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
- `paperSize` (string): Formato de página (`"5x8"`, `"6x9"`, `"A5"`, `"A4"`, `"A6"`, `"Letter"`).
- `lang` (string, opcional): Código del idioma del documento (ej: `"es-MX"`).

### 3. `preferences` (object)
Configuración detallada de diseño, tipografía y maquetación (interfaz `Tweaks`).

- **Generales**:
  - `sidebar` (string): Orientación de la barra lateral (`"left"` o `"right"`).
  - `spellcheck` (boolean): Activa o desactiva la revisión ortográfica integrada.
  - `pdfxCompliant` (boolean): Activa la exportación PDF compatible con el estándar PDF/X.
- **Tipografía y Fuente**:
  - `bookFont` (string): Identificador de la fuente para el cuerpo del texto (`"spectral"`, `"lora"`, `"eb-garamond"`, `"crimson-pro"`, `"inter"`, `"montserrat"`).
  - `customBookFont` (string, opcional): Nombre de una fuente personalizada del sistema.
  - `fontSize` (number): Tamaño de la fuente base del libro en px.
  - `lineHeight` (number): Interlineado del texto (ej: `1.5`).
  - `paragraphSpacing` (number): Espaciado adicional entre párrafos en px.
  - `indentFirstLine` (boolean): Indica si se debe aplicar sangría a la primera línea de los párrafos.
  - `indentSize` (number): Tamaño de la sangría en pulgadas (ej: `0.5`).
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
  - `pageNumberPosition` (string): Ubicación de la numeración (`"bottom-center"`, `"bottom-edges"`, `"top-edges"`).
- **Estilo de Títulos de Capítulos**:
  - `titleFont` (string): Tipografía de los títulos (`"spectral"`, etc.).
  - `customTitleFont` (string, opcional): Fuente personalizada de títulos instalada en el sistema.
  - `titleFontSize` (number): Tamaño de fuente de los títulos principales.
  - `titleAlignment` (string): Alineación del título (`"left"`, `"center"`, `"right"`).
  - `titleBold` (boolean): Aplica negrita al título.
  - `titleItalic` (boolean): Aplica cursiva al título.
  - `titleUnderline` (boolean): Aplica subrayado al título.
- **Detalles Tipográficos y de Automatización**:
  - `dropCap` (boolean): Habilita letras capitulares al inicio de cada capítulo.
  - `dropCapLines` (number): Número de líneas de altura para la letra capitular (ej: `3`).
  - `hyphenation` (boolean): Activa el guionado (separación silábica) automático.
  - `sceneBreakType` (string): Estilo de separador de escenas (`"asterisks"`, `"asterisks3"`, `"dots"`, `"flourish"`, `"none"`).
  - `smartQuotes` (boolean): Conversión automática a comillas inteligentes.
  - `smartDashes` (boolean): Conversión automática a guiones cortos/largos (em/en dashes).
  - `smartEllipsis` (boolean): Conversión automática de tres puntos en el glifo de puntos suspensivos.
  - `smartOpeningSigns` (boolean): Ajuste automático de signos de apertura de interrogación y exclamación.

### 4. `session` (object)
Guarda datos de sesión de la última edición.
- `lastActiveChapterId` (string): ID del último capítulo seleccionado en el editor.

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
  - `type` (string): Tipo de bloque. Ejemplos:
    - `"halftitle"`: Portadilla.
    - `"title"` / `"subtitle"` / `"author"` / `"publisher"`: Datos de portada.
    - `"dedication"`: Texto de dedicatoria.
    - `"chapter-title"`: Título del capítulo.
    - `"first-p"`: Primer párrafo del capítulo (sin sangría, apto para dropcaps).
    - `"p"`: Párrafo normal.
    - `"h1"`, `"h2"`, `"h3"`: Encabezados.
    - `"blockquote"`: Cita en bloque.
    - `"verse"`: Poesía o estrofas.
    - `"code"`: Código preformateado.
    - `"scene-break"`: Separador visual de escenas.
    - `"page-break"`: Salto de página manual.
    - `"image"`: Bloque de imagen.
    - `"list-unordered"` / `"list-ordered"`: Contenedores de listas.
  - `text` (string, opcional): Texto plano del bloque.
  - `html` (string, opcional): Texto con formato HTML seguro.
  - `drop` (string, opcional): Inicial reservada para dropcaps.
  - **Metadatos de Imagen (solo para bloques `"image"`)**:
    - `src` (string): Clave de referencia del recurso en el diccionario `assets`.
    - `width` / `height` (number, opcional): Dimensiones de renderizado.
    - `caption` (string, opcional): Pie de foto o leyenda.
    - `rotation` (number, opcional): Rotación en grados (`0`, `90`, `180`, `270`).
    - `flipH` / `flipV` (boolean, opcional): Volteo horizontal y vertical.
  - **Metadatos de Cita (para bloques `"epigraph"`)**:
    - `attribution` (string, opcional): Autor/fuente de la cita de epígrafe.
- `footnotes` (array, opcional): Notas al pie del capítulo. Cada nota contiene:
  - `id` (string): Identificador único de la nota.
  - `blockIndex` (number): Índice del bloque de texto donde está insertada la referencia.
  - `content` (string): Texto descriptivo de la nota al pie.

### 6. `notes` (array)
Comentarios de revisión y notas al margen del libro.

- `id` (string): Identificador único de la nota editorial.
- `chapterId` (string): ID del capítulo de referencia.
- `blockIndex` (number): Índice del bloque donde se ubica la nota.
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
Diccionario de recursos de medios del proyecto. Las claves son identificadores únicos y los valores son cadenas binarias codificadas en Base64 con su prefijo MIME.
- `"cover"` (string): Imagen de portada del libro (ej: `data:image/jpeg;base64,...`).
- `"img-XXXX"` (string): Imágenes locales referenciadas en bloques del manuscrito.

### 8. `writingGoals` (object, opcional)
Configuración de objetivos de redacción del libro.
- `targetWords` (number): Número total de palabras objetivo.
- `deadline` (string): Fecha límite en formato ISO (`YYYY-MM-DD`).

---

## JSON Schema (Draft 7)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Libria Document Schema v1.5.1",
  "type": "object",
  "required": ["libriaVersion", "metadata", "preferences", "chapters"],
  "properties": {
    "libriaVersion": { "type": "string" },
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
          "body": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["type"],
              "properties": {
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
      "additionalProperties": { "type": "string" }
    },
    "writingGoals": {
      "type": "object",
      "properties": {
        "targetWords": { "type": "integer" },
        "deadline": { "type": "string" }
      }
    }
  }
}
```
