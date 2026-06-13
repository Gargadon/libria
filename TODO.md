# TODO — Libria: Ruta hacia un editor y maquetador completo

Estado actual: **v1.5.0 "May Alcott"** · Angular 21 + Electron 42 · Última revisión: 2026-06-13

---

## 🔴 CRÍTICO — Gaps que bloquean uso profesional

### ~~1. Subrayado visual del corrector ortográfico~~ ✅ RESUELTO
La infraestructura completa está implementada y funcional:
- `SpellCheckService` con nspell + diccionarios Hunspell (es, en, fr, it, pt) ✔️
- `ContenteditableDirective` con `updateSpellUnderlines()` y `wrapRange()` para envolver errores en `<span class="spell-err">` ✔️
- CSS `.spell-err` con subrayado ondulado rojo (claro/oscuro) ✔️
- `runSpellCheck()` con debounce de 1500ms tras cada entrada ✔️
- `stripSpellErrors()` elimina marcadores al guardar para evitar persistencia en el modelo ✔️
- Panel de navegación de errores con anterior/siguiente/ignorar/reemplazar ✔️
- **Fix aplicado**: Normalización de `currentText` en la directiva para que coincida con el `innerText` usado por el corrector (evita desfase de posiciones con `<br>`) ✔️
- **Fix aplicado**: `lang.toLowerCase()` en `loadDictionary()` para soportar variantes como `es-MX`, `pt-BR` ✔️

### ~~2. UI para imagen de portada~~ ✅ RESUELTO
La UI ya existía (upload, preview, delete en Propiedades). Se añadió un indicador de estado en el panel de Exportación: muestra thumbnail si hay portada cargada, o aviso con enlace directo a Propiedades si `includeCover` está activo pero no hay imagen.

### ~~3. EPUB: fuentes no embebidas~~ ✅ RESUELTO
Se añadió `EPUB_FONT_MAP` con los 6 archivos `.woff2` del subconjunto latino de cada fuente. `loadEpubFonts()` carga los binarios, los añade al ZIP bajo `OEBPS/fonts/`, genera `@font-face` en el CSS y los declara en el manifiesto OPF.

### ~~4. EPUB: idioma hardcodeado~~ ✅ RESUELTO
`<dc:language>` usa `book.lang ?? 'es'` en lugar del `'es'` fijo.

### ~~5. UI para metas de escritura~~ ✅ RESUELTO
UI completa implementada en la vista de Manuscrito:
- Barra de progreso con porcentaje (`wordsProgress()`) y conteo actual/objetivo ✔️
- Indicador de días restantes hasta deadline con advertencia a ≤7 días ✔️
- Editor inline en el pie del sidebar: meta de palabras + fecha límite ✔️
- Persistencia en archivo `.libria` via `LibriaDocument.writingGoals` ✔️
- Traducciones en los 6 idiomas (es, en, fr, it, de, pt) ✔️

---

## 🟠 IMPORTANTE — Necesario para libros no ficción y técnicos

### ~~6. Bloque: código (`code`)~~ ✅ RESUELTO
Implementado en toda la pipeline. Monoespaciado, fondo gris, `white-space: pre-wrap`.
- Nuevo tipo de bloque `code` con renderizado `<pre><code>` en editor y preview
- Exporta como `<pre class="kp-code">` en EPUB/PDF y Paragraph con `shading` en DOCX
- Estilos SCSS en editor, preview (device), export CSS (EPUB y print)

### ~~7. Bloque: epígrafe (`epigraph`)~~ ✅ RESUELTO
Cita con atribución editable, con campo `Block.attribution` en el modelo.
- Nuevo tipo `epigraph` con bloquequote + cite atribución
- Editor con dos contenteditable: cita y atribución
- Export a EPUB, PDF y DOCX con formato centrado e itálica

### ~~8. Bloque: poesía/verso (`verse`)~~ ✅ RESUELTO
`white-space: pre-line`, sin justificado ni sangría.
- Editor con `<pre class="bk-verse"><code contenteditable>`
- Export a EPUB/PDF como `<pre class="kp-verse">` y DOCX como Paragraph con font mono

### ~~9. Bloques de encabezado h2 y h3~~ ✅ RESUELTO
Jerarquía de secciones completa hasta 3 niveles.
- Selector de bloque con opciones `h2` / `h3`
- Tamaños escalados: h1=100%, h2=85%, h3=72% de `titleFontSize`
- Export correcto: `<h3>`/`<h4>` en EPUB, `<h3/h4>` en PDF, Paragraph con `titleFont` en DOCX

### ~~10. Notas al pie reales en DOCX~~ ✅ RESUELTO
Reemplaza el apéndice "Notas" al final del capítulo por footnotes OpenXML reales.
- `FootnoteReferenceRun` inline en párrafos que contienen `<sup data-fn="...">`
- `doc.FootNotes.View.createFootNote()` para definiciones al pie
- Fallback silencioso si la API no está disponible

---

## 🟡 PRODUCTIVIDAD — Mejoras que hacen la diferencia en uso diario

### ~~11. Marcadores inline de notas al pie en el editor~~ ✅ RESUELTO
- Efecto `_footnoteWatch` sincroniza `<sup class="fn-ref" data-fn="...">[N]</sup>` en el HTML de cada bloque automáticamente
- Click en el marcador → scroll al panel de notas al pie
- Estilo `.fn-ref` con color de acento y cursor pointer

### 12. Plantillas de proyecto
No hay forma de empezar con estructura prearmada. El autor tiene que crear todos los capítulos manualmente cada vez.
- Plantillas: Novela, Ensayo, No ficción/manual, Antología, Poemario
- Cada plantilla incluye capítulos front matter típicos (portadilla, créditos, dedicatoria, índice) + estructura de capítulos

### 13. Historial de escritura por sesión
No se registra cuántas palabras escribió el usuario hoy ni en días anteriores. Sin métricas el objetivo de escritura es decorativo.
- Guardar en `personalConfig` (LocalStorage) un array de `{ date, words }` por proyecto
- Mostrar gráfico sencillo de los últimos 7/30 días en el panel de metas

### 14. Exportación a Markdown
Útil para autores que también publican en blogs, GitHub, o usan Obsidian/Notion para distribuir borradores.
- `ExportService.exportMarkdown()`: convertir bloques a sintaxis Markdown
- Soportar: párrafos, headings, listas, tablas, imágenes (como referencia), citas, separadores

### 15. Exportación a HTML estático
Para previsualización web o publicación directa. El CSS de impresión ya existe (`buildPrintHtml`), se puede reutilizar con adaptaciones para pantalla.
- Botón "Exportar HTML" en el panel de exportación
- Usar `buildPrintHtml` con `fontsHref=undefined` y ajustes responsive

### 16. Encabezados alternados (recto/verso)
Las editoriales profesionales usan encabezados diferentes en páginas pares e impares: autor en la izquierda, título del capítulo en la derecha. Actualmente solo hay un encabezado genérico.
- Agregar `Tweaks.headerRecto` y `Tweaks.headerVerso` o modo automático autor/capítulo
- Aplicar en el export PDF con los templates `headerTemplate` de Electron

---

## 🟢 NICE TO HAVE — Pulido y diferenciación

### 17. Ornamentos de capítulo
Un elemento decorativo entre el número de capítulo y el título (fleuron, viñeta, línea ornamental) es una marca de calidad editorial visible.
- Opciones: ninguno, línea, fleuron SVG, asterisco decorativo
- Visible en editor + todos los modos de exportación

### 18. Pares tipográficos predefinidos
Elegir `bookFont` y `titleFont` por separado requiere criterio tipográfico. La mayoría de autores no saben qué funciona junto.
- 5-8 presets de combinación (ej. "Clásico: EB Garamond / Spectral", "Moderno: Inter / Montserrat")
- Un clic aplica ambas fuentes + ajustes de tamaño coherentes

### 19. Drag-and-drop para reordenar capítulos
El botón de subir/bajar capítulo existe pero en proyectos de 30+ capítulos es tedioso.
- CDK DragDrop en el sidebar para capítulos del mismo `kind`
- Animación suave, persistencia inmediata al soltar

### 20. Panel de atajos de teclado
No hay ninguna referencia visual de los shortcuts disponibles. El usuario no puede descubrirlos sin leer el código.
- Modal `?` o sección en ajustes con tabla de atajos actuales
- Detectar plataforma (Ctrl vs ⌘) para macOS

### 21. Portada generada automáticamente
Para autores que no tienen diseñador, una portada tipográfica sencilla (fondo de color, título centrado, nombre del autor) les permite exportar un EPUB presentable.
- Generador básico con fondo de color sólido + tipografía del libro
- Sin imágenes externas, solo CSS/Canvas → PNG → `assets['cover']`

### 22. Bloque callout / recuadro destacado
Cajas de "Nota", "Atención", "Tip", "Ejemplo" son esenciales en libros técnicos y de autoayuda.
- Nuevo tipo `callout` con subtipo (info/warning/tip/example)
- Borde lateral coloreado, icono opcional, fondo suave
- Exportar como `<aside>` en EPUB con clase CSS

### 23. Color del texto en encabezados
Actualmente los títulos son siempre negros. Una sola opción de color de acento para encabezados (color de la editorial o del género) elevaría la calidad visual.
- Campo `Tweaks.titleColor` (hex)
- Aplicable en editor y en todos los exports

### ~~24. Verificación básica del EPUB generado~~ ✅ RESUELTO
~~El EPUB puede ser inválido sin que el usuario lo sepa (namespace faltante, caracteres ilegales en XML, etc.).~~
Se implementó saneo completo de la salida XML:
- `escapeHtml` en todos los metadatos del OPF (evita `&` sin escapar) ✔️
- `xhtmlSafe()` para contenido de capítulos: `<br>` → `<br/>`, `&nbsp;` → `&#160;` ✔️
- `<head>` con `<title>` en todos los XHTML (nav, cover, chapters) ✔️
- `font/woff2` como media-type correcto ✔️
- Rutas de fuentes relativas correctas desde `OEBPS/styles.css` ✔️

---

## Estado de las funcionalidades ya documentadas en CLAUDE.md

| Funcionalidad | Estado real (jun 2026) |
|---|---|---|
| Tablas en editor | ✅ Completo (UI + row/col controls + export) |
| Listas ordenadas/no ordenadas | ✅ Completo (UI + export) |
| Notas al pie | ✅ Modelo + export EPUB/PDF/DOCX (footnotes reales en DOCX) + superíndices visibles en editor |
| Corrector ortográfico visual | ✅ Completo (directiva con underlines, panel de navegación, diccionarios Hunspell) |
| Portada en exportación | ✅ Export funciona si `assets['cover']` existe; con UI de upload/preview/delete |
| Metas de escritura | ✅ Completo (barra de progreso, deadline, editor inline, persistencia) |
| Bloques h2/h3 | ✅ Completo (selector, editor, preview, EPUB, PDF, DOCX) |
| Bloque code | ✅ Completo (`<pre><code>`, monoespaciado, fondo, todos los exports) |
| Bloque epigraph | ✅ Completo (cita + atribución, todos los exports) |
| Bloque verse | ✅ Completo (pre-line, mono en exports, todos los formatos) |
| Estadísticas de sesión | ❌ No implementado |
| Comparación de versiones | ❌ Solo undo/redo en memoria |
| Plantillas de proyecto | ❌ No implementado |
| Exportación Markdown | ❌ No implementado |
| Exportación HTML estático | ❌ No implementado |
| Modo presentación/lectura | ❌ No implementado |
| EPUB con fuentes embebidas | ✅ `EPUB_FONT_MAP` con 6 fuentes, carga y manifiesto completos |
| EPUB sintaxis válida | ✅ Saneo XML completo, pasa epubcheck sin errores |
| EPUB imágenes embebidas | ✅ Como archivos individuales en `OEBPS/images/`, no base64 inline |
