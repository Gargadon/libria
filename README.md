# Libria

**Libria** es un editor de manuscritos profesional para autores. Combina un editor de texto enriquecido con herramientas de maquetación, previsualización de páginas y exportación a formatos de publicación estándar (PDF, EPUB, DOCX).

## Funcionalidades

- **Editor de texto enriquecido** — negrita, cursiva, subrayado, citas, letra capital
- **Organización por capítulos** — preliminares, cuerpo de la obra y posliminares
- **Maquetación profesional** — márgenes, tamaño de página, tipografía, interlineado, números de página, encabezados, saltos de escena
- **Vista previa paginada** — simulación de página física con modos Kindle, iPhone e impresión
- **Exportación** — genera PDF, EPUB y DOCX con portada, tabla de contenidos y notas marginales
- **Buscar y reemplazar** — búsqueda en todo el manuscrito con fragmentos contextuales
- **Metadatos del libro** — título, subtítulo, autores, editores, editorial, ISBN, portada
- **Personalización** — avatar de usuario, ubicación de la barra lateral, corrector ortográfico
- **Autoguardado** — integración con Electron para guardar/abrir archivos `.libria` en el sistema de archivos

## Tecnologías

- **Frontend**: Angular 21, señales reactivas (@ngrx/signals)
- **Escritorio**: Electron (Chromium + Node.js)
- **Exportación**: docx (DOCX), jszip (EPUB), impresión nativa (PDF)

## Requisitos

- Node.js 18+
- npm 11+

## Desarrollo

```bash
# Instalar dependencias
npm install

# Servidor de desarrollo (Angular)
npm run dev

# Electron + Angular en modo desarrollo
npm run electron:dev
```

## Producción

```bash
# Build de Angular
npm run build

# Empaquetar para distribución
npm run electron:build
```

Los ejecutables se generan en `release/`.

## Formato de archivo

Libria utiliza el formato `.libria` (JSON) para almacenar proyectos. Incluye metadatos, preferencias de maquetación, capítulos, notas y recursos como la portada.

## Licencia

MIT
