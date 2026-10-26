# Ejemplo de plugin: almacenamiento en memoria

Ejemplo del contrato preliminar de Libria. Registra un proveedor que entrega un documento nativo y un comando informativo: los plugins pueden aportar funciones de distintas clases.

No necesita red, cuentas o secretos. No añade propiedades al documento. El manifiesto apunta al futuro resultado compilado `dist/index.js`; Libria todavía no tiene un cargador para instalarlo o ejecutarlo.

Para comprobar los tipos desde la raíz del repositorio:

```sh
node node_modules/typescript/bin/tsc -p plugin-api/tsconfig.json
```

La comprobación no genera JavaScript. El contrato usa importaciones de tipos, sin dependencia del runtime de Angular o Electron. Consulta la [especificación](../../../docs/plugins.md) antes de crear una integración.
