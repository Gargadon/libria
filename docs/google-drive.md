# Google Drive en Libria

La integración de escritorio permite conectar y desconectar una cuenta, listar archivos `.libria`, abrirlos, crear documentos en Drive y sincronizar cambios en ambas direcciones. El contenido se valida con el mismo flujo nativo que un archivo local.

## Guardado y sincronización

Desde el botón de nube puedes guardar el documento abierto como archivo nuevo en Drive. Al abrir un documento de Drive se conserva una copia de trabajo en el directorio de datos de Tauri, bajo `drive-cache`. La bienvenida mantiene hasta cinco documentos locales en Recientes y muestra las copias de Drive en una sección independiente, **Drive en este equipo**, que funciona sin internet ni una sesión OAuth activa. También aparecen en el modal de Drive.

Guardar espera únicamente a que la copia local y su vínculo queden escritos en disco; la subida ocurre en segundo plano. El guardado explícito intenta sincronizar incluso si se desactivaron las revisiones automáticas. Si ya hay una sincronización en curso, programa otro intento al terminar, usando el vínculo actualizado. **Guardar y salir** no inicia una petición de red y permite cerrar tras completar la escritura local, aunque haya otra petición a Google atascada. El editor distingue **Sin guardar** de **Guardado en este equipo · Pendiente de Drive**. El estado pendiente se recupera comparando el archivo local con la última versión base guardada; no depende de memoria ni de LocalStorage.

Al abrir la copia de trabajo se intenta sincronizar en segundo plano. La sincronización automática vuelve a intentarlo cada 30 segundos y cuando el WebView anuncia que ha vuelto la conexión. Se puede desactivar y usar **Sincronizar ahora**. Un documento cerrado no se sincroniza hasta que se vuelve a abrir. **Guardar como documento local** conserva una copia independiente y desvincula el documento abierto de Drive.

Si Drive cambió y la copia local no, Libria descarga la nueva versión. Si cambió la versión de Drive pero su contenido coincide con la base, actualiza el archivo original con los cambios locales. Las diferencias de formato JSON no se consideran cambios de contenido. Si ambas copias cambiaron, detiene la sincronización automática y permite reemplazar explícitamente el original con tu versión, guardar un documento nuevo en Drive o guardar un respaldo local antes de abrir la versión remota. Reemplazar conserva el identificador del archivo y comprueba la versión observada al detectar el conflicto; si vuelve a cambiar, detiene el reemplazo. Si falla la red, la copia y su vínculo permanecen en el dispositivo; la app vuelve a intentarlo cuando el documento está abierto. No sincroniza documentos cerrados ni elimina archivos remotos automáticamente.

El vínculo, la cuenta y la versión base están en un archivo auxiliar fuera del `.libria`. No se añade ninguna clave al formato. Desconectar no borra las copias locales. Un documento solo se sincroniza con su cuenta original. Las comprobaciones de versión detectan cambios observados antes de la subida, pero no son un bloqueo distribuido: una edición simultánea durante la petición puede competir con la subida. Conserva respaldos para trabajar desde varios dispositivos.

Al guardar un documento nuevo, el menú ofrece elegir entre este equipo y Google Drive. «Guardar como» permite elegir también el destino. «Guardar en Drive» actualiza el archivo vinculado cuando existe un vínculo; solo ofrece crear un archivo nuevo si el documento aún no está vinculado. Crear una copia independiente sigue disponible como una acción explícita en «Más opciones».

**Abrir selector de Google Drive** abre Google Picker en el navegador del sistema. Google devuelve el identificador elegido al callback local de Libria; los tokens permanecen en Rust. Libria valida que sea un `.libria` descargable y respeta los cambios sin guardar antes de abrirlo. **Elegir carpeta en Google Drive** usa el mismo selector para elegir una carpeta de destino con permiso de escritura. El destino inicial es Mi unidad. Cancelar o elegir una cuenta distinta a la conectada conserva la sesión y el destino anteriores. El modal mantiene una lista paginada de documentos autorizados, independientemente de la carpeta de destino; Google Picker permite seleccionar documentos adicionales de otras carpetas. La búsqueda por nombre se limita a las páginas cargadas.

La subida crea un archivo nuevo incluso si ya existe otro con el mismo nombre. El documento abierto queda vinculado a esa copia de Drive y conserva una copia de trabajo local; el archivo local original no se modifica ni se elimina. Las carpetas sin permiso de escritura no se pueden seleccionar como destino.

El explorador permite **Mover a la papelera** los documentos `.libria` con permiso suficiente, tras confirmar el nombre y la cuenta. Para enviar el documento abierto hay que cerrarlo primero. Las carpetas quedan excluidas y las copias locales se conservan. La operación establece `trashed: true`; no elimina permanentemente el archivo. Se puede restaurar desde Google Drive.

Los archivos enviados a la papelera se retiran tanto del explorador como de **Drive en este equipo**. Al cargar las copias locales, volver a la ventana o recuperar internet, se comprueba su estado con la cuenta conectada. Una respuesta que confirma la papelera o que el archivo ya no está disponible se recuerda en disco, sin borrar el documento local. Los errores de red no se interpretan como eliminaciones. Las copias de otras cuentas conservan el último estado conocido hasta conectar su cuenta. Si se restaura un documento, la siguiente comprobación vuelve a mostrarlo. Antes de sincronizar también se comprueba su disponibilidad; si falta, se conserva el trabajo local y se indica que puede guardarse como documento nuevo.

## Credenciales incluidas y reemplazo local

La aplicación incluye credenciales OAuth ofuscadas en `src-tauri/oauth-credentials.json`. Un clon que contenga ese archivo puede compilar y conectar sin crear una configuración propia. La recuperación ocurre en Rust; no se expone mediante IPC al WebView.

El blob usa AES-256-GCM, un nonce aleatorio y una clave de 256 bits reconstruida mediante XOR de dos fragmentos aleatorios distribuidos con el programa. Su autenticación permite detectar una alteración accidental del blob. Como ambos fragmentos y el descifrador son públicos, esto es **ofuscación de distribución**, no confidencialidad frente a quien inspeccione el código o la memoria. No ofrece garantía de evitar detección o revocación ni aclara las políticas del proveedor. El blob contiene solo credenciales de la aplicación, nunca tokens de usuarios.

Para actualizar las credenciales incluidas, completa el archivo local descrito a continuación y ejecuta:

```sh
bun run drive:bundle-credentials
```

El script genera y verifica un nuevo blob sin imprimir el secreto y conserva el JSON original. Regenera solamente cuando cambies las credenciales; no es un paso necesario para cada compilación. El archivo generado está destinado a formar parte del repositorio y de los paquetes. Si cambias el cliente OAuth, será necesario volver a conectar la cuenta.

## Añadir o reemplazar el secreto

En la raíz del repositorio crea `google-drive-config.json`, copiando `google-drive-config.example.json`. Está excluido de Git. Completa `client_secret` con el secreto del mismo cliente OAuth de tipo **Aplicación de escritorio**:

```json
{
  "client_id": "109920984385-nj300o5c59enim5n2vicbo23p4khhs84.apps.googleusercontent.com",
  "client_secret": "TU_CLIENT_SECRET"
}
```

Reinicia `bun run tauri:dev`. Abre **Configuración → Google Drive → Gestionar cuenta y documentos → Conectar cuenta**. El botón de nube de la barra superior funciona también sin libro abierto.

También puedes usar `LIBRIA_GOOGLE_CLIENT_ID` y `LIBRIA_GOOGLE_CLIENT_SECRET` como variables de entorno del proceso nativo. Tienen prioridad sobre el archivo. Para una aplicación instalada, puedes colocar `google-drive-config.json` en su directorio `app_data_dir` de Tauri (en Windows, normalmente `%APPDATA%/com.libria.app`); ese archivo tiene prioridad sobre el de la raíz de desarrollo. Si especificas otro `client_id`, debes aportar su secreto: no se combina con el secreto del cliente incluido. No se lee un `.env` automáticamente.

El empaquetado incluye el blob y su descifrador; no incluye el JSON local con el secreto en texto plano. El archivo `google-drive-config.json` permanece excluido de Git. Las credenciales del blob siguen siendo recuperables del repositorio y del paquete.

## Configuración de Google Cloud

Activa **Google Drive API** y **Google Picker API** en el proyecto del cliente. Configura Google Auth Platform y registra tu correo como usuario de prueba mientras el proyecto esté en modo Testing. El error `403: access_denied` por falta de verificación o usuario de prueba se resuelve allí, no cambiando el secreto.

Las nuevas autorizaciones usan `https://www.googleapis.com/auth/drive.file`: permiten acceder a los archivos creados por Libria o seleccionados explícitamente mediante Google Picker. No conceden acceso general a todos los archivos de la cuenta. Añade este alcance a la configuración de consentimiento. Las sesiones existentes con `drive` siguen permitiendo guardar; al utilizar Picker se obtiene una sesión limitada a `drive.file`. Las sesiones antiguas con `drive.readonly` requieren autorizar escritura de nuevo. El flujo de Picker solicita únicamente `drive.file`, sin combinarlo con otros alcances ni incluir permisos concedidos previamente.

La integración de escritorio usa `trigger_onepick=true`, selección individual y `allow_folder_selection=true` para carpetas. No requiere una clave de API web ni cargar scripts de Google en el WebView. Los permisos concedidos por Picker se mantienen en la cuenta; los archivos no seleccionados previamente deben abrirse mediante el selector para concederles acceso.

La autorización abre el navegador del sistema y usa callback en `127.0.0.1` con puerto aleatorio, `state` y PKCE S256. Tanto el canje inicial como la renovación incluyen `client_secret`. La autorización pendiente puede cancelarse y caduca a los tres minutos.

Los tokens permanecen en Rust y se guardan mediante `keyring` en el almacén seguro del sistema, fuera del `.libria`. En Linux se necesita un servicio Secret Service desbloqueado. La sesión antigua de Electron no se importa: hay que volver a autorizar. Desconectar elimina los tokens locales e intenta revocarlos en Google, indicando si la revocación no se pudo confirmar. No elimina el documento abierto ni sus copias locales.

Las respuestas tienen límite de tamaño y tiempo. No se imprimen tokens, secreto, códigos OAuth ni cuerpos de respuesta en diagnósticos. Los errores HTTP muestran el estado del proveedor.

## Verificación

```sh
bun run test:drive
bun run build
```

Las pruebas del backend comprueban la validación de documentos, identificadores y checksums y el descifrado del blob. Las pruebas JavaScript comprueban el generador y el rechazo de alteraciones. La conexión real exige habilitar la API y autorizar la cuenta en el navegador.

Referencias: [OAuth para aplicaciones instaladas](https://developers.google.com/identity/protocols/oauth2/native-app), [Google Picker para aplicaciones de escritorio](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker), [listado de archivos de Drive](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), [almacenamiento de credenciales de Rust](https://docs.rs/keyring/).
