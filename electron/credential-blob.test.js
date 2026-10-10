const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { sealCredentials, openCredentials } = require('./credential-blob');
const { bundle } = require('../scripts/bundle-google-drive-credentials.cjs');
const { loadConfig } = require('./google-drive');

test('AES-GCM restores credentials and rejects tampering', () => {
  const credentials = { clientId: 'fixture.apps.googleusercontent.com', clientSecret: 'fixture-client-secret' };
  const blob = sealCredentials(credentials);
  assert.deepEqual(openCredentials(blob), credentials);
  assert.equal(JSON.stringify(blob).includes(credentials.clientSecret), false);
  const altered = { ...blob, ciphertext: (blob.ciphertext[0] === 'a' ? 'b' : 'a') + blob.ciphertext.slice(1) };
  assert.throws(() => openCredentials(altered), /dañado/);
  assert.notDeepEqual(sealCredentials(credentials), blob);
});

test('generator emits a working module without plaintext, does not modify input', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'libria-blob-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'config.json'), output = path.join(directory, 'blob.cjs');
  const source = JSON.stringify({ client_id: 'fixture.apps.googleusercontent.com', client_secret: 'test-private-value' });
  fs.writeFileSync(input, source);
  bundle(input, output);
  assert.equal(fs.readFileSync(input, 'utf8'), source);
  assert.equal(fs.readFileSync(output, 'utf8').includes('test-private-value'), false);
  assert.equal(openCredentials(require(output)).clientSecret, 'test-private-value');
});

test('default configuration uses bundled credentials without a local file', () => {
  const app = { getPath: () => '/nonexistent-libria-test-user', getAppPath: () => '/nonexistent-libria-test-app' };
  const bundled = openCredentials(require('./google-drive-credentials.cjs'));
  const config = loadConfig(app, {});
  assert.ok(bundled, 'Generate the credential blob first');
  // Assertions deliberately avoid including real secrets in diagnostic output.
  assert.ok(config.clientId === bundled.clientId);
  assert.ok(config.clientSecret === bundled.clientSecret);
  const custom = loadConfig(app, { LIBRIA_GOOGLE_CLIENT_ID: 'different.apps.googleusercontent.com' });
  assert.equal(custom.clientSecret, '');
});
