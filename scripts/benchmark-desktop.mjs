import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

// Windows native release benchmark. No application code or user documents are modified.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cli = createRequire(require.resolve('@vivliostyle/cli/package.json'));
const { default: puppeteer } = await import(pathToFileURL(cli.resolve('puppeteer-core')).href);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const runs = Number(process.env.LIBRIA_BENCH_RUNS || 3);
const seconds = Number(process.env.LIBRIA_BENCH_SECONDS || 20);
assert.ok(Number.isInteger(runs) && runs > 0 && Number.isFinite(seconds) && seconds >= 5);
assert.equal(process.platform, 'win32');
const executable = path.resolve(
  process.env.LIBRIA_BENCH_EXE || path.join(root, 'src-tauri/target/release/libria.exe'),
);
const output = path.join(
  root,
  'tmp',
  `benchmark-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);
fs.mkdirSync(output, { recursive: true });
const sample = JSON.parse(fs.readFileSync(path.join(root, 'El_Principito.libria'), 'utf8'));
// Always open a copy: typing and autosave must never touch the original book.
const samplePath = path.join(output, 'sample.libria');
fs.writeFileSync(samplePath, JSON.stringify(sample));
const large = structuredClone(sample);
large.metadata.title = 'Benchmark 60000 palabras';
const paragraph = Array.from(
  { length: 100 },
  (_, i) => ['libro', 'texto', 'historia', 'memoria', 'tiempo'][i % 5],
).join(' ');
large.chapters = Array.from({ length: 30 }, (_, i) => ({
  id: `bench-${i}`,
  kind: 'chapter',
  title: `Capitulo ${i + 1}`,
  number: i + 1,
  words: 2000,
  status: 'draft',
  body: Array.from({ length: 20 }, () => ({ type: 'p', text: paragraph })),
}));
large.assets = {};
large.notes = [];
large.session = { lastActiveChapterId: large.chapters[0].id };
const largePath = path.join(output, 'large.libria');
fs.writeFileSync(largePath, JSON.stringify(large));
const describe = (doc) => ({
  chapters: doc.chapters.length,
  blocks: doc.chapters.reduce((n, c) => n + c.body.length, 0),
  words: doc.chapters.reduce(
    (n, c) =>
      n +
      c.body.reduce(
        (m, b) =>
          m +
          (b.text || b.html?.replace(/<[^>]+>/g, ' ') || '').trim().split(/\s+/).filter(Boolean)
            .length,
        0,
      ),
    0,
  ),
});
const powershell = path.join(
  process.env.SystemRoot,
  'System32/WindowsPowerShell/v1.0/powershell.exe',
);
const metadata = {
  timestamp: new Date().toISOString(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  version: JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  cpu: os.cpus()[0].model,
  logicalProcessors: os.cpus().length,
  totalRamGiB: os.totalmem() / 2 ** 30,
  executable,
  executableBytes: fs.statSync(executable).size,
  executableSha256: (await import('node:crypto'))
    .createHash('sha256')
    .update(fs.readFileSync(executable))
    .digest('hex'),
  configuration:
    'Native release + production Angular; benchmark identifier com.libria.benchmark; isolated WebView2 profile per run; CDP automation enabled',
  runs,
  steadyPhaseSeconds: seconds,
  documents: { sample: describe(sample), large: describe(large) },
  preferences: sample.preferences,
};
fs.writeFileSync(path.join(output, 'metadata.json'), JSON.stringify(metadata, null, 2));
console.log(`Benchmark output: ${output}`);
const results = [];
for (let run = 1; run <= runs; run++) {
  // Autosave may update these copies; reset the workload for every repetition.
  fs.writeFileSync(samplePath, JSON.stringify(sample));
  fs.writeFileSync(largePath, JSON.stringify(large));
  const dir = path.join(output, `run-${run}`);
  fs.mkdirSync(dir);
  const phaseFile = path.join(dir, 'phase.txt'),
    stopFile = path.join(dir, 'stop');
  const phase = (name) => {
    fs.writeFileSync(phaseFile, name);
    console.log(`Run ${run}: ${name}`);
  };
  phase('startup');
  const launched = performance.now();
  const app = spawn(executable, [], {
    cwd: path.dirname(executable),
    windowsHide: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      LIBRIA_GOOGLE_CLIENT_ID: 'libria-benchmark.apps.googleusercontent.com',
      LIBRIA_GOOGLE_CLIENT_SECRET: '',
      WEBVIEW2_USER_DATA_FOLDER: path.join(dir, 'webview-profile'),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:
        '--remote-debugging-port=9432 --remote-debugging-address=127.0.0.1',
    },
  });
  const sampler = spawn(
    powershell,
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      path.join(root, 'scripts/benchmark-processes.ps1'),
      '-RootProcessId',
      String(app.pid),
      '-PhaseFile',
      phaseFile,
      '-OutputFile',
      path.join(dir, 'samples.jsonl'),
      '-StopFile',
      stopFile,
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let samplerError = '';
  sampler.stderr.on('data', (data) => {
    samplerError += data;
  });
  let browser;
  const errors = [];
  const timings = {};
  try {
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        browser = await puppeteer.connect({
          browserURL: 'http://127.0.0.1:9432',
          defaultViewport: null,
        });
        break;
      } catch {
        if (app.exitCode !== null) throw new Error(`Libria exited: ${app.exitCode}`);
        await sleep(500);
      }
    }
    assert.ok(browser, 'Native WebView2 endpoint unavailable');
    let page;
    for (let attempt = 0; attempt < 60; attempt++) {
      page = (await browser.pages()).find((p) => /tauri\.localhost|tauri:\/\//.test(p.url()));
      if (page) break;
      await sleep(500);
    }
    assert.ok(page, 'Native page missing');
    page.on('pageerror', (error) => errors.push(error.message));
    await page.waitForSelector('.welcome__btn--primary', { timeout: 60000 });
    timings.startupMs = performance.now() - launched;
    assert.equal(
      await page.evaluate(() => window.__TAURI_INTERNALS__.invoke('plugin:app|identifier')),
      'com.libria.benchmark',
      'Build with the isolated benchmark identifier first',
    );
    assert.ok(
      await page.evaluate(async () =>
        (await window.desktopAPI.getFontsCss()).includes('data:font/'),
      ),
      'Packaged fonts missing',
    );
    metadata.webviewUserAgent = await page.evaluate(() => navigator.userAgent);
    metadata.viewport = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      devicePixelRatio,
      visibility: document.visibilityState,
    }));
    await sleep(5000);
    phase('welcome_idle');
    await sleep(seconds * 1000);
    const open = async (file, title, label) => {
      phase(label);
      const start = performance.now();
      await page.evaluate(
        (file) =>
          window.__TAURI_INTERNALS__.invoke('plugin:event|emit', {
            event: 'file:open',
            payload: file,
          }),
        file,
      );
      await page.waitForFunction(
        (title) =>
          document.title.includes(title) && document.querySelector('[contenteditable="true"]'),
        { timeout: 90000 },
        path.basename(file),
      );
      timings[`${label}Ms`] = performance.now() - start;
      // Loading a document resets navigation to Layout, which selects Papel.
      // Choose Kindle after that reset, and verify the actual UI mode.
      await page.$$eval('.pv__tab', (tabs) =>
        tabs.find((t) => t.textContent.trim() === 'Kindle').click(),
      );
      await page.waitForFunction(
        () => document.querySelector('.pv__tab--on')?.textContent.trim() === 'Kindle',
      );
      await sleep(10000);
    };
    const type = async (label) => {
      phase(label);
      const editor = await page.$('p[contenteditable="true"]');
      assert.ok(editor, 'Paragraph editor missing');
      await editor.click();
      await page.keyboard.press('End');
      const text = ' texto de benchmark';
      const end = performance.now() + seconds * 1000;
      let characters = 0;
      while (performance.now() < end) {
        const char = text[characters % text.length];
        await page.keyboard.type(char);
        characters++;
        await sleep(200);
      }
      timings[`${label}Characters`] = characters;
      assert.ok(
        await page.evaluate(() => document.title.includes('*')),
        'Typing did not mark document dirty',
      );
    };
    await open(samplePath, sample.metadata.title, 'sample_open');
    phase('sample_idle');
    await sleep(seconds * 1000);
    await type('sample_typing');
    phase('sample_after_typing');
    await sleep(seconds * 1000);
    phase('sample_pagination');
    const paginated = performance.now();
    await page.$$eval('.pv__tab', (tabs) =>
      tabs.find((t) => t.textContent.trim() === 'Papel').click(),
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('iframe')
          ?.contentDocument?.querySelector('[data-vivliostyle-page-container]'),
      { timeout: 90000 },
    );
    let previous = 0,
      stable = 0,
      pages = 0;
    for (let i = 0; i < 90; i++) {
      await sleep(1000);
      pages = await page.evaluate(
        () =>
          document
            .querySelector('iframe')
            ?.contentDocument?.querySelectorAll('[data-vivliostyle-page-container]').length || 0,
      );
      stable = pages > 0 && pages === previous ? stable + 1 : 0;
      previous = pages;
      if (stable >= 5) break;
    }
    assert.ok(stable >= 5, 'Pagination did not stabilize');
    timings.paginationMs = performance.now() - paginated;
    timings.samplePages = pages;
    phase('sample_print_idle');
    await sleep(seconds * 1000);
    await page.$$eval('.pv__tab', (tabs) =>
      tabs.find((t) => t.textContent.trim() === 'Kindle').click(),
    );
    await open(largePath, large.metadata.title, 'large_open');
    phase('large_idle');
    await sleep(seconds * 1000);
    await type('large_typing');
    phase('large_after_typing');
    await sleep(seconds * 1000);
    await page.screenshot({ path: path.join(dir, 'large-editor.png') });
    assert.equal(errors.length, 0, `Application errors: ${errors.join('; ')}`);
    results.push({ run, timings, errors });
  } finally {
    fs.writeFileSync(stopFile, 'stop');
    if (sampler.exitCode === null) await Promise.race([once(sampler, 'exit'), sleep(10000)]);
    if (browser) {
      try {
        const page = (await browser.pages()).find((p) => /tauri/.test(p.url()));
        await page?.evaluate(() => window.desktopAPI.confirmClose());
      } catch {}
      browser.disconnect();
    }
    if (app.exitCode === null) await Promise.race([once(app, 'exit'), sleep(10000)]);
    if (app.exitCode === null) app.kill();
    assert.ok(sampler.exitCode === 0, `Sampler failed (${sampler.exitCode}): ${samplerError}`);
  }
  const samples = fs
    .readFileSync(path.join(dir, 'samples.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.ok(samples.length > 5, 'Insufficient process samples');
  results.at(-1).phases = summarize(samples, metadata.logicalProcessors);
  fs.writeFileSync(
    path.join(output, 'results.json'),
    JSON.stringify({ metadata, results }, null, 2),
  );
  await sleep(3000);
}
console.log(JSON.stringify({ output, results }, null, 2));

function summarize(samples, processors) {
  const phases = {};
  for (let i = 1; i < samples.length; i++) {
    const s = samples[i],
      prev = samples[i - 1];
    if (s.phase !== prev.phase) continue;
    const elapsed = s.seconds - prev.seconds,
      delta = s.cpuSeconds - prev.cpuSeconds;
    assert.ok(elapsed > 0 && delta >= 0, 'Invalid process counter interval');
    const entry = (phases[s.phase] ||= {
      seconds: 0,
      cpuSeconds: 0,
      samples: 0,
      cpuPeakMachinePct: 0,
      workingSetSumMiB: 0,
      workingSetPeakMiB: 0,
      privateSumMiB: 0,
      privatePeakMiB: 0,
      processPeak: 0,
    });
    const ws = s.processes.reduce((sum, p) => sum + p.workingSetBytes, 0) / 2 ** 20;
    const priv = s.processes.reduce((sum, p) => sum + p.privateBytes, 0) / 2 ** 20;
    entry.seconds += elapsed;
    entry.cpuSeconds += delta;
    entry.samples++;
    entry.cpuPeakMachinePct = Math.max(
      entry.cpuPeakMachinePct,
      (delta / elapsed / processors) * 100,
    );
    entry.workingSetSumMiB += ws * elapsed;
    entry.privateSumMiB += priv * elapsed;
    entry.workingSetPeakMiB = Math.max(entry.workingSetPeakMiB, ws);
    entry.privatePeakMiB = Math.max(entry.privatePeakMiB, priv);
    entry.processPeak = Math.max(entry.processPeak, s.processes.length);
  }
  return Object.fromEntries(
    Object.entries(phases).map(([name, p]) => [
      name,
      {
        ...p,
        cpuMeanMachinePct: (p.cpuSeconds / p.seconds / processors) * 100,
        cpuMeanOneCorePct: (p.cpuSeconds / p.seconds) * 100,
        workingSetMeanMiB: p.workingSetSumMiB / p.seconds,
        privateMeanMiB: p.privateSumMiB / p.seconds,
      },
    ]),
  );
}
