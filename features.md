# Features y mejoras de Libria

Análisis del código realizado el 13 de octubre de 2026. Las prioridades reflejan impacto en la confianza del autor y en el flujo editorial.

## Críticas

- [x] **Recuperación automática y versiones persistentes.** Proteger documentos sin ruta, conservar copias rotativas y permitir restaurar libros o capítulos sin sobrescribir el original.
- [x] **Importación DOCX fiel.** Conservar negritas, cursivas, enlaces, listas, tablas, imágenes y notas al pie. Informar de elementos que no se pudieron convertir.

## Alta prioridad

- [ ] **Anclajes estables para comentarios y notas.** Sustituir las referencias basadas exclusivamente en índices por identificadores estables; mantenerlas al dividir, fusionar y eliminar bloques.
- [ ] **Informe de exportación.** Advertir de contenido omitido, fuentes ausentes y errores; evitar pérdidas silenciosas, especialmente en notas al pie DOCX.
- [ ] **Deshacer coherente.** Incluir las operaciones relevantes de fichas, metadatos y diseño; armonizar el límite real del historial con la documentación.
- [ ] **Control de cambios editorial.** Registrar inserciones y eliminaciones con autor; aceptar o rechazar cambios por fragmento y capítulo.
- [ ] **Comparador de versiones.** Mostrar diferencias por capítulo y recuperar contenido de ambas versiones en conflictos de Drive.
- [ ] **Preparación para publicación.** Revisar comentarios pendientes, borradores, imágenes faltantes, notas huérfanas, metadatos y advertencias de exportación, con navegación al problema.

## Prioridad media

- [ ] **Accesibilidad.** Texto alternativo para imágenes, navegación por teclado y gestión del foco.
- [ ] **Organización por escenas.** Sinopsis, punto de vista, personajes, lugar, fecha narrativa y estado; complementar las fichas libres.
- [ ] **Historial real de escritura.** Registrar palabras añadidas/eliminadas, sesiones y cumplimiento diario; distinguir la actividad de la meta total del manuscrito.
- [ ] **Revisión de estilo configurable.** Repeticiones, espacios duplicados, comillas/rayas inconsistentes, variantes de nombres y párrafos largos; permitir ignorar reglas.

## Base técnica

- [x] Separar responsabilidades de editor, sidebar y exportación.
- [ ] Añadir pruebas de flujos completos con manuscritos de referencia: importar, editar, guardar, reabrir y exportar conservando texto, imágenes y notas.
- [ ] Evaluar rendimiento con manuscritos largos e imágenes abundantes antes de ampliar funciones.
- [ ] Implementar el cargador y gestor de plugins después de consolidar recuperación y fidelidad de archivos.

## Orden recomendado

Recuperación y anclajes → fidelidad DOCX e informes → revisión y comparación → organización narrativa → plugins.

## Implementación de las críticas

- Recuperación en IndexedDB, independiente de archivos y Drive, incluso para libros sin ruta. Copias cada 5 segundos con cambios y puntos históricos cada 2 minutos; hasta 10 versiones por sesión, 50 totales y aproximadamente 200 MB. Restauración como copia o incorporación de un capítulo con imágenes y comentarios. Los fallos de almacenamiento se muestran y bloquean la sustitución de trabajo no respaldado.
- Importación DOCX con la versión de navegador de Mammoth: formato enriquecido, enlaces seguros, encabezados, listas, tablas, imágenes compatibles y notas al pie nativas. Avisos visibles para conversiones incompletas. Las imágenes de tablas/listas se colocan después del bloque; no se reproduce la paginación exacta de Word.
- Validación: 74 pruebas Angular aprobadas, incluyendo un archivo DOCX real y pruebas de recuperación, separación de sesiones, conservación de recursos y fallos de almacenamiento. Compilación de producción completada; quedan avisos de optimización CommonJS en dependencias.

## Separación de responsabilidades

- Editor: plantilla externa; módulos de selección/cursor, tablas, imágenes, notas al pie y comentarios con ciclo de vida ligado al editor.
- Sidebar: ocho paneles con plantillas independientes; estados locales de formularios conservados al navegar y fuentes compartidas entre estilos y maquetación.
- Exportación: servicios por formato (EPUB, DOCX, ODT y PDF), renderizador DOCX, composición de impresión, fuentes EPUB y entrega de archivos separados. La previsualización usa directamente el compositor HTML.
- Validación: 95 pruebas aprobadas; selección entre párrafos verificada con eventos nativos y captura del resaltado en WebKitGTK (CachyOS), referencias de exportación capturadas antes del refactor, navegación entre paneles y ediciones pendientes de tablas. Compilación de producción completada con los avisos CommonJS de las dependencias.
- Detalles y límites: [organización de los módulos](docs/architecture.md).
