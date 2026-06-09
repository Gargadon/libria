[![Release](https://github.com/Gargadon/libria/actions/workflows/release.yml/badge.svg)](https://github.com/Gargadon/libria/actions/workflows/release.yml)

# Libria — Shelley Edition

![Libria Banner](libria-banner.webp)

**Libria** es un entorno de escritura profesional diseñado para autores que buscan el control total sobre su obra, desde el primer borrador hasta la maquetación final. Reúne en una única aplicación de escritorio las herramientas de edición, diseño tipográfico, revisión editorial y exportación que normalmente requieren múltiples plataformas.

---

## Características Principales

### Edición por Bloques y Organización

Libria abandona el concepto de "página en blanco" tradicional por un sistema de **edición basada en bloques** (contenteditable), permitiendo una estructura semántica clara:

- **Secciones especializadas:** Preliminares (`halftitle`, `title`, `subtitle`, `author`, `publisher`, `dedication`, `chapter-num`), cuerpo de la obra y posliminares.
- **Estados de capítulo:** Control visual del progreso (Borrador, Esquema, Listo) con indicadores de color.
- **Métricas en tiempo real:** Recuento de palabras y tiempo de lectura estimado por capítulo y total.
- **Bloques enriquecidos:** Párrafos, títulos, citas, saltos de escena, saltos de página, imágenes y más.
- **Imágenes:** Inserción desde el portapapeles (Ctrl+V), desde el panel de attachments o cargando archivos. Rotación (90°, 180°, 270°), volteo horizontal y vertical, con ajuste automático de orientación EXIF. Las transformaciones se reflejan en todas las previsualizaciones (Kindle, iPhone y Papel).
- **Reordenación de capítulos:** Botones de subir/bajar en el panel lateral para reposicionar capítulos dentro de su sección (preliminares, cuerpo, posliminares).
- **Formato de texto:** Negrita, cursiva, subrayado, tachado, superíndice y subíndice.
- **Búsqueda y reemplazo global:** Vista de contexto con coincidencias resaltadas.

### Maquetación Tipográfica de Alto Nivel

Un panel de control con más de **40 parámetros ajustables** para ver cómo quedará tu libro mientras lo escribes:

- **Tipografía:** Spectral, Lora, EB Garamond, Crimson Pro, Inter, Montserrat — y cualquier fuente instalada en tu sistema (con campos personalizados para fuente del libro y de títulos).
- **Control absoluto:** Márgenes (interior/exterior/superior/inferior), interlineado, espaciado de párrafos, sangrías, justificación y alineación.
- **Detalles profesionales:** Letras capitulares (drop caps), guionización automática en 5 idiomas, **comillas inteligentes**, **guiones em/en**, **puntos suspensivos tipográficos** y **signos de apertura inteligentes**.
- **Encabezados y pies:** Texto personalizado, numeración de página con posición configurable.
- **Paginación dinámica:** Previsualiza en formatos estándar (5×8, 6×9, A5, A4, A6, Carta) o simulando dispositivos Kindle o iPhone.

### Revisión Ortográfica Integrada

Corrector ortográfico completo sin depender del sistema operativo:

- **Panel de revisión:** Navegación error por error con contexto, sugerencias y acciones (Ignorar, Ignorar todo, Añadir al diccionario). Acceso vía `F7` o botón en la barra de herramientas.
- **Subrayado en tiempo real:** Los errores ortográficos se subrayan en rojo directamente en el editor mientras escribes, sin perder el cursor ni el formato.
- **Diccionarios Hunspell:** Soporte para español, inglés, francés e italiano con más de 500 KB–1.3 MB de léxico por idioma.

### Notas al Pie

Sistema completo de notas al pie para libros técnicos y de no ficción:

- **Inserción inline:** Referencias numéricas en el texto con contenido expandible.
- **Exportación:** Panel de notas al pie generado automáticamente en EPUB.
- **Ordenación:** Notas ordenadas por posición dentro del capítulo.

### Flujo Editorial y Revisión

Diseñado para el trabajo colaborativo entre autores y editores:

- **Notas marginales:** Comenta fragmentos específicos del texto con hilos de discusión.
- **Roles definidos:** Autor, Editor, Corrector y Editorial.
- **Hilos de conversación:** Respuestas anidadas para discutir cambios estilísticos o estructurales.
- **Control de estado:** Marca notas como resueltas o no aplicables.

### Experiencia de Escritura

- **Modo Zen:** Ocultación total de la interfaz (topbar, sidebar y previsualización) para escribir sin distracciones. Acceso vía `F11` o botón en la barra.
- **Tema claro/oscuro:** Alterna entre ambos modos con persistencia en preferencias personales. El tema oscuro no afecta la previsualización de dispositivos físicos.
- **Autoguardado:** Guardado silencioso automático cada 2 minutos si el archivo ya tiene ruta.
- **Objetivos de escritura:** Metas diarias de palabras con barra de progreso y seguimiento visual.
- **Previsualización ocultable:** Alterna la visibilidad del panel de previsualización con `Ctrl+Shift+P` para maximizar el espacio de escritura.

### Importación y Exportación

- **Importar:** Desde DOCX (con formato) y TXT (texto plano).
- **Exportación EPUB 3.0:** Estándar de la industria para distribución digital, con portada, TOC, tipografía embebida y soporte completo de listas, tablas y notas al pie.
- **Exportación DOCX:** Todos los tipos de bloque, formato enriquecido (negrita, cursiva, imágenes), tweaks tipográficos aplicados, portada y TOC opcionales.
- **Exportación PDF:** Formato de impresión nativo vía CSS print con maquetación y estilos aplicados.
- **Formato abierto `.libria`:** Archivo JSON autocontenido con metadatos, preferencias, capítulos, notas, imágenes y objetivos de escritura.

### Internacionalización

Interfaz disponible en **español, inglés, francés e italiano** — conmutación en vivo desde el panel lateral.

---

## Especificaciones Técnicas

Libria está construida con las tecnologías más modernas para garantizar fluidez y seguridad:

| Componente | Tecnología |
| :--- | :--- |
| **Framework** | [Angular 21](https://angular.dev/) (standalone components) |
| **Gestión de Estado** | [NgRx Signals Store](https://ngrx.io/guide/signals) |
| **Entorno de Escritorio** | [Electron 42](https://www.electronjs.org/) |
| **Persistencia** | Formato abierto `.libria` (JSON autocontenido) |
| **Testing** | [Vitest](https://vitest.dev/) |
| **Estilos** | SCSS (Sass) por componente |
| **Lenguaje** | TypeScript 5.9 (Modo Estricto) |
| **Runtime** | [Bun](https://bun.sh/) 1.3.14 |
| **Corrector ortográfico** | [nspell](https://github.com/wooorm/nspell) + diccionarios Hunspell |
| **Dependencias clave** | `docx` (generación DOCX), `jszip` (EPUB), `hyphen` (guionado), `mammoth` (importación DOCX) |

### Arquitectura de Datos

El estado de la aplicación se gestiona mediante un **Signals Store** altamente optimizado que incluye:

- **Historial de Deshacer/Rehacer:** Hasta 50 snapshots de seguridad.
- **Búsqueda Global:** Motor de búsqueda indexado con contexto de coincidencias.
- **Sistema de Activos:** Panel de attachments para gestionar imágenes embebidas (insertar, eliminar) directamente en el archivo `.libria`.
- **Preferencias de usuario:** Persistencia de configuración (idioma, avatar, nombre, ancho de previsualización) en LocalStorage.

---

## Para Desarrolladores

### Requisitos Previos

- **Node.js**: 18.0 o superior
- **Bun**: 1.3.14 o superior

### Instalación y Ejecución

```bash
# 1. Clonar el repositorio
git clone https://github.com/gargadon/libria.git

# 2. Instalar dependencias
bun install

# 3. Iniciar servidor de desarrollo
bun run start          # http://localhost:4300

# 4. Iniciar con Electron
bun run electron:dev   # Servidor + Electron en paralelo

# 5. Construir para producción
bun run build

# 6. Empaquetar para distribución
bun run electron:build
```

### Scripts Disponibles

| Script | Descripción |
| :--- | :--- |
| `bun run start` | Servidor de desarrollo Angular (puerto 4300) |
| `bun run dev` | Alias de `start` |
| `bun run build` | Build de producción |
| `bun run test` | Ejecutar tests con Vitest |
| `bun run electron:dev` | Servidor dev + Electron en paralelo |
| `bun run electron:build` | Build + empaquetado con electron-builder |

---

## Apoya el Proyecto

Libria es un proyecto independiente desarrollado en mi tiempo libre. Si te es útil, considera apoyar su continuidad:

| Método | Link |
| :--- | :--- |
| **GitHub Sponsors** | [Sponsor](https://github.com/sponsors/Gargadon) — 0% comisión, matching disponible |
| **PayPal** | [Donar](https://paypal.me/gargadon) |
| **Ko-fi** | [Invitarme un café](https://ko-fi.com/gargadon) |
| **Crypto** | BTC: `bc1qc8yqp6ph6gwlq83a6ytjvn90qaju8huzlgh4vacfq8j6nwmav7fsl7466e` |
| | ETH/USDT (ERC-20): `0x4093Bc150bD32DF2ba4910901A8F320FC3Ce8568` |
| | XRP (Ripple, tag `98270488`): `rLSn6Z3T8uCxbcd1oxwfGQN1Fdn5CyGujK` |

Cada aportación, por pequeña que sea, ayuda a mantener el proyecto vivo. ¡Gracias!

---

## Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---

