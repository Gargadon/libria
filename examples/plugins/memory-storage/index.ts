import type { Disposable, LibriaPlugin } from '@libria/plugin-api';

// Native .libria JSON only. Nothing in this document depends on the example plugin.
const content = JSON.stringify({
  libriaVersion: '1.10.0',
  metadata: { title: 'Proyecto de ejemplo', author: 'Libria', paperSize: '5x8' },
  preferences: {},
  session: { lastActiveChapterId: 'chapter-1' },
  chapters: [{
    id: 'chapter-1', title: 'Inicio', kind: 'chapter', words: 5,
    body: [{ type: 'p', text: 'Este contenido pertenece al libro.' }],
  }],
});

let contributions: Disposable[] = [];

const plugin: LibriaPlugin = {
  async activate(context) {
    contributions = [
      context.contributions.registerStorageProvider({
        id: 'memory',
        name: 'Almacenamiento de ejemplo',
        async listFiles({ signal }) {
          signal.throwIfAborted();
          return { files: [{ id: 'example', name: 'Ejemplo.libria', downloadable: true }] };
        },
        async readFile({ id, signal }) {
          signal.throwIfAborted();
          if (id !== 'example') throw new Error('Archivo no encontrado');
          return content;
        },
      }),
      context.contributions.registerCommand({
        id: 'about',
        title: 'Acerca del plugin de ejemplo',
        async run(signal) {
          signal.throwIfAborted();
          context.ui.notify('Este plugin solo añade funciones; no amplía el formato .libria.');
        },
      }),
    ];
  },
  async deactivate() {
    for (const contribution of contributions) contribution.dispose();
    contributions = [];
  },
};

export default plugin;
