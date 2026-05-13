import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const files = [
  'dist-electron/main/index.js',
  'dist-electron/preload/index.js',
];

const hashes = {};

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const content = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  hashes[path.basename(file)] = `sha256:${hash}`;
}

fs.mkdirSync('dist-electron/main/security', { recursive: true });
fs.writeFileSync(
  'dist-electron/main/security/integrity-hashes.json',
  JSON.stringify(hashes, null, 2)
);

console.log('Integrity hashes generated:', hashes);
