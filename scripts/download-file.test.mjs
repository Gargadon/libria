import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { downloadFile } from './download-file.mjs';

async function withServer(handler, run) {
  const directory = mkdtempSync(path.join(tmpdir(), 'libria-download-'));
  const server = http.createServer(handler);
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    await run(`http://127.0.0.1:${server.address().port}`, path.join(directory, 'installer.exe'), directory);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
}

test('follows redirects and replaces incomplete existing downloads only after success', async () => {
  await withServer((request, response) => {
    if (request.url === '/') response.writeHead(302, { Location: '/installer?signature=private' }).end();
    else response.end('complete installer');
  }, async (url, destination, directory) => {
    writeFileSync(destination, 'incomplete');
    const logs = [];
    await downloadFile(url, destination, { log: value => logs.push(value) });
    assert.equal(readFileSync(destination, 'utf8'), 'complete installer');
    assert.deepEqual(readdirSync(directory), ['installer.exe']);
    assert.ok(logs.every(value => !value.includes('signature=private')));
  });
});

test('retries HTTP errors and writes only the successful response', async () => {
  let requests = 0;
  await withServer((request, response) => {
    if (++requests === 1) response.writeHead(503).end('unavailable');
    else response.end('installer');
  }, async (url, destination) => {
    await downloadFile(url, destination, { log: () => {} });
    assert.equal(requests, 2);
    assert.equal(readFileSync(destination, 'utf8'), 'installer');
  });
});

test('stalled response bodies time out and leave no partial downloads', async () => {
  await withServer((request, response) => {
    response.writeHead(200);
    response.write('partial');
  }, async (url, destination, directory) => {
    await assert.rejects(downloadFile(url, destination, { timeout: 200, attempts: 1, log: () => {} }), /agotado/);
    assert.deepEqual(readdirSync(directory), []);
  });
});

test('truncated transfers are rejected without replacing a previous complete file', async () => {
  await withServer((request, response) => {
    response.writeHead(200, { 'Content-Length': '100' });
    response.end('truncated');
    response.socket?.destroySoon();
  }, async (url, destination, directory) => {
    writeFileSync(destination, 'previous complete file');
    await assert.rejects(downloadFile(url, destination, { timeout: 500, attempts: 1, log: () => {} }));
    assert.equal(readFileSync(destination, 'utf8'), 'previous complete file');
    assert.deepEqual(readdirSync(directory), ['installer.exe']);
  });
});
