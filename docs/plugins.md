# Plugins de Libria: propuesta de API v1

Estado: especificación y contrato público preliminar. Este repositorio todavía no implementa el cargador, el gestor de plugins ni el control de permisos descritos aquí. El contrato está en [`plugin-api/index.d.ts`](../plugin-api/index.d.ts), con un [manifiesto validable](../plugin-api/manifest.schema.json) y un [ejemplo](../examples/plugins/memory-storage).

## Principio de compatibilidad

Un plugin añade funciones a Libria. El documento sigue siendo un documento nativo que puede abrirse, editarse y guardarse sin instalar ese plugin.

- No puede añadir propiedades al `.libria`, en ningún nivel: documento, metadatos, preferencias, sesión, capítulos, bloques u otras entidades.
- No puede introducir tipos de bloque, atributos HTML o referencias que requieran su ejecución para interpretar el contenido.
- No puede esconder su estado en campos nativos, comentarios, texto o HTML. El texto generado para el usuario sí puede incorporarse como contenido nativo normal.
- Los diccionarios que ya admite el formato, como los identificadores de recursos en `assets`, conservan su finalidad nativa; no se convierten en un contenedor de datos del plugin.
- Las imágenes y otros recursos deben seguir las reglas nativas de incorporación al documento. La portabilidad no puede depender de una cuenta, una URL privada o una caché del plugin.

Configuración, credenciales, identificadores remotos, historial de sincronización y cachés se guardarán fuera del libro, en espacios de almacenamiento de la aplicación separados por identificador de plugin. Esos datos nunca viajarán dentro del `.libria`. Desconectar una cuenta o quitar un plugin conserva el contenido del documento y las copias locales.

Libria es la única propietaria de la serialización. Un proveedor de almacenamiento entrega el JSON descargado; no recibe el almacén interno del editor ni sustituye su serializador. La futura escritura remota recibirá exclusivamente el documento serializado por Libria.

## API abierta e independiente

Cualquier persona podrá desarrollar y distribuir un plugin desde su propio repositorio. No se exige aprobación del mantenedor de Libria. El usuario decide qué instalar y qué permisos conceder.

La API es independiente de Angular, Electron y los servicios internos de la aplicación. El paquete propuesto `@libria/plugin-api` contiene tipos; todavía no se ha publicado en npm. El plugin exporta por defecto un objeto `LibriaPlugin` con `activate(context)` y, opcionalmente, `deactivate()`.

Cada paquete incluye `libria-plugin.json`, con identificador estable, nombre, versión, `apiVersion`, entrada JavaScript relativa y permisos. El identificador usa formato de dominio invertido. El host verifica el esquema, la compatibilidad y que la entrada resuelta permanezca dentro del paquete, incluidos los enlaces simbólicos. La versión de esta API no cambia la versión del formato `.libria`.

Los identificadores de comandos, paneles y proveedores se delimitan por plugin. No pueden reemplazar comandos nativos o contribuciones de otro plugin. Una extensión incompatible se mantiene desactivada con una explicación visible. Los cambios incompatibles del contrato necesitan otra versión de API.

## Puntos de extensión

| Capacidad | Función |
| --- | --- |
| Comandos | Acciones explícitas del usuario, con o sin documento abierto. |
| Paneles | Texto y botones declarativos que Libria representa con su interfaz. |
| Almacenamiento | Listar y descargar documentos; conectar y desconectar cuentas cuando corresponda. |
| Lectura del documento | Proyección independiente del texto y selección actuales, con permiso. |
| Propuestas de edición | Operaciones nativas cerradas, validadas y confirmadas por el usuario. |
| Eventos | Avisos de apertura, cambio y cierre, sin contenido del libro. |
| Servicios del host | Red, navegador, autorización, preferencias y secretos según permisos. |

Esto permite plugins de almacenamiento, asistentes de escritura, análisis y servicios de LLM. Los paneles iniciales son deliberadamente pequeños; otros puntos de extensión podrán añadirse mediante versiones posteriores. No se permite inyectar componentes Angular, scripts o HTML arbitrario en la interfaz.

Las proyecciones de lectura incluyen `sessionId`, `revision` e índices originales de bloque para identificar los párrafos. No son referencias mutables al documento. El host valida todos los mensajes en ejecución: los tipos TypeScript no constituyen esa validación.

Una propuesta de edición se aplica como una operación de deshacer del editor, después de mostrar una vista previa y obtener confirmación. Libria comprueba la sesión y la revisión antes de aplicar; si cambiaron, devuelve `conflict`. Las operaciones solo permiten reemplazar texto de un párrafo nativo o insertar párrafos nativos. Para párrafos con formato, referencias o notas, el host debe preservar sus estructuras mediante una operación nativa compatible o rechazar la propuesta; nunca eliminar esas estructuras silenciosamente.

## Gestor y ciclo de vida

La futura sección **Configuración → Plugins** permitirá instalar desde un paquete local, inspeccionar autor, versión y permisos, activar, desactivar y desinstalar. Instalar no ejecuta el plugin. Activarlo exige conceder sus permisos; un cambio de permisos requiere una nueva aceptación.

El host crea un contexto propio para cada activación. Registra todas las contribuciones y sus recursos, incluso si el plugin omite liberar alguno. Al desactivar, cancela `lifetime`, aborta operaciones pendientes, retira comandos, paneles y proveedores y ejecuta la limpieza con un tiempo límite. Si la activación falla, también revierte las contribuciones registradas.

Errores, bloqueos y terminaciones del plugin se muestran sin cerrar Libria ni perder el documento. Cada operación admite cancelación y límites de tiempo y tamaño. La desinstalación distingue la retirada del paquete de la eliminación explícita de sus datos locales; las credenciales se revocan o eliminan mediante el flujo de desconexión cuando sea posible.

## Permisos y ejecución

Los permisos iniciales son `document.read`, `document.propose-edits`, `network`, `browser.open`, `authorization.oauth` y `secrets`. Las preferencias ordinarias están separadas por plugin y nunca contienen tokens. Los secretos requieren almacenamiento protegido del host; si esa protección no está disponible, la operación falla con una explicación, sin guardar en texto plano.

La implementación deberá ejecutar plugins fuera del proceso principal y del editor, a través de un puente con mensajes validados. Separar procesos por sí solo no impide acceso a archivos o red. Antes de aceptar código de terceros como aislado, el runtime debe impedir el acceso directo a Node, Electron, DOM, sistema de archivos y red, y permitir únicamente servicios mediados por el host. Los permisos declarados no proporcionan aislamiento por sí solos.

Las peticiones de red se limitan a los orígenes HTTPS del manifiesto, incluidas todas las redirecciones. Las URLs abiertas en navegador y los parámetros OAuth también se validan. El host controla `state`, PKCE, callback y parámetros reservados; el plugin no puede sobrescribirlos mediante parámetros adicionales. No se registran tokens, códigos ni contenido del libro en diagnósticos.

La lectura del libro requiere permiso; enviarlo a un servicio externo requiere una acción informada del usuario. Una suscripción a cambios no autoriza exportaciones automáticas del manuscrito. El host debe hacer cumplir esta política en las operaciones que transporten contenido del documento.

## Primer flujo: abrir desde almacenamiento

1. El usuario instala y activa un plugin de almacenamiento.
2. En Configuración conecta su cuenta mediante la contribución `account`, si el proveedor la necesita. Puede desconectarla desde el mismo lugar sin abrir un libro.
3. En **Archivo → Abrir desde…** elige el proveedor y un archivo `.libria` de su listado.
4. El proveedor descarga el contenido. Libria valida tamaño, JSON y esquema nativo completo antes de sustituir el documento activo; los cambios pendientes mantienen el flujo normal de confirmación.
5. El archivo abierto pasa por las mismas migraciones compatibles que un archivo local. El usuario puede guardar una copia local con las herramientas nativas.

El validador actual del documento no basta para imponer estas restricciones: no rechaza todas las propiedades desconocidas ni todos los tipos de bloque. La implementación del límite de plugins deberá añadir validación estricta para cada estructura, conservando las migraciones nativas admitidas. Un archivo que incluya campos de plugin debe rechazarse con una explicación; no basta con comprobar que existan las propiedades obligatorias.

El contrato inicial no incluye escritura remota ni sincronización. Se diseñarán después de verificar la apertura, con control de conflictos, copia local y recuperación. Sus asociaciones remotas permanecerán fuera del `.libria`.

## Google Drive y LLM como plugins externos

Un plugin de Drive mantiene su OAuth y dependencias fuera del núcleo. La API de autorización facilita el flujo de conexión, pero no cambia los requisitos del proveedor: mover la integración a un plugin no elimina la exigencia de un `client_secret`. Las credenciales distribuidas dentro de un paquete pueden extraerse; el autor debe elegir y documentar su modelo de conexión sin prometer secretos ocultos en software distribuido.

Un plugin de LLM registra un comando, obtiene la selección con permiso, comunica qué contenido enviará y presenta la respuesta como una propuesta de texto nativo. Su API key vive en el almacén de secretos. Desinstalarlo no afecta al texto aceptado en el libro.

## Entrega actual y siguiente implementación

Esta entrega define documentación, tipos, esquema de manifiesto y un ejemplo independiente de almacenamiento en memoria que también registra un comando. No habilita todavía instalación o ejecución de plugins en Libria.

El primer runtime deberá implementar el gestor, el aislamiento y puente, validación y permisos, ciclo de vida, contribuciones genéricas y apertura desde almacenamiento. La verificación deberá cubrir rechazo de propiedades desconocidas anidadas, cancelación y fallos de plugins, revisiones obsoletas, retirada de contribuciones y apertura del mismo documento con el plugin ausente. Guardado y sincronización quedan para una ampliación posterior.
