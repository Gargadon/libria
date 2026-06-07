# Libria — Guía para Claude Code

## ¿Qué es Libria?

Libria es una aplicación de escritorio para escritura y maquetación profesional de libros. Está construida con Angular + Electron y permite a autores trabajar desde el primer borrador hasta la publicación final.

- **Versión**: 1.1.0
- **Autor**: David Kantun
- **Repositorio**: https://github.com/Gargadon/libria
- **Idioma principal de la UI**: Español (también soporta Inglés)

---

## Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Angular 21 (standalone components, sin NgModules) |
| Estado | NgRx Signals Store 21.1.0 |
| Desktop | Electron 42 |
| Build | Angular CLI 21 + Bun 1.3.14 |
| Estilos | SCSS por componente |
| Tests | Vitest 4.0.8 |
| i18n | @ngx-translate/core 17 (JSON files en `public/i18n/`) |
| Exportación | `docx`, `jszip`, `mammoth`, `html-to-image` |
| Tipografía | `hyphen` (guionado automático, 5 idiomas) |

---

## Estructura del proyecto

```
src/app/
├── components/
│   ├── editor/           # Editor contenteditable por bloques
│   ├── preview/          # Vista previa (Kindle, iPhone, Impresión)
│   ├── sidebar/          # Navegación del manuscrito + metadatos
│   ├── topbar/           # Menú principal y operaciones de archivo
│   ├── tweaks-panel/     # 40+ parámetros tipográficos
│   ├── notes/            # Notas colaborativas con hilos
│   ├── modals/           # Diálogos (acerca de, confirmar, input)
│   └── welcome/          # Pantalla de inicio
├── store/
│   └── book.store.ts     # Estado global (655 líneas, NgRx Signals)
├── services/
│   ├── file.service      # Guardar/abrir archivos .libria
│   ├── export.service    # Generación EPUB 3.0, DOCX, PDF
│   ├── import.service    # Importar DOCX y TXT
│   ├── hyphen.service    # Guionado automático por idioma
│   ├── spell-check.service # Corrector ortográfico (Electron)
│   └── personal-config.service # Preferencias del usuario (LocalStorage)
├── models/
│   └── book.models.ts    # Interfaces: Book, Chapter, Block, Note, Tweaks
└── data/                 # Datos de muestra
public/
├── i18n/
│   ├── es.json           # Traducciones en español
│   └── en.json           # Traducciones en inglés
├── fonts/                # Google Fonts (woff2 locales)
├── dictionaries/         # Patrones de guionado (.hyb): es, en-us, en-gb, fr, it
└── fonts.css             # Declaraciones de fuentes
```

---

## Modelos principales

### Book (metadatos)
```typescript
{ title, subtitle, author, authors[], editors[], publisher, year, isbn,
  paperSize: '5x8' | '6x9' | 'A5' | 'A4' | 'Letter', lang? }
```

### Chapter
```typescript
{ id, kind: 'front' | 'chapter' | 'back', title, words, readMin,
  number?, status?: 'ok' | 'draft' | 'outline' | 'front' | 'back',
  forceOddPage?, body: Block[] }
```

### Block
```typescript
{ type: string,  // 'p', 'h1', 'chapter-title', 'page-break', 'scene-break', 'blockquote', ...
  text?, html?,  // html preserva formato enriquecido
  drop? }        // letra capitular
```

### Note (notas colaborativas)
```typescript
{ id, chapterId, blockIndex,
  role: 'author' | 'editor' | 'corrector' | 'publisher',
  authorName, content, date,
  status: 'unresolved' | 'resolved' | 'not-applicable',
  replies: Reply[] }
```

### Tweaks (40+ parámetros tipográficos)
Fuentes (Spectral, Lora, EB Garamond, Crimson Pro, Inter, Montserrat), tamaños, interlineado, márgenes (mm), sangría, justificación, encabezados/pies de página, letras capitulares, separadores de escena, numeración de páginas, comillas inteligentes, guiones em/en, puntos suspensivos tipográficos.

---

## Estado global (BookStore)

**Archivo**: `src/app/store/book.store.ts`

**Shape del estado**:
```typescript
{ book, chapters, notes, activeChapterId, tweaks,
  assets,           // Imágenes embebidas (base64)
  past/future,      // Deshacer/rehacer (máx 50 snapshots)
  isDirty,
  ui: { activeNav, showStyles, sidebarOpen },
  exportPrefs: { includeCover, includeNotes, includeTOC },
  searchQuery, searchResults,
  personalConfig: { avatar, userName, previewWidth, language } }
```

**Selectores computados**: `activeChapter`, `activeNotes`, `totalWords`, `totalReadMin`, `mainChaptersCount`, `maxWords`, `pageSize`, `bookFontFamily`, `titleFontFamily`, `documentLang`, `domLang`

---

## Formato de archivo (.libria)

JSON auto-contenido con toda la información del proyecto:
```typescript
interface LibriaDocument {
  libriaVersion: string
  metadata: Book | null
  preferences: Tweaks
  session: { lastActiveChapterId: string }
  chapters: Chapter[]
  notes?: Note[]
  assets?: Record<string, string>  // imágenes en base64
}
```

---

## Scripts disponibles

```bash
bun run start          # Angular dev server (puerto 4200)
bun run electron:dev   # Dev server + Electron en paralelo
bun run build          # Build de producción
bun run electron:build # Build + empaquetado con electron-builder
bun run test           # Vitest
```

---

## Funcionalidades implementadas

- Editor por bloques con formato enriquecido (negrita, cursiva, subrayado)
- Tipos de bloque: párrafo, título de capítulo, h1, cita, separador de escena, salto de página, **imagen**
- 40+ parámetros de tipografía y maquetación con vista en tiempo real
- Exportación a EPUB 3.0, DOCX y PDF (vía CSS print)
- Notas colaborativas con hilos, roles y estados
- Búsqueda y reemplazo global con vista de contexto
- Deshacer/rehacer con historial de 50 snapshots
- Vista previa en modo Kindle, iPhone y página impresa
- Guionado automático en 5 idiomas (ES, EN-US, EN-GB, FR, IT)
- Corrección ortográfica integrada con Electron
- Guardar/abrir archivos .libria (JSON)
- Importar desde DOCX y TXT
- Interfaz bilingüe (ES/EN) con @ngx-translate
- Tema claro/oscuro
- **Modo Zen** (`F11` / botón topbar / `Esc`) — oculta topbar, sidebar y preview para escribir a pantalla completa
- **Autoguardado** silencioso cada 2 minutos si el archivo ya tiene ruta guardada
- **Inserción de imágenes** en el cuerpo del texto (base64 en `assets`, visible en editor, Kindle, iPhone y modo Papel)
- Distribución como app de escritorio (Windows, macOS, Linux)

---

## Funcionalidades faltantes o pendientes

### Alta prioridad (impacto directo en el flujo de escritura)

1. **Tablas** — Sin soporte de bloque tipo `table`. Necesario para libros técnicos o de no ficción.

2. **Listas** (ordenadas y no ordenadas) — No existe bloque `list-item` ni UL/OL en el editor. Frecuentes en ensayos y no ficción.

3. **Notas al pie / notas al final** — El modelo `Block` no tiene campo para footnotes. La exportación EPUB tampoco las genera.

4. **Revisión de ortografía visual** — El `SpellCheckService` existe pero no hay subrayado en tiempo real en el editor (solo integración de idioma con Electron).

### Media prioridad (mejoras de productividad)

1. **Gestión de portada** — `includeCover` existe en `exportPrefs` pero no hay UI para subir, recortar o generar una imagen de portada dentro de la app.

2. **Objetivos de escritura / metas diarias** — Sin sistema de metas (palabras por día, deadline de proyecto).

3. **Estadísticas de sesión** — No se registran métricas de progreso por día/sesión (palabras escritas hoy, velocidad promedio).

4. **Comparación de versiones / historial de revisiones** — El undo/redo es en memoria; no hay versionado persistente del documento.

5. **Plantillas de proyecto** — No hay plantillas preconstruidas (novela, ensayo, manual técnico) con estructura de capítulos y tweaks predefinidos.

6. **Exportación a Markdown** — Útil para publicación en plataformas web o blogs derivados del manuscrito.

7. **Exportación a HTML estático** — Para previsualización web o publicación directa.

### Baja prioridad (nice-to-have)

1. **Modo de presentación / lectura** — Un modo solo-lectura con paginación simulada dentro de la app.

2. **Backup automático en la nube** — Integración con Google Drive, Dropbox o similar para copias de seguridad.

3. **Soporte de más idiomas de guionado** — Portugués (`hyph-pt`), alemán (`hyph-de`) solo requieren agregar diccionarios .hyb.

4. **Detección automática del idioma del texto** — En lugar de configurarlo manualmente, detectar el idioma del manuscrito.

5. **Comentarios de revisión en EPUB exportado** — Las notas colaborativas no se exportan al EPUB final de manera estructurada.

6. **Atajos de teclado personalizables** — No hay sistema de keybindings configurables por el usuario.

---

## Convenciones del código

- Todos los componentes son `standalone: true` (sin NgModules)
- El estado vive exclusivamente en `BookStore` via NgRx Signals
- Los métodos de negocio van en los Services, no en los componentes
- Las traducciones se agregan a **ambos** archivos (`es.json` y `en.json`) simultáneamente
- Los estilos son SCSS por componente (`styleUrls` inline en el decorador)
- No usar `any` — TypeScript estricto habilitado
- Las operaciones de archivo siempre pasan por `FileService` (abstrae Electron vs. browser)
