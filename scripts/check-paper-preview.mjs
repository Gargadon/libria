import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { findBrowser } from './pdf-export.mjs';
const require = createRequire(import.meta.url);
const cli = createRequire(require.resolve('@vivliostyle/cli/package.json'));
const puppeteer = cli('puppeteer-core');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'libria-paper-preview-'));

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = root + '/dist/libria/browser';
const desktopFonts = process.env.LIBRIA_PREVIEW_EMBED_FONTS
  ? fs
      .readFileSync(path.join(root, 'public/fonts.css'), 'utf8')
      .replace(
        /url\(fonts\/([^\)]+)\)/g,
        (_match, filename) =>
          `url(data:font/woff2;base64,${fs.readFileSync(path.join(root, 'public/fonts', filename)).toString('base64')})`,
      )
      .replace(/font-display:\s*swap/g, 'font-display: block')
  : '';

const server = http.createServer((req, res) => {
  const file = path.join(
    dist,
    decodeURIComponent(req.url.split('?')[0]) === '/'
      ? 'index.html'
      : decodeURIComponent(req.url.split('?')[0]),
  );
  if (process.env.LIBRIA_CHECK_CSP !== '0')
    res.setHeader(
      'Content-Security-Policy',
      JSON.parse(fs.readFileSync(root + '/src-tauri/tauri.conf.json')).app.security.csp,
    );
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.woff2': 'font/woff2',
  };
  res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
  try {
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({
    executablePath: findBrowser(path.join(root, 'runtime/pdf')),
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000 });
    let failed = 0;
    page.on('requestfailed', (r) => {
      if (failed++ < 6) console.log('FAILED_URL', r.url());
    });
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') {
        if (!m.text().includes('ERR_FILE_NOT_FOUND')) console.log('ERROR', m.text().slice(0, 400));
      }
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForSelector('app-root');
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-root')).store.createNewProject(),
    );
    await page.waitForSelector('app-preview');
    await page.evaluate((desktopFonts) => {
      const app = ng.getComponent(document.querySelector('app-root'));
      const preview = ng.getComponent(document.querySelector('app-preview'));
      const words =
        'Aquella tarde el viento recorría las calles del pueblo mientras los vecinos conversaban bajo los árboles. ';
      const chapter = (id, n, repeat, forceOddPage = false) => ({
        id,
        kind: 'chapter',
        number: n,
        title: 'Capítulo ' + n,
        words: repeat * 18,
        readMin: 1,
        status: 'draft',
        forceOddPage,
        body: [
          { type: 'chapter-num', text: 'Capítulo ' + n },
          { type: 'chapter-title', text: 'Las calles del pueblo' },
          { type: 'first-p', text: words.repeat(8) },
          { type: 'p', text: words.repeat(repeat) },
        ],
        footnotes: [],
      });
      const chapters = [
        {
          id: 'cover',
          kind: 'front',
          title: 'Portada',
          words: 2,
          status: 'front',
          body: [
            { type: 'title', text: 'Libro de prueba' },
            { type: 'author', text: 'Autora' },
          ],
        },
        {
          id: 'toc',
          kind: 'front',
          title: 'Índice',
          templateId: 'toc',
          words: 0,
          status: 'front',
          body: [],
        },
        chapter('one', 1, 24, true),
        chapter('two', 2, 34, true),
        chapter('three', 3, 18, false),
      ];
      // Tables lazily fetch Vivliostyle's embedded user-agent.xml template.
      // Exercise this under the actual desktop CSP, not only text and images.
      chapters[4].body.push({
        type: 'table',
        text: 'Primera columna Segunda columna',
        html: '<table><tbody><tr><td>Primera columna</td><td>Segunda columna</td></tr><tr><td>Contenido</td><td>Contenido adicional</td></tr></tbody></table>',
      });
      app.store.loadDocument(
        {
          libriaVersion: '2.1.1',
          metadata: { ...app.store.book(), title: 'Libro de prueba' },
          preferences: {
            ...app.store.tweaks(),
            hyphenation: false,
            showHeader: true,
            showPageNumbers: true,
            hideFirstPageHeaderFooter: true,
          },
          chapters,
          assets: {},
        },
        preview.assetService,
      );
      if (desktopFonts) preview.paperPreview.fontsPromise = Promise.resolve(desktopFonts);
      app.store.setNav('layout');
    }, desktopFonts);
    await page.waitForFunction(
      () => {
        const p = ng.getComponent(document.querySelector('app-preview'));
        return p.paperPreview.error() || (!!p.paperPreview.layout() && !p.paperPreview.busy());
      },
      { timeout: 60000 },
    );
    if (
      await page.evaluate(() =>
        ng.getComponent(document.querySelector('app-preview')).paperPreview.error(),
      )
    )
      throw Error('Preview composition error');
    console.log(
      'INITIAL',
      await page.evaluate(() => {
        const p = ng.getComponent(document.querySelector('app-preview'));
        const s = p.paperPreview;
        return {
          error: s.error(),
          stats: s.stats(),
          chapters: s.layout().chapters,
          total: s.layout().pages.length,
          display: s.doc.getElementById('paper-display').textContent.slice(0, 300),
        };
      }),
    );
    await page.screenshot({ path: path.join(output, 'initial.png') });
    fs.writeFileSync(
      path.join(output, 'initial.html'),
      await page.evaluate(
        () =>
          ng.getComponent(document.querySelector('app-preview')).paperPreview.doc.documentElement
            .outerHTML,
      ),
    );
    assert.equal(
      await page.evaluate(() =>
        [
          ...ng
            .getComponent(document.querySelector('app-preview'))
            .paperPreview.cache.cache.values(),
        ].some((entry) => entry.html.includes('data:font/')),
      ),
      false,
      'Embedded fonts must be shared, not duplicated in chapter cache keys',
    );
    const compare = async () => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      const s = p.paperPreview;
      const input = s.latestInput;
      const iframe = document.createElement('iframe');
      iframe.src = 'paper-preview.html';
      document.body.appendChild(iframe);
      await new Promise((r) => (iframe.onload = r));
      const doc = iframe.contentDocument;
      const Core = s.viewer.constructor;
      const viewer = new Core(
        { viewportElement: doc.getElementById('paper-worker'), window: iframe.contentWindow },
        { renderAllPages: true, autoResize: false, zoom: 1, allowScripts: false },
      );
      const style = doc.createElement('style');
      style.textContent = s.fontsCss;
      doc.head.appendChild(style);
      let html = p.printHtml.buildPrintHtml(
        input.book,
        input.chapters,
        input.tweaks,
        input.bodyFont,
        input.titleFont,
        new URL('fonts.css', document.baseURI).href,
        input.assets,
        undefined,
        true,
      );
      html = html.replace('</head>', '<style>' + s.fontsCss + '</style></head>');
      const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      await new Promise((r, j) => {
        viewer.addListener('readystatechange', () => {
          if (viewer.readyState === 'complete') r();
        });
        viewer.addListener('error', (e) => j(JSON.stringify(e)));
        viewer.loadDocument(url);
      });
      const normalize = (s) => s.replace(/\s+/g, ' ').trim();
      const extract = (e) => ({
        text: normalize(e.querySelector('[data-vivliostyle-page-area]')?.textContent || ''),
        margins: [...e.querySelectorAll('[data-vivliostyle-page-margin-box]')].map((m) => [
          m.getAttribute('data-vivliostyle-page-margin-box'),
          normalize(m.textContent),
        ]),
        side: e.getAttribute('data-vivliostyle-page-side'),
      });
      const reference = [...doc.querySelectorAll('[data-vivliostyle-page-container]')].map(extract);
      const incremental = s.layout().pages.map((page, i) => {
        const copy = page.source.cloneNode(true);
        copy
          .querySelectorAll('[data-vivliostyle-page-counter]')
          .forEach((e) => (e.textContent = String(i + 1)));
        return extract(copy);
      });
      const diffs = [];
      for (let i = 0; i < Math.max(reference.length, incremental.length); i++)
        if (JSON.stringify(reference[i]) !== JSON.stringify(incremental[i]))
          diffs.push({ page: i + 1, reference: reference[i], incremental: incremental[i] });
      URL.revokeObjectURL(url);
      iframe.remove();
      return { referencePages: reference.length, incrementalPages: incremental.length, diffs };
    };
    const comparison = await page.evaluate(compare);
    fs.writeFileSync(path.join(output, 'comparison.json'), JSON.stringify(comparison, null, 2));
    console.log(
      'COMPARISON',
      JSON.stringify({
        ...comparison,
        diffs: comparison.diffs.map((d) => ({
          page: d.page,
          ref: d.reference?.text.slice(0, 100),
          inc: d.incremental?.text.slice(0, 100),
          refMargins: d.reference?.margins,
          incMargins: d.incremental?.margins,
        })),
      }),
    );
    assert.deepEqual(comparison.diffs, [], 'Incremental pages must match whole-book pagination');

    await page.evaluate(() => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      window.__paperFrame = p.printIframeEl.nativeElement;
      const ch = p.store.chapters().find((c) => c.id === 'two');
      p.store.updateChapterBlock('two', 3, 'Edición mínima. ' + ch.body[3].text);
    });
    await page.waitForFunction(
      () => {
        const s = ng.getComponent(document.querySelector('app-preview')).paperPreview;
        return (
          !s.busy() &&
          s.layout().pages.some((p) => p.source.textContent.includes('Edición mínima.'))
        );
      },
      { timeout: 60000 },
    );
    const edit = await page.evaluate(() => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      return {
        stats: p.paperPreview.stats(),
        sameFrame: window.__paperFrame === p.printIframeEl.nativeElement,
        total: p.paperPreview.layout().pages.length,
      };
    });
    console.log('EDIT', edit);
    assert.equal(edit.stats.rendered, 1);
    assert.equal(edit.stats.reused, 4);
    assert.equal(edit.sameFrame, true);
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-preview')).store.updateTweak('mode', 'dark'),
    );
    await page.waitForFunction(
      () => {
        const s = ng.getComponent(document.querySelector('app-preview')).paperPreview;
        return !s.busy() && s.stats().rendered === 0;
      },
      { timeout: 10000 },
    );
    console.log(
      'UI_ONLY',
      await page.evaluate(() =>
        ng.getComponent(document.querySelector('app-preview')).paperPreview.stats(),
      ),
    );
    await page.evaluate(() => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      p.goToPage(p.paperPreview.layout().chapters.toc.startPage);
    });
    const toc = await page.evaluate(() => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      const doc = p.printIframeEl.nativeElement.contentDocument;
      return {
        links: [...doc.querySelectorAll('#paper-display a')].map((e) => ({
          href: e.getAttribute('href'),
          text: e.textContent,
        })),
        global: p.globalPage(),
      };
    });
    console.log('TOC', toc);
    await page.evaluate(() => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      const links =
        p.printIframeEl.nativeElement.contentDocument.querySelectorAll('#paper-display a');
      p.printIframeEl.nativeElement.contentDocument
        .querySelector('#paper-display a[data-libria-chapter-target="two"]')
        .click();
    });
    const navigation = await page.evaluate(() => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      return {
        global: p.globalPage(),
        expected: p.paperPreview.layout().chapters.two.startPage - 1,
      };
    });
    assert.equal(navigation.global, navigation.expected);
    console.log('TOC_NAV', navigation);
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-preview')).mode.set('kindle'),
    );
    await page.waitForFunction(
      () => ng.getComponent(document.querySelector('app-preview')).mode() === 'kindle',
    );
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-preview')).mode.set('print'),
    );
    await page.waitForFunction(
      () => {
        const p = ng.getComponent(document.querySelector('app-preview'));
        return (
          p.printIframeEl?.nativeElement.contentDocument?.querySelector(
            '#paper-display [data-vivliostyle-page-container]',
          ) && !p.paperPreview.busy()
        );
      },
      { timeout: 20000 },
    );
    console.log(
      'REOPEN',
      await page.evaluate(() => {
        const p = ng.getComponent(document.querySelector('app-preview'));
        return {
          stats: p.paperPreview.stats(),
          text: p.printIframeEl.nativeElement.contentDocument
            .querySelector('#paper-display')
            .textContent.slice(0, 100),
        };
      }),
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.__paperFrame ===
          ng.getComponent(document.querySelector('app-preview')).printIframeEl.nativeElement,
      ),
      true,
    );
    await page.screenshot({ path: path.join(output, 'final.png') });
    assert.deepEqual(pageErrors, []);
    // Changing chapter length must update later folios, blank pages and TOC.
    await page.evaluate(() => {
      const p = ng.getComponent(document.querySelector('app-preview'));
      const chapter = p.store.chapters().find((ch) => ch.id === 'one');
      p.store.updateChapterBlock(
        'one',
        3,
        chapter.body[3].text + ' Ampliación del capítulo. '.repeat(180),
      );
    });
    await page.waitForFunction(
      () => {
        const p = ng.getComponent(document.querySelector('app-preview'));
        return (
          !p.paperPreview.busy() &&
          p.paperPreview
            .layout()
            .pages.some((page) => page.source.textContent.includes('Ampliación del capítulo.'))
        );
      },
      { timeout: 60000 },
    );
    const grown = await page.evaluate(compare);
    assert.deepEqual(grown.diffs, [], 'Chapter growth must match full-book pagination');
    console.log('GROWTH', {
      pages: grown.incrementalPages,
      stats: await page.evaluate(() =>
        ng.getComponent(document.querySelector('app-preview')).paperPreview.stats(),
      ),
    });
    const beforeTypography = await page.evaluate(
      () =>
        ng.getComponent(document.querySelector('app-preview')).paperPreview.layout().pages[0].source
          .outerHTML,
    );
    await page.evaluate(() =>
      ng.getComponent(document.querySelector('app-preview')).store.updateTweak('fontSize', 13),
    );
    await page.waitForFunction(
      (old) => {
        const p = ng.getComponent(document.querySelector('app-preview'));
        return !p.paperPreview.busy() && p.paperPreview.layout().pages[0].source.outerHTML !== old;
      },
      { timeout: 60000 },
      beforeTypography,
    );
    const resized = await page.evaluate(compare);
    assert.deepEqual(resized.diffs, [], 'Global typography must match full-book pagination');
    console.log('TYPOGRAPHY', {
      pages: resized.incrementalPages,
      stats: await page.evaluate(() =>
        ng.getComponent(document.querySelector('app-preview')).paperPreview.stats(),
      ),
    });
    if (process.env.LIBRIA_PREVIEW_SAMPLE) {
      const sample = JSON.parse(fs.readFileSync(process.env.LIBRIA_PREVIEW_SAMPLE, 'utf8'));
      const previous = await page.evaluate(
        () =>
          ng.getComponent(document.querySelector('app-preview')).paperPreview.layout().pages[0]
            .source.outerHTML,
      );
      await page.evaluate((sample) => {
        const p = ng.getComponent(document.querySelector('app-preview'));
        p.store.loadDocument(sample, p.assetService);
        p.store.updateTweak('hyphenation', false);
      }, sample);
      await page.waitForFunction(
        (old) => {
          const p = ng.getComponent(document.querySelector('app-preview'));
          return (
            !p.paperPreview.busy() && p.paperPreview.layout().pages[0].source.outerHTML !== old
          );
        },
        { timeout: 120000 },
        previous,
      );
      const realBook = await page.evaluate(compare);
      fs.writeFileSync(
        path.join(output, 'sample-comparison.json'),
        JSON.stringify(realBook, null, 2),
      );
      assert.deepEqual(realBook.diffs, [], 'Sample book must match full-book pagination');
      console.log('SAMPLE', { pages: realBook.incrementalPages, chapters: sample.chapters.length });
    }
    assert.deepEqual(pageErrors, []);
    console.log(
      'PASS: chapter cache, folios, parity, contents, growth, typography, navigation and persistent viewer. Artifacts:',
      output,
    );
    await page.close();
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
