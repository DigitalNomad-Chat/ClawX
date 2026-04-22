/**
 * Migrate existing .enc files from 18-byte IV to 12-byte IV
 * Reads each .enc, decrypts with old offset, re-encrypts with new offset
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { createCipheriv, createDecipheriv } from 'crypto';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = resolve(dirname(fileURLToPath(import.meta.url)));
const agentsDir = resolve(__dirname, '..', 'agents');

const ALGORITHM = 'aes-256-gcm';
const OLD_IV = Buffer.from('clawx-kernel12'); // 14 bytes (wrong length from previous migration)
const NEW_IV = Buffer.from('clawx-kernel'); // 12 bytes — AES-GCM standard

function deriveKey() {
  const envKey = process.env.CLAWX_KERNEL_KEY;
  if (envKey) {
    return Buffer.from(envKey.padEnd(32, '0').slice(0, 32));
  }
  const machineId = process.env.MACHINE_ID || 'clawx-default-key-32bytes-long';
  return Buffer.from(machineId.padEnd(32, '0').slice(0, 32));
}

const key = deriveKey();
let migrated = 0;
let failed = 0;

const files = readdirSync(agentsDir).filter(f => f.endsWith('.enc'));

for (const file of files) {
  const filePath = join(agentsDir, file);
  const data = readFileSync(filePath);

  try {
    // Decrypt with OLD 14-byte IV offset (from previous migration)
    const oldIv = data.subarray(0, 14);
    const oldAuthTag = data.subarray(14, 30);
    const oldEncrypted = data.subarray(30);

    const decipher = createDecipheriv(ALGORITHM, key, oldIv);
    decipher.setAuthTag(oldAuthTag);
    const plaintext = Buffer.concat([decipher.update(oldEncrypted), decipher.final()]);

    // Re-encrypt with NEW 12-byte IV
    const cipher = createCipheriv(ALGORITHM, key, NEW_IV);
    const newEncrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const newAuthTag = cipher.getAuthTag();

    // Write: [iv(12)][authTag(16)][encrypted...]
    const newData = Buffer.concat([NEW_IV, newAuthTag, newEncrypted]);
    writeFileSync(filePath, newData);

    console.log(`✓ ${file} migrated`);
    migrated++;
  } catch (err) {
    console.error(`✗ ${file} failed: ${err.message}`);
    failed++;
  }
}

console.log(`\nDone: ${migrated} migrated, ${failed} failed`);
