# Libria

![Libria Banner](libria-banner.webp)

**Libria** es un entorno de escritura profesional diseñado para autores que buscan el control total sobre su obra, desde el primer borrador hasta la maquetación final. Reúne en una única aplicación de escritorio las herramientas de edición, diseño tipográfico, revisión editorial y exportación que normalmente requieren múltiples plataformas.

---

## ✨ Características Principales

### ✍️ Edición por Bloques y Organización

Libria abandona el concepto de "página en blanco" tradicional por un sistema de **edición basado en bloques** (contenteditable), permitiendo una estructura semántica clara:

- **Secciones especializadas:** Preliminares, cuerpo de la obra y posliminares.
- **Estados de capítulo:** Control visual del progreso (Borrador, Esquema, Listo).
- **Métricas en tiempo real:** Recuento de palabras y tiempo de lectura estimado por capítulo y total.
- **Bloques enriquecidos:** Saltos de escena, saltos de página, citas y títulos decorativos.

### 🎨 Maquetación Tipográfica de Alto Nivel

Un panel de control con más de **40 parámetros ajustables** para ver cómo quedará tu libro mientras lo escribes:

- **Tipografía seleccionada:** Spectral, Lora, EB Garamond, Crimson Pro, Inter y Montserrat.
- **Control absoluto:** Márgenes internos/externos, interlineado, espaciado de párrafos, sangrías y justificación.
- **Detalles "Pro":** Letras capitulares (drop caps), guionización automática (hyphenation) y decoraciones de escena personalizables.
- **Paginación Dinámica:** Previsualiza tu obra en formatos estándar (5x8, 6x9, A5, A4) o simulando dispositivos como Kindle o iPhone.

### 🤝 Flujo Editorial y Revisión

Diseñado para el trabajo colaborativo entre autores y editores:

- **Notas Marginales:** Comenta fragmentos específicos del texto.
- **Roles Definidos:** Autor, Editor, Corrector y Editorial.
- **Hilos de Conversación:** Respuestas anidadas para discutir cambios estilísticos o estructurales.
- **Control de Estado:** Marca notas como resueltas o no aplicables.

### 📦 Exportación Lista para Publicar

Genera archivos finales sin necesidad de herramientas externas:

- **EPUB 3.0:** Estándar de la industria para distribución digital.
- **DOCX:** Compatible con editores tradicionales, incluyendo metadatos y notas.
- **PDF:** Formato de impresión nativo con maquetación y estilos aplicados.

---

## 🛠️ Especificaciones Técnicas

Libria está construida con las tecnologías más modernas para garantizar fluidez y seguridad:

| Componente | Tecnología |
| :--- | :--- |
| **Framework** | [Angular 21](https://angular.dev/) |
| **Gestión de Estado** | [NgRx Signals Store](https://ngrx.io/guide/signals) |
| **Entorno de Escritorio** | [Electron 42](https://www.electronjs.org/) |
| **Persistencia** | Formato Open-Source `.libria` (JSON) |
| **Testing** | [Vitest](https://vitest.dev/) |
| **Estilos** | SCSS (Sass) |
| **Lenguaje** | TypeScript 5.9 (Modo Estricto) |

---

## 🚀 Para Desarrolladores

### Requisitos Previos

- **Node.js**: 18.0 o superior
- **npm**: 11.0 o superior

### Instalación y Ejecución

```bash
# 1. Clonar el repositorio
git clone https://github.com/gargadon/libria.git

# 2. Instalar dependencias
npm install

# 3. Iniciar en modo desarrollo (Angular + Electron)
npm run electron:dev

# 4. Construir para producción
npm run electron:build
```

### Arquitectura de Datos

El estado de la aplicación se gestiona mediante un **Signals Store** altamente optimizado que incluye:

- **Historial de Deshacer/Rehacer:** Hasta 50 snapshots de seguridad.
- **Búsqueda Global:** Motor de búsqueda indexado que muestra contexto antes y después de cada coincidencia.
- **Sistema de Activos:** Portada y otros recursos embebidos directamente en el archivo `.libria`.
- **Especificación del Formato:** Consulta [FORMATO_LIBRIA.md](FORMATO_LIBRIA.md) para ver el esquema detallado y el JSON Schema oficial.

---

## 📄 Licencia

Este proyecto está bajo la Licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más detalles.

---
