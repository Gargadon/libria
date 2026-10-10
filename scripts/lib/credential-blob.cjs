const crypto = require('node:crypto');

// Distribution obfuscation only: both key shares are shipped with the app.
// This does not protect against someone inspecting the source or process memory.
function sealCredentials(credentials) {
  const key = crypto.randomBytes(32);
  const first = crypto.randomBytes(32);
  const second = Buffer.from(key.map((byte, index) => byte ^ first[index]));
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return {
    version: 1,
    shares: [first.toString('hex'), second.toString('hex')],
    nonce: nonce.toString('hex'),
    tag: cipher.getAuthTag().toString('hex'),
    ciphertext: ciphertext.toString('hex'),
  };
}

function openCredentials(blob) {
  if (!blob) return null;
  try {
    const isHex = (value, bytes) => typeof value === 'string' &&
      /^[0-9a-f]+$/.test(value) && value.length === bytes * 2;
    if (blob.version !== 1 || !Array.isArray(blob.shares) || blob.shares.length !== 2 ||
        !blob.shares.every(value => isHex(value, 32)) || !isHex(blob.nonce, 12) || !isHex(blob.tag, 16) ||
        typeof blob.ciphertext !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(blob.ciphertext) || blob.ciphertext.length > 32768) {
      throw new Error();
    }
    const first = Buffer.from(blob.shares[0], 'hex');
    const second = Buffer.from(blob.shares[1], 'hex');
    const key = Buffer.from(first.map((byte, index) => byte ^ second[index]));
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(blob.nonce, 'hex'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'hex'));
    const text = Buffer.concat([decipher.update(Buffer.from(blob.ciphertext, 'hex')), decipher.final()]).toString('utf8');
    const value = JSON.parse(text);
    if (typeof value.clientId !== 'string' || !value.clientId.endsWith('.apps.googleusercontent.com') ||
        typeof value.clientSecret !== 'string' || !value.clientSecret.trim()) throw new Error();
    return value;
  } catch {
    // Never expose decrypted data in an error.
    throw new Error('El blob OAuth incluido está dañado. Regenera las credenciales incluidas.');
  }
}

module.exports = { sealCredentials, openCredentials };
