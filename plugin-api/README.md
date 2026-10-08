# API pública de plugins de Libria

**Estado: propuesta de API v1.** Este paquete contiene tipos y el esquema del
manifiesto. El cargador, el aislamiento, el gestor de plugins y sus permisos
todavía no están implementados. No se ha publicado un paquete en npm.

Cualquier persona podrá crear y distribuir un plugin en su propio repositorio,
sin modificar Libria ni obtener aprobación previa del mantenedor. La instalación
y el otorgamiento de permisos corresponderán al usuario.

El formato `.libria` permanece independiente de los plugins: no se permiten
claves adicionales en ningún nivel, tipos de bloque propios ni datos necesarios
para interpretar el documento. Los detalles están en
[la especificación](../docs/plugins.md).

Los plugins importan los contratos con `import type`, de modo que el SDK no se
incluye como una dependencia de ejecución. Cuando exista el runtime, este
proporcionará `PluginContext` al llamar a `activate`.

Archivos:

- `index.d.ts`: ciclo de vida, contexto, permisos y puntos de extensión.
- `manifest.schema.json`: estructura de `libria-plugin.json`.
- `../examples/plugins/memory-storage`: ejemplo tipado de almacenamiento y comandos.

Verificación del contrato y del ejemplo, desde la raíz del repositorio:

```text
node node_modules/typescript/bin/tsc -p plugin-api/tsconfig.json
```

La API es independiente de Angular y Electron: no expone el DOM, IPC, el store
ni módulos internos de la aplicación. Las capacidades nuevas se incorporarán
mediante versiones documentadas del contrato.
