import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function encryptionKey() {
  const raw=String(process.env.LEDGERLY_ENCRYPTION_KEY||'').trim();
  const key=/^[\da-f]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
  if(key.length!==32)throw Object.assign(new Error('Workspace SMTP credential encryption is not configured. Set LEDGERLY_ENCRYPTION_KEY to a random 32-byte key on the API server.'),{status:503});
  return key;
}

export function encryptSecret(value) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv),encrypted=Buffer.concat([cipher.update(String(value),'utf8'),cipher.final()]);
  return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}

export function decryptSecret(value) {
  if(!value)return '';
  const [iv,tag,payload]=String(value).split('.');
  try{const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64'));decipher.setAuthTag(Buffer.from(tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(payload,'base64')),decipher.final()]).toString('utf8');}
  catch(error){if(error.status)throw error;throw Object.assign(new Error('Could not decrypt workspace SMTP credentials. Check that LEDGERLY_ENCRYPTION_KEY has not changed.'),{status:503});}
}
