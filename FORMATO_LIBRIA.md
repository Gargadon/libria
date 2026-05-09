# Especificación del Formato `.libria`

El formato `.libria` es un estándar basado en JSON diseñado para el almacenamiento persistente de manuscritos en la aplicación Libria. Permite agrupar en un único archivo el contenido textual, la estructura jerárquica del libro, los metadatos bibliográficos y los ajustes finos de maquetación tipográfica.

## Estructura del Archivo

Un documento `.libria` es un objeto JSON raíz con las siguientes propiedades:

### 1. `libriaVersion` (string)

Indica la versión del esquema del archivo. Actualmente `1.0.0`.

### 2. `metadata` (object)

Información bibliográfica básica. Basado en la interfaz `Book`.

- `title` (string): Título de la obra.
- `subtitle` (string, opcional): Subtítulo.
- `author` (string): Autor principal.
- `authors` (array of strings): Lista completa de autores.
- `publisher` (string, opcional): Editorial.
- `year` (number, opcional): Año de publicación.
- `isbn` (string, opcional): ISBN-13 o similar.
- `paperSize` (string): Formato de página (`"5x8"`, `"6x9"`, `"A5"`, `"A4"`).

### 3. `preferences` (object)

Configuración de diseño y tipografía (interfaz `Tweaks`).

- `bookFont` / `titleFont` (string): Identificadores de fuente (ej: `"spectral"`, `"lora"`).
- `fontSize` (number): Tamaño de fuente base en px.
- `lineHeight` (number): Interlineado (ej: `1.6`).
- `paragraphSpacing` (number): Espacio entre párrafos.
- `indentFirstLine` (boolean): Si se debe sangrar la primera línea.
- `justifyText` (boolean): Alineación justificada.
- `marginTop`, `marginBottom`, `marginInner`, `marginOuter` (number): Márgenes en mm o px según contexto.
- `dropCap` (boolean): Activa letras capitulares al inicio de capítulo.
- `hyphenation` (boolean): Activa la separación silábica automática.
- `sceneBreakType` (string): Estilo de separador (`"asterisks"`, `"dots"`, `"flourish"`, `"none"`).

### 4. `chapters` (array)

Lista de objetos `Chapter`.

- `id` (string): Identificador único (ej: `ch-1`).
- `kind` (string): Tipo de sección (`"front"`, `"chapter"`, `"back"`).
- `title` (string): Título del capítulo o sección.
- `status` (string): Estado (`"draft"`, `"outline"`, `"ok"`).
- `words` (number): Conteo de palabras.
- `readMin` (number): Tiempo estimado de lectura.
- `body` (array): Lista de **bloques** de contenido.

#### Tipos de Bloques (`body[].type`)

- `chapter-title`: Título principal del capítulo.
- `p`: Párrafo estándar.
- `first-p`: Párrafo inicial (usualmente sin sangría o con capitular).
- `h1`, `h2`, `h3`: Encabezados.
- `scene-break`: Divisor visual entre escenas.
- `page-break`: Salto de página forzado.
- `dedication`: Bloque de dedicatoria.
- `halftitle`: Portadilla.

### 5. `notes` (array)

Comentarios y anotaciones vinculadas al texto.

- `id`: ID de la nota.
- `chapterId`: ID del capítulo de referencia.
- `blockIndex`: Índice del bloque dentro del capítulo.
- `content`: Texto de la nota.
- `role`: Rol del autor de la nota (`"author"`, `"editor"`, `"corrector"`, `"publisher"`).

### 6. `assets` (object)

Diccionario de recursos binarios codificados en Base64.

- `cover`: Imagen de portada (`data:image/jpeg;base64,...`).

---

## JSON Schema (Draft 7)

Este esquema puede utilizarse para validar la integridad de cualquier archivo `.libria`.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Libria Document Schema",
  "type": "object",
  "required": ["libriaVersion", "metadata", "preferences", "chapters"],
  "properties": {
    "libriaVersion": {
      "type": "string",
      "description": "Versión del formato de archivo Libria"
    },
    "metadata": {
      "type": "object",
      "required": ["title", "author", "paperSize"],
      "properties": {
        "title": { "type": "string" },
        "subtitle": { "type": "string" },
        "author": { "type": "string" },
        "authors": { "type": "array", "items": { "type": "string" } },
        "publisher": { "type": "string" },
        "year": { "type": "integer" },
        "isbn": { "type": "string" },
        "paperSize": { "enum": ["5x8", "6x9", "A5", "A4"] }
      }
    },
    "preferences": {
      "type": "object",
      "properties": {
        "sidebar": { "enum": ["left", "right"] },
        "mode": { "enum": ["light", "dark"] },
        "bookFont": { "type": "string" },
        "fontSize": { "type": "number", "minimum": 8 },
        "lineHeight": { "type": "number" },
        "dropCap": { "type": "boolean" },
        "sceneBreakType": { "enum": ["asterisks", "dots", "flourish", "none"] }
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
          "status": { "type": "string" },
          "body": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["type"],
              "properties": {
                "type": { "type": "string" },
                "text": { "type": "string" },
                "html": { "type": "string" }
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
        "properties": {
          "id": { "type": "string" },
          "chapterId": { "type": "string" },
          "blockIndex": { "type": "integer" },
          "role": { "enum": ["author", "editor", "corrector", "publisher"] },
          "content": { "type": "string" }
        }
      }
    },
    "assets": {
      "type": "object",
      "additionalProperties": { "type": "string" }
    }
  }
}
```
