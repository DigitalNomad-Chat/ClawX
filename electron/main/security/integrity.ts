import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

let EXPECTED_HASHES: Record<string, string> = {};

try {
  const hashFile = path.join(__dirname, 'integrity-hashes.json');
  if (fs.existsSync(hashFile)) {
    EXPECTED_HASHES = JSON.parse(fs.readFileSync(hashFile, 'utf8'));
  }
} catch {
  // 开发模式可能没有哈希文件
}

export function verifyIntegrity(): boolean {
  if (Object.keys(EXPECTED_HASHES).length === 0) return true;

  const asarPath = process.resourcesPath;

  for (const [relativePath, expectedHash] of Object.entries(EXPECTED_HASHES)) {
    const filePath = path.join(asarPath, 'app.asar', 'dist-electron', relativePath);

    if (!fs.existsSync(filePath)) {
      console.error(`Integrity check failed: ${relativePath} missing`);
      return false;
    }

    const content = fs.readFileSync(filePath);
    const actualHash = 'sha256:' + crypto.createHash('sha256').update(content).digest('hex');

    if (actualHash !== expectedHash) {
      console.error(`Integrity check failed: ${relativePath} modified`);
      return false;
    }
  }

  return true;
}
