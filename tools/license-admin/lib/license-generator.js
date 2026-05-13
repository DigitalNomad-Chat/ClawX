/**
 * Shared license generation logic (Ed25519 + Binary Payload + Base58)
 */
const { createPrivateKey, sign, createHash } = require('crypto');
const { readFileSync, writeFileSync, existsSync } = require('fs');
const { join } = require('path');

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(buffer) {
  if (buffer.length === 0) return '';
  let leadingZeros = 0;
  while (leadingZeros < buffer.length && buffer[leadingZeros] === 0) leadingZeros++;
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
  for (let i = 0; i < leadingZeros; i++) result += BASE58_ALPHABET[0];
  for (let i = digits.length - 1; i >= 0; i--) result += BASE58_ALPHABET[digits[i]];
  return result;
}

function daysSince2024_01_01(date) {
  const base = new Date('2024-01-01T00:00:00Z');
  return Math.floor((date.getTime() - base.getTime()) / (1000 * 60 * 60 * 24));
}

function machineCodeToFingerprint(machineCode) {
  // Machine code format: XXXX-XXXX-XXXX-XXXX (16 hex chars = 8 bytes)
  const hex = machineCode.replace(/-/g, '').toLowerCase();
  if (hex.length !== 16 || !/^[0-9a-f]{16}$/.test(hex)) {
    throw new Error('Invalid machine code format. Expected XXXX-XXXX-XXXX-XXXX');
  }
  return Buffer.from(hex, 'hex');
}

function packPayload(machineCode, days, edition) {
  const payload = Buffer.alloc(20);
  payload.writeUInt8(0x01, 0);
  payload.writeUInt16BE(0x0001, 1);
  const editionMap = { standard: 0x01, pro: 0x02, enterprise: 0x03 };
  payload.writeUInt8(editionMap[edition] || 0x01, 3);
  let expiryDays = 0;
  if (days > 0) {
    expiryDays = daysSince2024_01_01(new Date()) + days;
  }
  payload.writeUInt32BE(expiryDays, 4);
  const fp = machineCodeToFingerprint(machineCode);
  fp.copy(payload, 8, 0, 8);
  payload.writeUInt32BE(Math.floor(Math.random() * 0xFFFFFFFF), 16);
  return payload;
}

function generateLicense(privateKeyPem, machineCode, days, edition) {
  const payload = packPayload(machineCode, days, edition);
  const privateKey = createPrivateKey(privateKeyPem);
  const signature = sign(null, payload, privateKey);
  return {
    license: `${base58Encode(payload)}.${base58Encode(signature)}`,
    serial: payload.readUInt32BE(16).toString(16).padStart(8, '0').toUpperCase(),
    expiryDays: payload.readUInt32BE(4),
  };
}

function loadPrivateKey(projectRoot) {
  const keyPath = join(projectRoot, 'scripts', 'private.pem');
  return readFileSync(keyPath, 'utf8');
}

function loadDatabase(projectRoot) {
  const dbPath = join(projectRoot, 'scripts', 'issued-licenses.json');
  return existsSync(dbPath) ? JSON.parse(readFileSync(dbPath, 'utf8')) : [];
}

function saveDatabase(projectRoot, records) {
  const dbPath = join(projectRoot, 'scripts', 'issued-licenses.json');
  writeFileSync(dbPath, JSON.stringify(records, null, 2));
}

function addLicenseRecord(projectRoot, record) {
  const db = loadDatabase(projectRoot);
  db.push(record);
  saveDatabase(projectRoot, db);
  return db;
}

module.exports = {
  generateLicense,
  computeMasterFingerprint,
  loadPrivateKey,
  loadDatabase,
  saveDatabase,
  addLicenseRecord,
};
