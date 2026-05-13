#!/usr/bin/env node
/**
 * License Code Generator (Ed25519 + Binary Payload + Base58)
 *
 * Usage:
 *   node scripts/generate-license.mjs --machine XXXX-XXXX-XXXX-XXXX [--days 365] [--edition pro]
 *
 * Output:
 *   <payload_base58>.<signature_base58>  (~115 chars)
 */

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer) {
  if (buffer.length === 0) return '';

  let leadingZeros = 0;
  while (leadingZeros < buffer.length && buffer[leadingZeros] === 0) {
    leadingZeros++;
  }

  const digits = [];
  for (let i = 0; i < buffer.length; i++) {
    let carry = buffer[i];
    for (let j = 0; j < digits.length; j++) {
      carry += 256 * digits[j];
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  let result = '';
  for (let i = 0; i < leadingZeros; i++) {
    result += BASE58_ALPHABET[0];
  }
  for (let i = digits.length - 1; i >= 0; i--) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

function machineCodeToFingerprint(machineCode) {
  // Machine code format: XXXX-XXXX-XXXX-XXXX (16 hex chars = 8 bytes)
  const hex = machineCode.replace(/-/g, '').toLowerCase();
  if (hex.length !== 16 || !/^[0-9a-f]{16}$/.test(hex)) {
    throw new Error('Invalid machine code format. Expected XXXX-XXXX-XXXX-XXXX');
  }
  return Buffer.from(hex, 'hex');
}

function daysSince2024_01_01(date) {
  const base = new Date('2024-01-01T00:00:00Z');
  const diffMs = date.getTime() - base.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function packPayload(machineCode, days, edition) {
  const payload = Buffer.alloc(20);

  // Byte 0: version
  payload.writeUInt8(0x01, 0);

  // Byte 1-2: product_id (uint16 BE)
  payload.writeUInt16BE(0x0001, 1);

  // Byte 3: edition
  const editionMap = { standard: 0x01, pro: 0x02, enterprise: 0x03 };
  payload.writeUInt8(editionMap[edition] || 0x01, 3);

  // Byte 4-7: expiry_days (uint32 BE)
  // 0 = perpetual, otherwise days since 2024-01-01
  let expiryDays = 0;
  if (days > 0) {
    const now = new Date();
    expiryDays = daysSince2024_01_01(now) + days;
  }
  payload.writeUInt32BE(expiryDays, 4);

  // Byte 8-15: machine_fingerprint (8 bytes from machine code)
  const fp = machineCodeToFingerprint(machineCode);
  fp.copy(payload, 8, 0, 8);

  // Byte 16-19: serial (random uint32 BE)
  payload.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 16);

  return payload;
}

function generateLicense(privateKeyPem, machineCode, days, edition) {
  const payload = packPayload(machineCode, days, edition);
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, payload, privateKey);

  return `${base58Encode(payload)}.${base58Encode(signature)}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = { days: 365, edition: 'standard' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--machine' && args[i + 1]) {
      result.machine = args[i + 1];
      i++;
    } else if (args[i] === '--days' && args[i + 1]) {
      result.days = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--edition' && args[i + 1]) {
      result.edition = args[i + 1];
      i++;
    }
  }
  return result;
}

function main() {
  const args = parseArgs();
  if (!args.machine) {
    console.error('Usage: node scripts/generate-license.mjs --machine XXXX-XXXX-XXXX-XXXX [--days 365] [--edition standard|pro|enterprise]');
    console.error('');
    console.error('Example:');
    console.error('  node scripts/generate-license.mjs --machine 3110-4974-9A41-8937 --days 365 --edition pro');
    process.exit(1);
  }

  // Validate machine code format
  if (!/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/.test(args.machine)) {
    console.error('Error: Machine code must be in format XXXX-XXXX-XXXX-XXXX');
    process.exit(1);
  }

  const privateKeyPath = join(__dirname, 'private.pem');
  let privateKeyPem;
  try {
    privateKeyPem = readFileSync(privateKeyPath, 'utf8');
  } catch (err) {
    console.error(`Failed to read private key at ${privateKeyPath}:`, err.message);
    process.exit(1);
  }

  const license = generateLicense(privateKeyPem, args.machine, args.days, args.edition);
  console.log('\n=== Generated License Code ===\n');
  console.log(license);
  console.log(`\nLength: ${license.length} chars\n`);

  // Verify info
  const payload = packPayload(args.machine, args.days, args.edition);
  const expiryDays = payload.readUInt32BE(4);
  const serial = payload.readUInt32BE(16).toString(16).padStart(8, '0').toUpperCase();

  console.log('Edition:', args.edition);
  console.log('Valid for:', args.days, 'days');
  console.log('Machine code:', args.machine);
  console.log('Expiry days (since 2024-01-01):', expiryDays);
  console.log('Serial:', serial);

  // Save to issued-licenses.json
  const record = {
    uid: serial,
    machine: args.machine,
    edition: args.edition,
    days: args.days,
    expiryDays,
    createdAt: new Date().toISOString(),
    license,
  };

  try {
    const dbPath = join(__dirname, 'issued-licenses.json');
    const db = existsSync(dbPath) ? JSON.parse(readFileSync(dbPath, 'utf8')) : [];
    db.push(record);
    writeFileSync(dbPath, JSON.stringify(db, null, 2));
    console.log('Saved to issued-licenses.json');
  } catch (e) {
    // ignore
  }
}

main();
