# TODO — Libria: Ruta hacia un editor y maquetador completo

Estado actual: **v1.3.0** · Angular 21 + Electron 42 · Última revisión: 2026-06-09

---

## 🔴 CRÍTICO — Gaps que bloquean uso profesional

### 1. Subrayado visual del corrector ortográfico
El `SpellCheckService` existe y el panel funciona, pero el editor no muestra subrayado rojo en tiempo real bajo las palabras con error. Sin esto el corrector es inútil para el flujo normal de escritura.
- Renderizar `Misspelling[]` como decoraciones `<mark>` o `data-*` dentro del bloque `contenteditable`
- El estado `spellErrors` ya llega al bloque pero no se pinta nada visible

### ~~2. UI para imagen de portada~~ ✅ RESUELTO
La UI ya existía (upload, preview, delete en Propiedades). Se añadió un indicador de estado en el panel de Exportación: muestra thumbnail si hay portada cargada, o aviso con enlace directo a Propiedades si `includeCover` está activo pero no hay imagen.

### ~~3. EPUB: fuentes no embebidas~~ ✅ RESUELTO
Se añadió `EPUB_FONT_MAP` con los 6 archivos `.woff2` del subconjunto latino de cada fuente (Spectral, Lora, EB Garamond, Crimson Pro, Inter, Montserrat). `loadEpubFonts()` carga los binarios, los añade al ZIP bajo `OEBPS/fonts/`, genera `@font-face` en el CSS y los declara en el manifiesto OPF. El EPUB ahora incluye las fuentes elegidas en Tweaks.

### ~~4. EPUB: idioma hardcodeado~~ ✅ RESUELTO
`<dc:language>` usa `book.lang ?? 'es'` en lugar del `'es'` fijo.

### 5. UI para metas de escritura
`WritingGoals` existe en el modelo y en el estado, pero no hay ninguna sección en la interfaz para configurar palabras objetivo ni deadline. El campo `writingGoals` no tiene pantalla.
- Panel en la sección de Manuscrito o Metadatos con progreso visual (barra/porcentaje)
- Indicador de palabras escritas hoy vs. objetivo diario

---

## 🟠 IMPORTANTE — Necesario para libros no ficción y técnicos

### 6. Bloque: código (`code`)
Sin un bloque `pre`/`code` con fuente monoespaciada y fondo diferenciado, Libria no sirve para libros técnicos, de programación o cualquier manual con comandos.
- Nuevo tipo de bloque `code` en el editor, con renderizado `<pre><code>`
- Exportar como `<pre>` en EPUB/PDF y como `CodeBlock` en DOCX

### 7. Bloque: epígrafe (`epigraph`)
El epígrafe (cita con atribución al inicio de un capítulo) es uno de los elementos más comunes en novela y ensayo literario. No es igual a `blockquote`.
- Nuevo tipo `epigraph` con campo de texto principal + campo de atribución (`—Autor, Obra`)
- Estilo diferenciado: centrado, itálica, sangría, tamaño reducido

### 8. Bloque: poesía/verso (`verse`)
El bloque `p` no preserva saltos de línea deliberados. Sin un bloque `verse` es imposible incluir poemas o letras con integridad tipográfica.
- Nuevo tipo `verse`: `white-space: pre-line`, sin justificado, sin sangría
- Exportar como `<div style="white-space:pre-line">` en EPUB

### 9. Bloques de encabezado h2 y h3
Solo existe `h1` como nivel de sección. Los libros de no ficción, manuales y ensayos necesitan jerarquía de hasta 3 niveles.
- Agregar tipos `h2` y `h3` en el editor y en el selector de bloque
- Estilos diferenciados (tamaños decrecientes basados en `titleFontSize`)
- Exportar correctamente como `<h3>/<h4>` en EPUB y `Heading2/3` en DOCX

### 10. Notas al pie reales en DOCX
Actualmente las notas al pie se exportan como sección "Notas" al final del capítulo en el DOCX. Microsoft Word tiene su propio sistema de footnotes en el `<w:footnotes>` del XML, que es lo que usan editores y correctores profesionales.
- Usar el soporte de `docx` library para footnotes reales (`FootnoteReferenceRun`)
- Las notas al pie del EPUB ya funcionan correctamente

---

## 🟡 PRODUCTIVIDAD — Mejoras que hacen la diferencia en uso diario

### 11. Marcadores inline de notas al pie en el editor
Cuando existe una nota al pie referenciada (`data-fn="id"`), el editor no muestra el número superíndice al lado del texto. El autor no puede ver visualmente dónde están sus referencias sin exportar.
- Renderizar `<sup class="fn-ref">N</sup>` en el editor basado en el orden de footnotes del capítulo
- Al hacer clic en el superíndice, enfocar/abrir el panel de notas al pie

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
Un elemento decorativo entre el número de capítulo y el título (fleuron, viñeta, línea ornamental) es una marca de calidad editorial visible. El tipo `sceneBreakType` podría extenderse aquí.
- Opciones: ninguno, línea, fleuron SVG, asterisco decorativo
- Visible en editor + todos los modos de exportación

### 18. Pares tipográficos predefinidos
Elegir `bookFont` y `titleFont` por separado requiere criterio tipográfico. La mayoría de autores no saben qué funciona junto.
- 5-8 presets de combinación (ej. "Clásico: EB Garamond / Spectral", "Moderno: Inter / Montserrat")
- Un clic aplica ambas fuentes + ajustes de tamaño coherentes

### 19. Drag-and-drop para reordenar capítulos
El botón de subir/bajar capítulo existe pero en proyectos de 30+ capítulos es tedioso. La reordenación visual por arrastre es el estándar de cualquier herramienta de escritura.
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

### 24. Verificación básica del EPUB generado
El EPUB puede ser inválido sin que el usuario lo sepa (namespace faltante, caracteres ilegales en XML, etc.).
- Validación mínima post-generación: estructura ZIP, bien formado XML, `mimetype` sin compresión
- Advertencia no bloqueante si algo falla

---

## Estado de las funcionalidades ya documentadas en CLAUDE.md

| Funcionalidad | Estado real (jun 2026) |
|---|---|
| Tablas en editor | ✅ Completo (UI + row/col controls + export) |
| Listas ordenadas/no ordenadas | ✅ Completo (UI + export) |
| Notas al pie | ✅ Modelo + export EPUB/PDF/DOCX (como apéndice); ⚠️ sin superíndice visible en editor |
| Corrector ortográfico visual | ⚠️ Panel existe, underlines en editor no implementados |
| Portada en exportación | ⚠️ Export funciona si `assets['cover']` existe; sin UI dedicada |
| Metas de escritura | ⚠️ Modelo existe, sin UI |
| Estadísticas de sesión | ❌ No implementado |
| Comparación de versiones | ❌ Solo undo/redo en memoria |
| Plantillas de proyecto | ❌ No implementado |
| Exportación Markdown | ❌ No implementado |
| Exportación HTML estático | ❌ No implementado |
| Modo presentación/lectura | ❌ No implementado |
| EPUB con fuentes embebidas | ❌ Usa `font-family: serif` genérico |
