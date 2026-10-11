import path from 'node:path';

// These packs contain browser UI strings, not document text or ICU data.
// Keep Libria's interface languages and common regional fallbacks.
const interfaceLocales = new Set(['en-US', 'en-GB', 'es', 'es-419', 'fr', 'de', 'it', 'pt-BR', 'pt-PT']);

export function pdfBrowserFilter(sourceRoot) {
  const root = path.resolve(sourceRoot);
  return source => {
    const relative = path.relative(root, source).split(path.sep).join('/');
    const locale = /(?:^|\/)locales\/([^/]+)\.pak$/.exec(relative);
    return !locale || interfaceLocales.has(locale[1]);
  };
}
