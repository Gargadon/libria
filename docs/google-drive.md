# Google Drive en Libria

La integración de escritorio permite conectar y desconectar una cuenta, listar archivos `.libria`, abrirlos, crear documentos en Drive y sincronizar cambios en ambas direcciones. El contenido se valida con el mismo flujo nativo que un archivo local.

## Guardado y sincronización

Desde el botón de nube puedes guardar el documento abierto como archivo nuevo en Drive. Al abrir un documento de Drive, se mantiene una copia de trabajo en `userData/drive-cache`, que puedes abrir como archivo local incluso sin conexión. La bienvenida muestra hasta cinco documentos locales recientes y excluye las copias de Drive; el enlace **¿Qué pasó con mis archivos en Google Drive?** abre el modal para acceder a esos documentos. Guardar actualiza primero la copia local y después intenta subir los cambios. La sincronización automática revisa el documento abierto cada 30 segundos; puedes desactivarla y usar **Sincronizar ahora**. **Guardar como documento local** conserva una copia independiente y desvincula el documento abierto de Drive.

Si Drive cambió y la copia local no, Libria descarga la nueva versión. Si ambas cambiaron, detiene la sincronización automática y permite guardar tu versión como documento nuevo en Drive, o guardar un respaldo local antes de abrir la versión remota. Si falla la red, la copia y su vínculo permanecen en el dispositivo; la app vuelve a intentarlo cuando el documento está abierto. No sincroniza documentos cerrados ni elimina archivos remotos.

El vínculo, la cuenta y la versión base están en un archivo auxiliar fuera del `.libria`. No se añade ninguna clave al formato. Desconectar no borra las copias locales. Un documento solo se sincroniza con su cuenta original. Las comprobaciones de versión detectan cambios observados antes de la subida, pero no son un bloqueo distribuido: una edición simultánea durante la petición puede competir con la subida. Conserva respaldos para trabajar desde varios dispositivos.

## Credenciales incluidas y reemplazo local

La aplicación incluye credenciales OAuth ofuscadas en `electron/google-drive-credentials.cjs`. Un clon que contenga ese archivo puede compilar y conectar sin crear una configuración propia. La recuperación ocurre en el proceso principal de Electron; no se expone mediante IPC al renderer.

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

Reinicia `bun run electron:dev`. Abre **Configuración → Google Drive → Gestionar cuenta y documentos → Conectar cuenta**. El botón de nube de la barra superior funciona también sin libro abierto, al igual que **Archivo → Abrir desde Google Drive** en el menú nativo.

También puedes usar `LIBRIA_GOOGLE_CLIENT_ID` y `LIBRIA_GOOGLE_CLIENT_SECRET` como variables de entorno del proceso Electron. Tienen prioridad sobre el archivo. Para una aplicación instalada, puedes colocar `google-drive-config.json` en su directorio `userData` (en Windows, normalmente `%APPDATA%/Libria`); ese archivo tiene prioridad sobre el de la raíz de desarrollo. Los valores locales vacíos recurren a las credenciales incluidas. Si especificas otro `client_id`, debes aportar su secreto: no se combina con el secreto del cliente incluido. No se lee un `.env` automáticamente.

El empaquetado incluye el blob y su descifrador; no incluye el JSON local con el secreto en texto plano. El archivo `google-drive-config.json` permanece excluido de Git. Las credenciales del blob siguen siendo recuperables del repositorio y del paquete.

## Configuración de Google Cloud

Activa Google Drive API en el proyecto del cliente. Configura Google Auth Platform y registra tu correo como usuario de prueba mientras el proyecto esté en modo Testing. El error `403: access_denied` por falta de verificación o usuario de prueba se resuelve allí, no cambiando el secreto.

El alcance actual es `https://www.googleapis.com/auth/drive`, para listar, descargar y modificar documentos existentes y crear archivos nuevos. La interfaz trabaja con `.libria`; el permiso concedido por Google es más amplio. Las cuentas previamente conectadas con `drive.readonly` deben volver a conectarse para autorizar escritura. La publicación debe cumplir los requisitos de verificación del nuevo alcance. No usamos `drive.file` porque por sí solo no ofrece acceso a todos los documentos existentes; una selección mediante Google Picker permitiría reconsiderar ese alcance.

La autorización abre el navegador del sistema y usa callback en `127.0.0.1` con puerto aleatorio, `state` y PKCE S256. Tanto el canje inicial como la renovación incluyen `client_secret`. La autorización pendiente puede cancelarse y caduca a los tres minutos.

Los tokens permanecen en el proceso principal de Electron y se almacenan cifrados mediante `safeStorage`, fuera del `.libria`. En Linux se necesita un llavero seguro; se rechaza el backend `basic_text`. Desconectar elimina los tokens locales e intenta revocarlos en Google, indicando si la revocación no se pudo confirmar. No elimina el documento abierto ni sus copias locales.

Las respuestas tienen límite de tamaño y tiempo. No se imprimen tokens, secreto, códigos OAuth ni cuerpos de respuesta en diagnósticos. Los errores HTTP muestran estado y código del proveedor.

## Verificación

```sh
bun run test:drive
bun run build
```

Las pruebas del backend usan respuestas simuladas y callbacks locales. También comprueban el descifrado, rechazo de alteraciones y uso del blob sin configuración local. La conexión real exige habilitar la API y autorizar la cuenta en el navegador.

Referencias: [OAuth para aplicaciones instaladas](https://developers.google.com/identity/protocols/oauth2/native-app), [listado de archivos de Drive](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list), [almacenamiento seguro de Electron](https://www.electronjs.org/docs/latest/api/safe-storage).
