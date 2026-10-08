const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createGoogleDrive, loadConfig } = require('./google-drive');

const clientId = 'example.apps.googleusercontent.com';
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'libria-drive-test-'));
  const app = { getPath: () => directory, getAppPath: () => directory };
  // Test-only reversible encoding; the production implementation uses Electron safeStorage.
  const safeStorage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'test',
    encryptString: text => Buffer.from(text).reverse(), decryptString: value => Buffer.from(value).reverse().toString() };
  const calls = [];
  let authorization;
  const dependencies = {
    app, safeStorage, getConfig: () => ({ clientId, clientSecret: 'fixture-secret' }),
    shell: { async openExternal(value) {
      authorization = new URL(value);
      const callback = new URL(authorization.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({ code: 'fixture-code', state: authorization.searchParams.get('state') });
      const result = await fetch(callback);
      assert.equal(result.status, 200);
    } },
    async fetchImpl(url, options) {
      calls.push({ url, options });
      if (url.endsWith('/token')) return response({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive' });
      if (url.includes('/about?')) return response({ user: { displayName: 'Writer', emailAddress: 'writer@example.test' } });
      if (url.endsWith('/revoke')) return new Response('');
      if (url.includes('/files?')) return response({ files: [{ id: 'book-1', name: 'Book.libria' }, { id: 'other', name: 'Book.libria.txt' }], nextPageToken: 'next-page' });
      if (url.endsWith('?alt=media')) return new Response('{"libriaVersion":"1.10.0"}');
      if (url.includes('/files/book-1?')) return response({ id: 'book-1', name: 'Book.libria', version: '1', size: '30', capabilities: { canDownload: true } });
      throw new Error('Unexpected request');
    }, ...overrides,
  };
  const drive = createGoogleDrive(dependencies);
  t.after(() => { drive.dispose(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { drive, directory, app, safeStorage, calls, dependencies, authorization: () => authorization };
}

test('authorization sends client_secret and matching PKCE, restores session without exposing tokens', async t => {
  const f = fixture(t);
  assert.equal(f.drive.status().connected, false);
  const status = await f.drive.connect();
  assert.equal(status.account.email, 'writer@example.test');
  assert.equal(JSON.stringify(status).includes('fixture-access'), false);
  const request = f.calls.find(call => call.url.endsWith('/token'));
  assert.equal(request.options.body.get('client_secret'), 'fixture-secret');
  assert.equal(request.options.body.get('grant_type'), 'authorization_code');
  const challenge = crypto.createHash('sha256').update(request.options.body.get('code_verifier')).digest('base64url');
  assert.equal(challenge, f.authorization().searchParams.get('code_challenge'));
  assert.equal(f.authorization().searchParams.get('code_challenge_method'), 'S256');
  assert.equal(f.authorization().searchParams.has('client_secret'), false);
  assert.equal(request.options.body.get('redirect_uri'), f.authorization().searchParams.get('redirect_uri'));
  const restored = createGoogleDrive(f.dependencies);
  t.after(() => restored.dispose());
  assert.deepEqual(restored.status(), status);
  assert.equal(fs.readFileSync(path.join(f.directory, 'google-drive-tokens.bin'), 'utf8').includes('fixture-refresh'), false);
});

test('lists only .libria files with pagination and downloads original content', async t => {
  const f = fixture(t);
  await f.drive.connect();
  const page = await f.drive.listFiles('page-two');
  assert.equal(page.files.length, 1);
  assert.equal(page.nextPageToken, 'next-page');
  const listRequest = new URL(f.calls.find(call => call.url.includes('/files?')).url);
  assert.equal(listRequest.searchParams.get('pageToken'), 'page-two');
  const file = await f.drive.readFile('book-1');
  assert.equal(file.name, 'Book.libria');
  assert.equal(file.content, '{"libriaVersion":"1.10.0"}');
  await assert.rejects(f.drive.readFile('../escape'), /inválido/);
});

test('refresh includes secret and coalesces concurrent requests', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, 'google-drive-tokens.bin'), f.safeStorage.encryptString(JSON.stringify({ clientId,
    refreshToken: 'saved-refresh', expiresAt: 0, account: { name: 'Writer', email: '' } })));
  await Promise.all([f.drive.listFiles(), f.drive.listFiles()]);
  const calls = f.calls.filter(call => call.url.endsWith('/token'));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.body.get('grant_type'), 'refresh_token');
  assert.equal(calls[0].options.body.get('client_secret'), 'fixture-secret');
});

test('missing secret and insecure keyring fail before browser authorization', async t => {
  let opened = false;
  const f = fixture(t, { getConfig: () => ({ clientId, clientSecret: '' }), shell: { openExternal() { opened = true; } } });
  await assert.rejects(f.drive.connect(), /client_secret/);
  assert.equal(opened, false);
  const insecure = fixture(t, { safeStorage: { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' } });
  await assert.rejects(insecure.drive.connect(), /almacén seguro/);
});

test('rejects mismatched OAuth state, then accepts the correct callback', async t => {
  const f = fixture(t, { shell: { async openExternal(value) {
    const auth = new URL(value), callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.search = new URLSearchParams({ code: 'attack-code', state: 'wrong' });
    assert.equal((await fetch(callback)).status, 400);
    callback.search = new URLSearchParams({ code: 'good-code', state: auth.searchParams.get('state') });
    assert.equal((await fetch(callback)).status, 200);
  } } });
  await f.drive.connect();
  assert.equal(f.calls.find(call => call.url.endsWith('/token')).options.body.get('code'), 'good-code');
});

test('cancels authorization and closes callback listener', async t => {
  let notifyOpened;
  const opened = new Promise(resolve => { notifyOpened = resolve; });
  let callback;
  const f = fixture(t, { shell: { async openExternal(url) { callback = new URL(url).searchParams.get('redirect_uri'); notifyOpened(); } } });
  const connecting = f.drive.connect();
  await opened;
  f.drive.cancel();
  await assert.rejects(connecting, /cancelada/);
  await assert.rejects(fetch(callback));
  assert.equal(f.calls.length, 0);
});

test('disconnect removes persisted tokens even if remote revocation fails', async t => {
  const f = fixture(t);
  await f.drive.connect();
  const revokeFailure = createGoogleDrive({ ...f.dependencies, fetchImpl: async () => response({ error: 'server_error' }, 500) });
  t.after(() => revokeFailure.dispose());
  const result = await revokeFailure.disconnect();
  assert.equal(result.revoked, false);
  assert.equal(revokeFailure.status().connected, false);
  assert.equal(fs.existsSync(path.join(f.directory, 'google-drive-tokens.bin')), false);
});

test('oversized documents are rejected before download', async t => {
  const f = fixture(t);
  await f.drive.connect();
  const tooLarge = createGoogleDrive({ ...f.dependencies, fetchImpl: async () => response({ name: 'Huge.libria', size: String(101 * 1024 * 1024) }) });
  t.after(() => tooLarge.dispose());
  await assert.rejects(tooLarge.readFile('book-1'), /100 MB/);
});

test('configuration supports local JSON and environment overrides', t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, 'google-drive-config.json'), JSON.stringify({ client_id: clientId, client_secret: 'local-secret' }));
  assert.equal(loadConfig(f.app, {}).clientSecret, 'local-secret');
  assert.equal(loadConfig(f.app, { LIBRIA_GOOGLE_CLIENT_SECRET: 'env-secret' }).clientSecret, 'env-secret');
});

test('refuses conflicting writes and never uploads to a different account', async t => {
  const f = fixture(t);
  await f.drive.connect();
  const content = '{"libriaVersion":"1.10.0"}';
  assert.deepEqual(await f.drive.writeFile('book-1', 'old', content, 'writer@example.test'), { conflict: true });
  await assert.rejects(f.drive.writeFile('book-1', '1', content, 'other@example.test'), /cuenta/);
  assert.equal(f.calls.some(call => call.options.method === 'PATCH'), false);
});

test('uploads native content and persists the remote link separately from the document', async t => {
  const f = fixture(t);
  await f.drive.connect();
  let uploaded;
  const content = '{"libriaVersion":"1.10.0"}';
  const drive = createGoogleDrive({ ...f.dependencies, fetchImpl: async (url, options) => {
    if (options.method === 'PATCH') {
      uploaded = options.body;
      return response({ id: 'book-1', name: 'Book.libria', version: '2', md5Checksum: crypto.createHash('md5').update(content).digest('hex') });
    }
    return f.dependencies.fetchImpl(url, options);
  } });
  t.after(() => drive.dispose());
  const result = await drive.writeFile('book-1', '1', content, 'writer@example.test');
  assert.equal(result.version, '2');
  assert.equal(uploaded, content);
  const link = { ...result, baseline: content };
  const destination = drive.cacheFile(link, content);
  assert.equal(fs.readFileSync(destination, 'utf8'), content);
  assert.equal(drive.cachedLink(destination).version, '2');
  assert.equal(drive.cachedLink(path.join(f.directory, 'unrelated.libria')), null);
  await assert.rejects(drive.writeFile('book-1', '2', content, 'writer@example.test').then(result => {
    if (result.conflict) throw new Error('conflict');
  }), /conflict/);
});

test('rejects downloads that changed between metadata and media requests', async t => {
  const f = fixture(t);
  await f.drive.connect();
  let count = 0;
  const drive = createGoogleDrive({ ...f.dependencies, fetchImpl: async (url, options) => {
    if (url.includes('/files/book-1?fields=')) return response({ name: 'Book.libria', version: String(++count) });
    return f.dependencies.fetchImpl(url, options);
  } });
  t.after(() => drive.dispose());
  await assert.rejects(drive.readFile('book-1'), /durante la descarga/);
});

test('read-only sessions must be reauthorized before uploading', async t => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, 'google-drive-tokens.bin'), f.safeStorage.encryptString(JSON.stringify({ clientId,
    refreshToken: 'saved-refresh', accessToken: 'saved-access', expiresAt: Date.now() + 3600000,
    scope: 'https://www.googleapis.com/auth/drive.readonly', account: { email: 'writer@example.test' } })));
  assert.equal(f.drive.status().writable, false);
  await assert.rejects(f.drive.createFile('Book.libria', '{"libriaVersion":"1.10.0"}'), /Vuelve a conectar/);
});

test('opening from Drive recovers unsynchronized local edits instead of overwriting them', async t => {
  const f = fixture(t);
  await f.drive.connect();
  const baseline = '{"libriaVersion":"1.10.0"}';
  const content = '{"libriaVersion":"1.10.0","metadata":{"title":"Offline edit"}}';
  f.drive.cacheFile({ id: 'book-1', name: 'Book.libria', version: '1', account: 'writer@example.test', baseline }, content);
  const before = f.calls.length;
  const recovered = await f.drive.readFile('book-1');
  assert.equal(recovered.content, content);
  assert.equal(recovered.baseline, baseline);
  assert.equal(f.calls.length, before);
  const remote = await f.drive.readFile('book-1', true);
  assert.equal(remote.content, baseline);
});
