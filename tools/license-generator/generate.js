const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const PRIVATE_KEY_PATH = path.join(__dirname, 'keys', 'private.pem');
const PUBLIC_KEY_PATH = path.join(__dirname, 'keys', 'public.pem');

function loadPrivateKey() {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    console.error('错误：未找到私钥文件。请先运行 init-keys.sh 生成密钥对。');
    process.exit(1);
  }
  return fs.readFileSync(PRIVATE_KEY_PATH);
}

function generateLicense(machineCode, type = 'pro', expDate = null) {
  const privateKey = loadPrivateKey();

  const payload = {
    v: 1,
    machine: machineCode,
    type: type,
    iat: new Date().toISOString(),
    exp: expDate,
    uid: `lic_${crypto.randomBytes(8).toString('hex')}`,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(payloadB64);
  const signature = sign.sign(privateKey, 'base64url');

  return `${payloadB64}.${signature}`;
}

function generateObfuscatedKeyCode() {
  if (!fs.existsSync(PUBLIC_KEY_PATH)) {
    console.error('错误：未找到公钥文件。');
    process.exit(1);
  }

  const pubKey = fs.readFileSync(PUBLIC_KEY_PATH);
  const xorKey = 0x5A;

  const encoded = Buffer.alloc(pubKey.length);
  for (let i = 0; i < pubKey.length; i++) {
    encoded[i] = pubKey[i] ^ xorKey;
  }

  const hexArray = Array.from(encoded).map(b => `0x${b.toString(16).padStart(2, '0')}`);

  const chunkSize = 500;
  const chunks = [];
  for (let i = 0; i < hexArray.length; i += chunkSize) {
    chunks.push(hexArray.slice(i, i + chunkSize));
  }

  console.log('\n// 将以下内容替换到 native/src/crypto_utils.cc 中的占位符:\n');

  chunks.forEach((chunk, idx) => {
    console.log(`static const unsigned char kObfPubKeyPart${idx + 1}[] = {`);
    console.log('  ' + chunk.join(', '));
    console.log('};');
    console.log();
  });

  console.log(`// 公钥总长度: ${pubKey.length} 字节`);
  console.log(`// 编码后长度: ${encoded.length} 字节`);
  console.log(`// XOR Key: 0x${xorKey.toString(16).toUpperCase()}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const command = process.argv[2];

if (command === 'encode-key') {
  generateObfuscatedKeyCode();
  rl.close();
} else {
  console.log('=== ClawX 授权码生成工具 ===\n');

  rl.question('请输入用户机器码 (如: CLAWX-XXXX-XXXX-XXXX): ', (machineCode) => {
    if (!machineCode || machineCode.trim().length < 16) {
      console.error('错误：机器码格式无效');
      rl.close();
      return;
    }

    rl.question('授权类型 (pro/enterprise/trial) [默认: pro]: ', (type) => {
      const licenseType = type.trim() || 'pro';

      rl.question('过期日期 (YYYY-MM-DD，留空为永久): ', (exp) => {
        const expDate = exp.trim() || null;

        const license = generateLicense(machineCode, licenseType, expDate);

        console.log('\n=== 生成的授权码 ===');
        console.log(license);
        console.log('\n请将以上授权码发送给用户。');

        const record = {
          uid: JSON.parse(Buffer.from(license.split('.')[0], 'base64url').toString()).uid,
          machine: machineCode,
          type: licenseType,
          exp: expDate,
          createdAt: new Date().toISOString(),
          license: license,
        };

        const dbPath = path.join(__dirname, 'issued-licenses.json');
        const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : [];
        db.push(record);
        fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
        console.log('已记录到 issued-licenses.json');

        rl.close();
      });
    });
  });
}
