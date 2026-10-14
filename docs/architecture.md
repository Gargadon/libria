# Organización del editor, sidebar y exportación

Esta separación mantiene los flujos existentes y evita concentrar operaciones de dominios distintos en un componente o servicio.

## Editor

`src/app/components/editor/editor.component.ts` coordina la entrada de texto, el teclado, el foco y la edición entre bloques. Su plantilla está en `editor.component.html`.

| Módulo | Responsabilidad |
| --- | --- |
| `editor-dom.ts` | Selección, límites entre título/cuerpo y posición del cursor; funciones sin dependencias de Angular o del documento. |
| `tables.service.ts` | Operaciones de filas/columnas, sincronización de HTML y cancelación de entradas pendientes. |
| `images.service.ts` | Lectura, inserción desde archivo/portapapeles, cambio de tamaño, rotación y volteo. |
| `footnotes.service.ts` | Inserción, referencias y edición de notas al pie. |
| `notes.state.ts` | Estado de comentarios y conversaciones editoriales. |

En WebKitGTK, la selección entre distintos bloques `contenteditable` requiere una superficie editable común y enfocada mientras el rango sigue activo. `setEditorSelection` mantiene esa superficie para que coincidan el rango y el resaltado nativo. Se restaura la edición por bloque al consumir o colapsar la selección, al hacer clic fuera o al destruir el editor; un fallo al asignar el rango también la restaura. El editor controla el gesto desde `mousedown` hasta `mouseup`, sin una actualización final pendiente de un frame. La escritura, el pegado y la composición sobre una selección compartida se dirigen a las operaciones de bloques del store.

Los servicios y el estado se proporcionan en el componente editor. Las tareas pendientes y los efectos comparten su ciclo de vida; no deben conservar referencias al editor anterior al cambiar de documento.

## Sidebar

`sidebar.component.ts` conserva la organización del manuscrito, las fichas creativas y sus diálogos. El resto de vistas está separado en `src/app/components/sidebar/panels/`, cada una con su propia plantilla:

- Estilos y temas.
- Maquetación.
- Metadatos y portada.
- Exportación y selección de capítulos.
- Búsqueda.
- Archivos adjuntos.
- Preferencias y diccionario.
- Productividad.

Los formularios con estado local (estilos, metadatos y preferencias) usan estados proporcionados por el sidebar. Así, cambiar de panel no elimina un borrador. Una instancia nueva del sidebar recibe estados nuevos. `SidebarFontsState` comparte la enumeración de fuentes entre estilos y maquetación y evita cargarla dos veces. Los paneles sin borradores locales leen directamente los servicios y el store.

Los hosts de los paneles usan `display: contents` para conservar la distribución de los elementos dentro del sidebar y reutilizar sus estilos globales.

## Exportación

`src/app/services/export.service.ts` mantiene el punto de entrada público usado por la interfaz. Delega en los servicios de `src/app/services/export/`:

| Módulo | Responsabilidad |
| --- | --- |
| `epub-export.service.ts` | Paquete EPUB, metadatos, navegación y capítulos XHTML. |
| `epub-font.service.ts` | Inclusión de fuentes integradas y del sistema en EPUB. |
| `docx-export.service.ts` | Documento DOCX, secciones, estilos y bloques. |
| `docx-block-renderer.ts` | Conversión de contenido enriquecido y referencias a objetos DOCX. |
| `odt-export.service.ts` | Paquete ODT y XML del documento. |
| `pdf-export.service.ts` | Opciones y ejecución del motor PDF nativo. |
| `print-html.service.ts` | Composición HTML/CSS compartida por PDF y previsualización; no guarda archivos. |
| `export-file.service.ts` | Entrega del archivo al escritorio o descarga en el navegador. |
| `export-utils.ts` | Selección de capítulos y conversiones comunes sin estado. |

La previsualización usa directamente `PrintHtmlService`. Las dependencias pesadas de formatos mantienen su carga dinámica. El refactor no modifica el formato `.libria` ni los contratos nativos.

## Verificación

```bash
bun run test -- --watch=false
bun run build
```

`export.service.spec.ts` compara la composición de impresión y el contenido de los paquetes EPUB, DOCX y ODT con referencias tomadas antes de la separación. Solo normaliza los identificadores internos de relaciones de DOCX, que pueden variar entre ejecuciones. Incluye comprobaciones de selección de capítulos y entrega de PDF.

Las pruebas del sidebar cubren la navegación, los borradores y las fuentes compartidas. Las pruebas de tablas verifican la interacción entre cambios estructurales, escritura pendiente y destrucción del editor. Las pruebas existentes del teclado y la selección siguen cubriendo la edición entre párrafos.

La regresión de WebKitGTK se verificó además con eventos nativos GTK (`isTrusted`), soltando el botón y capturando el resaltado con `INCLUDE_SELECTION_HIGHLIGHTING`. Comprobar solo `Selection.toString()` o despachar eventos JavaScript no detecta la diferencia entre el rango aparente y el rango que WebKit pinta.
