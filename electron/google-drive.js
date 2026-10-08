const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { openCredentials } = require('./credential-blob');
const CLIENT_ID = '109920984385-nj300o5c59enim5n2vicbo23p4khhs84.apps.googleusercontent.com';
const MAX_BYTES = 100 * 1024 * 1024;

function loadConfig(app, env = process.env) {
  let config = {};
  for (const file of [path.join(app.getPath('userData'), 'google-drive-config.json'), path.join(app.getAppPath(), 'google-drive-config.json')]) {
    if (!fs.existsSync(file)) continue;
    try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch { throw new Error('google-drive-config.json no contiene JSON válido.'); }
    break;
  }
  let bundled;
  const getBundled = () => bundled ??= openCredentials(require('./google-drive-credentials.cjs'));
  const clientId = env.LIBRIA_GOOGLE_CLIENT_ID || config.client_id || getBundled()?.clientId || CLIENT_ID;
  // Never combine a different client's ID with the bundled client's secret.
  const clientSecret = env.LIBRIA_GOOGLE_CLIENT_SECRET || config.client_secret ||
    (getBundled()?.clientId === clientId ? getBundled()?.clientSecret : '') || '';
  if (typeof clientId !== 'string' || !clientId.endsWith('.apps.googleusercontent.com') || typeof clientSecret !== 'string') {
    throw new Error('Configuración OAuth inválida.');
  }
  return { clientId, clientSecret };
}

function createGoogleDrive({ app, shell, safeStorage, fetchImpl = fetch, getConfig = () => loadConfig(app) }) {
  const tokenPath = path.join(app.getPath('userData'), 'google-drive-tokens.bin');
  let session = null, controller = null, refreshing = null, generation = 0;
  const controllers = new Set();
  function assertEncryption() {
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('No hay un almacén seguro de credenciales disponible. Activa el llavero del sistema.');
    }
  }
  function restore() {
    if (session || !fs.existsSync(tokenPath)) return;
    assertEncryption();
    try {
      const saved = JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenPath)));
      if (saved.clientId === getConfig().clientId && typeof saved.refreshToken === 'string') session = saved;
    } catch { throw new Error('No se pudieron recuperar las credenciales de Drive. Desconecta y vuelve a conectar.'); }
  }
  function persist(value) {
    assertEncryption();
    fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
    const temp = tokenPath + '.tmp';
    try {
      fs.writeFileSync(temp, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 });
      fs.renameSync(temp, tokenPath);
    } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
  }
  async function request(url, options = {}, limit = MAX_BYTES) {
    const pending = new AbortController();
    controllers.add(pending);
    const signal = AbortSignal.any([AbortSignal.timeout(30000), pending.signal, ...(options.signal ? [options.signal] : [])]);
    try {
      const response = await fetchImpl(url, { ...options, signal, redirect: 'error' });
      if (Number(response.headers.get('content-length')) > limit) throw new Error('El archivo supera el tamaño permitido.');
      const chunks = [];
      let size = 0;
      if (response.body) for await (const chunk of response.body) {
        size += chunk.length;
        if (size > limit) throw new Error('La respuesta supera el tamaño permitido.');
        chunks.push(Buffer.from(chunk));
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!response.ok) {
        let code = '';
        try { const data = JSON.parse(text); code = typeof data.error === 'string' ? data.error : data.error?.status || ''; } catch {}
        // Do not log response bodies: they may contain credentials or document content.
        if (code === 'invalid_grant') {
          session = null;
          if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
          throw new Error('La autorización de Google caducó o fue revocada. Conecta de nuevo.');
        }
        const safeCode = /^[A-Za-z0-9_]{1,64}$/.test(code) ? code : '';
        throw new Error(`Google Drive: HTTP ${response.status}${safeCode ? ' (' + safeCode + ')' : ''}.`);
      }
      return text;
    } finally { controllers.delete(pending); }
  }
  async function token(fields, signal) {
    const config = getConfig();
    if (!config.clientSecret.trim()) throw new Error('Añade client_secret en google-drive-config.json y reinicia Libria.');
    const data = JSON.parse(await request('https://oauth2.googleapis.com/token', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...fields }),
    }, 1024 * 1024));
    if (typeof data.access_token !== 'string' || !Number.isFinite(Number(data.expires_in))) throw new Error('Respuesta OAuth inválida.');
    return data;
  }
  async function accessToken() {
    restore();
    if (!session) throw new Error('Conecta una cuenta de Google Drive primero.');
    if (session.accessToken && session.expiresAt > Date.now() + 60000) return session.accessToken;
    if (!refreshing) {
      const previous = session, epoch = generation;
      refreshing = (async () => {
        const data = await token({ grant_type: 'refresh_token', refresh_token: previous.refreshToken });
        if (epoch !== generation) throw new Error('La cuenta fue desconectada.');
        const updated = { ...previous, accessToken: data.access_token, refreshToken: data.refresh_token || previous.refreshToken,
          expiresAt: Date.now() + Number(data.expires_in) * 1000 };
        persist(updated);
        session = updated;
        return updated.accessToken;
      })().finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  async function api(route, options = {}, upload = false) {
    const epoch = generation, bearer = await accessToken();
    if (epoch !== generation) throw new Error('La cuenta fue desconectada.');
    const text = await request('https://www.googleapis.com/' + (upload ? 'upload/' : '') + 'drive/v3/' + route,
      { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + bearer } });
    if (epoch !== generation) throw new Error('La cuenta fue desconectada.');
    return text;
  }
  function status() {
    const config = getConfig();
    restore();
    return { configured: !!config.clientSecret.trim(), connected: !!session, account: session?.account || null,
      writable: session?.scope?.split(' ').includes('https://www.googleapis.com/auth/drive') || false };
  }
  async function connect() {
    if (controller) throw new Error('Ya hay una conexión en curso.');
    const config = getConfig();
    if (!config.clientSecret.trim()) throw new Error('Añade client_secret en google-drive-config.json y reinicia Libria.');
    assertEncryption();
    const active = new AbortController();
    controller = active;
    const epoch = generation, state = crypto.randomBytes(32).toString('base64url');
    const verifier = crypto.randomBytes(64).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    let server, timer;
    try {
      let resolveCode, rejectCode;
      const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
      codePromise.catch(() => {});
      server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        if (req.method !== 'GET' || url.pathname !== '/oauth/callback') { res.writeHead(404); res.end(); return; }
        if (url.searchParams.get('state') !== state) { res.writeHead(400); res.end('Solicitud inválida.'); return; }
        const code = url.searchParams.get('code');
        if (url.searchParams.get('error') || !code) {
          res.end('Conexión cancelada. Puedes volver a Libria.'); rejectCode(new Error('Google no autorizó la conexión.'));
        } else { res.end('Autorización recibida. Vuelve a Libria para completar la conexión.'); resolveCode(code); }
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const redirectUri = `http://127.0.0.1:${server.address().port}/oauth/callback`;
      active.signal.addEventListener('abort', () => rejectCode(new Error('Conexión cancelada.')), { once: true });
      if (active.signal.aborted) throw new Error('Conexión cancelada.');
      timer = setTimeout(() => active.abort(), 180000);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri, response_type: 'code',
        scope: 'https://www.googleapis.com/auth/drive', state, code_challenge: challenge, code_challenge_method: 'S256',
        access_type: 'offline', prompt: 'consent select_account' }).toString();
      await shell.openExternal(url.toString());
      const code = await codePromise;
      const data = await token({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri }, active.signal);
      if (typeof data.refresh_token !== 'string') throw new Error('Google no devolvió un token de renovación. Vuelve a autorizar.');
      const about = JSON.parse(await request('https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)', {
        signal: active.signal, headers: { Authorization: 'Bearer ' + data.access_token },
      }, 1024 * 1024));
      active.signal.throwIfAborted();
      if (epoch !== generation) throw new Error('Conexión cancelada.');
      const value = { clientId: config.clientId, accessToken: data.access_token, refreshToken: data.refresh_token, scope: data.scope || '',
        expiresAt: Date.now() + Number(data.expires_in) * 1000,
        account: { name: about.user?.displayName || 'Google Drive', email: about.user?.emailAddress || '' } };
      persist(value);
      generation++;
      for (const pending of controllers) pending.abort();
      session = value;
      return status();
    } finally { clearTimeout(timer); server?.close(); server?.closeAllConnections(); controller = null; }
  }
  async function disconnect() {
    generation++;
    controller?.abort();
    for (const pending of controllers) pending.abort();
    let refreshToken = session?.refreshToken;
    if (!refreshToken && fs.existsSync(tokenPath)) {
      try { assertEncryption(); refreshToken = JSON.parse(safeStorage.decryptString(fs.readFileSync(tokenPath))).refreshToken; } catch {}
    }
    session = null;
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    let revoked = true;
    if (refreshToken) {
      try { await request('https://oauth2.googleapis.com/revoke', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refreshToken }) }, 1024 * 1024); }
      catch { revoked = false; }
    }
    return { revoked };
  }
  async function listFiles(cursor) {
    if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 4096)) throw new Error('Cursor inválido.');
    const query = new URLSearchParams({ q: "trashed = false and mimeType != 'application/vnd.google-apps.folder' and name contains '.libria'",
      fields: 'nextPageToken,files(id,name,modifiedTime,size,capabilities(canDownload))', pageSize: '100', orderBy: 'modifiedTime desc',
      ...(cursor ? { pageToken: cursor } : {}) });
    const data = JSON.parse(await api('files?' + query));
    return { files: (data.files || []).filter(file => file.name.toLowerCase().endsWith('.libria')), nextPageToken: data.nextPageToken || null };
  }
  async function readFile(id, forceRemote = false) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(id)) throw new Error('Identificador de archivo inválido.');
    const account = status().account?.email || '';
    if (account && !forceRemote) {
      const destination = path.join(cacheRoot, crypto.createHash('sha256').update(account).digest('hex'), id + '.libria');
      const link = cachedLink(destination);
      if (link?.baseline && fs.existsSync(destination)) {
        const content = fs.readFileSync(destination, 'utf8');
        if (content !== link.baseline) return { ...link, content };
      }
    }
    const metadata = await fileMetadata(id);
    assertAccount(account);
    if (!metadata.name?.toLowerCase().endsWith('.libria') || metadata.capabilities?.canDownload === false) throw new Error('El archivo no es un documento .libria descargable.');
    if (Number(metadata.size) > MAX_BYTES) throw new Error('El archivo supera 100 MB.');
    const content = await api(`files/${id}?alt=media`);
    const after = await fileMetadata(id);
    assertAccount(account);
    if (metadata.version !== after.version) throw new Error('El documento cambió durante la descarga. Inténtalo de nuevo.');
    if (metadata.md5Checksum && crypto.createHash('md5').update(content).digest('hex') !== metadata.md5Checksum) {
      throw new Error('La descarga no coincide con la versión de Drive. Inténtalo de nuevo.');
    }
    return { id, name: metadata.name, content, version: metadata.version, account };
  }
  async function fileMetadata(id) {
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(id)) throw new Error('Identificador inválido.');
    return JSON.parse(await api(`files/${id}?fields=id,name,size,version,md5Checksum,trashed,capabilities(canDownload,canEdit)`));
  }
  function assertAccount(account) {
    if (!account || status().account?.email !== account) throw new Error('Conecta la cuenta de Drive de este documento.');
  }
  function validateContent(content) {
    if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_BYTES) throw new Error('El documento supera 100 MB.');
    const document = JSON.parse(content);
    if (!document || typeof document.libriaVersion !== 'string') throw new Error('Documento Libria inválido.');
  }
  async function writeFile(id, version, content, account) {
    assertAccount(account);
    validateContent(content);
    if (!status().writable) throw new Error('Vuelve a conectar Drive para autorizar el guardado y la sincronización.');
    const metadata = await fileMetadata(id);
    if (!version || metadata.version !== version) return { conflict: true };
    assertAccount(account);
    if (metadata.trashed || metadata.capabilities?.canEdit === false) throw new Error('No se puede editar este archivo en Drive.');
    if (!metadata.name?.toLowerCase().endsWith('.libria')) throw new Error('El archivo no es un documento .libria.');
    // Version checks detect observed changes; Drive v3 does not document an
    // atomic compare-and-swap for media uploads. Local copies remain available.
    const result = JSON.parse(await api(`files/${id}?uploadType=media&fields=id,name,version,md5Checksum`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: content }, true));
    if (!result.version || (result.md5Checksum && result.md5Checksum !== crypto.createHash('md5').update(content).digest('hex'))) {
      throw new Error('No se pudo confirmar la versión guardada en Drive. La copia local permanece intacta.');
    }
    return { conflict: false, ...result, account };
  }
  async function createFile(name, content) {
    validateContent(content);
    if (!status().writable) throw new Error('Vuelve a conectar Drive para autorizar el guardado y la sincronización.');
    if (typeof name !== 'string' || name.length > 200 || !name.toLowerCase().endsWith('.libria')) throw new Error('Nombre inválido.');
    const boundary = 'libria_' + crypto.randomBytes(24).toString('hex');
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
    const result = JSON.parse(await api('files?uploadType=multipart&fields=id,name,version',
      { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body }, true));
    return { ...result, account: status().account?.email || '' };
  }
  const cacheRoot = path.join(app.getPath('userData'), 'drive-cache');
  function cacheFile(link, content) {
    validateContent(content);
    if (!link || typeof link.account !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(link.id)) throw new Error('Vínculo inválido.');
    const directory = path.join(cacheRoot, crypto.createHash('sha256').update(link.account).digest('hex'));
    fs.mkdirSync(directory, { recursive: true });
    const destination = path.join(directory, link.id + '.libria');
    fs.writeFileSync(destination + '.tmp', content, { mode: 0o600 });
    fs.renameSync(destination + '.tmp', destination);
    const sidecar = { id: link.id, name: link.name, account: link.account, version: link.version, baseline: link.baseline };
    fs.writeFileSync(destination + '.link.json.tmp', JSON.stringify(sidecar), { mode: 0o600 });
    fs.renameSync(destination + '.link.json.tmp', destination + '.link.json');
    return destination;
  }
  function cachedLink(destination) {
    if (typeof destination !== 'string') return null;
    const relative = path.relative(cacheRoot, path.resolve(destination));
    if (relative.startsWith('..') || path.isAbsolute(relative) || !destination.endsWith('.libria')) return null;
    try { return JSON.parse(fs.readFileSync(destination + '.link.json', 'utf8')); } catch { return null; }
  }
  return { status, connect, disconnect, listFiles, readFile, fileMetadata, writeFile, createFile, cacheFile, cachedLink, cancel: () => controller?.abort(),
    dispose: () => { controller?.abort(); for (const pending of controllers) pending.abort(); } };
}
module.exports = { createGoogleDrive, loadConfig };
