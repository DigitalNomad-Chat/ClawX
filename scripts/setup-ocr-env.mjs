#!/usr/bin/env zx
/**
 * Setup OCR Python environment using uv.
 *
 * Creates a self-contained Python virtual environment at resources/ocr-env/
 * with RapidOCR and its dependencies, so users don't need system Python.
 *
 * Usage:
 *   node scripts/setup-ocr-env.mjs          # Setup for current platform
 *   node scripts/setup-ocr-env.mjs --all    # Setup for all platforms (CI)
 */

import 'zx/globals';

const ROOT_DIR = path.resolve(__dirname, '..');
const UV_VERSION = '0.10.0';

// Map Node platform/arch to uv release naming
const TARGETS = {
  'darwin-arm64': {
    uvBin: 'uv',
    uvUrl: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-aarch64-apple-darwin.tar.gz`,
  },
  'darwin-x64': {
    uvBin: 'uv',
    uvUrl: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-apple-darwin.tar.gz`,
  },
  'win32-x64': {
    uvBin: 'uv.exe',
    uvUrl: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`,
  },
  'linux-x64': {
    uvBin: 'uv',
    uvUrl: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-unknown-linux-gnu.tar.gz`,
  },
};

const PLATFORM_GROUPS = {
  mac: ['darwin-x64', 'darwin-arm64'],
  win: ['win32-x64'],
  linux: ['linux-x64'],
};

const OCR_ENV_DIR = path.join(ROOT_DIR, 'resources', 'ocr-env');
const TEMP_DIR = path.join(ROOT_DIR, 'temp_uv_setup');

/**
 * Resolve uv binary for a specific target.
 * Priority: 1) bundled in resources/bin/  2) system PATH  3) download
 */
async function resolveUv(targetId) {
  const target = TARGETS[targetId];
  if (!target) {
    echo(chalk.yellow`⚠️ Target ${targetId} not supported.`);
    return null;
  }

  // 1. Check bundled uv in resources/bin/
  const bundledUv = path.join(ROOT_DIR, 'resources', 'bin', targetId, target.uvBin);
  if (await fs.pathExists(bundledUv)) {
    echo(chalk.green`✅ Using bundled uv: ${bundledUv}`);
    return bundledUv;
  }

  // 2. Check system PATH
  try {
    await $`uv --version`;
    echo(chalk.green`✅ Using system uv`);
    return 'uv';
  } catch {
    // Not in PATH, proceed to download
  }

  // 3. Download uv
  await fs.ensureDir(TEMP_DIR);
  const archiveName = path.basename(target.uvUrl);
  const archivePath = path.join(TEMP_DIR, archiveName);

  echo(chalk.blue`⬇️ Downloading uv for ${targetId}...`);
  const response = await fetch(target.uvUrl);
  if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
  await fs.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));

  // Extract
  echo`📂 Extracting uv...`;
  if (archiveName.endsWith('.zip')) {
    if (os.platform() === 'win32') {
      const { execFileSync } = await import('child_process');
      const psCommand = `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory('${archivePath.replace(/'/g, "''")}', '${TEMP_DIR.replace(/'/g, "''")}')`;
      execFileSync('powershell.exe', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' });
    } else {
      await $`unzip -q -o ${archivePath} -d ${TEMP_DIR}`;
    }
  } else {
    await $`tar -xzf ${archivePath} -C ${TEMP_DIR}`;
  }

  // Find uv binary
  const uvPath = await findBinary(TEMP_DIR, target.uvBin);
  if (!uvPath) {
    throw new Error(`Could not find ${target.uvBin} in extracted files.`);
  }

  if (os.platform() !== 'win32') {
    await fs.chmod(uvPath, 0o755);
  }

  return uvPath;
}

async function findBinary(dir, name) {
  const files = await glob(`**/${name}`, { cwd: dir, absolute: true });
  return files.length > 0 ? files[0] : null;
}

/**
 * Setup OCR environment for a target.
 */
async function setupTarget(targetId) {
  const target = TARGETS[targetId];
  if (!target) {
    echo(chalk.yellow`⚠️ Target ${targetId} not supported.`);
    return;
  }

  // Cleanup previous temp files
  await fs.remove(TEMP_DIR);
  await fs.ensureDir(TEMP_DIR);

  try {
    const uvPath = await resolveUv(targetId);
    if (!uvPath) return;

    const envDir = path.join(OCR_ENV_DIR, targetId);
    await fs.remove(envDir);
    await fs.ensureDir(envDir);

    echo(chalk.blue`🐍 Creating Python virtual environment at ${envDir}...`);

    // uv venv --python 3.12 will auto-download embeddable Python
    await $`"${uvPath}" venv --python 3.12 "${envDir}"`;

    const pythonBin = os.platform() === 'win32'
      ? path.join(envDir, 'Scripts', 'python.exe')
      : path.join(envDir, 'bin', 'python');

    echo(chalk.blue`📦 Installing OCR dependencies...`);

    const requirementsPath = path.join(ROOT_DIR, 'requirements-ocr.txt');
    await $`"${uvPath}" pip install --python "${pythonBin}" -r "${requirementsPath}"`;

    // Verify installation
    echo(chalk.blue`🔍 Verifying installation...`);
    const verifyResult = await $`"${pythonBin}" -c "from rapidocr_onnxruntime import RapidOCR; print('RapidOCR OK')"`;
    if (verifyResult.stdout?.includes('RapidOCR OK')) {
      echo(chalk.green`✅ OCR environment ready for ${targetId}`);
    } else {
      echo(chalk.red`❌ RapidOCR verification failed for ${targetId}`);
    }

  } finally {
    await fs.remove(TEMP_DIR);
  }
}

// Main
const setupAll = argv.all;
const platform = argv.platform;

if (setupAll) {
  echo(chalk.cyan`🌐 Setting up OCR env for ALL platforms...`);
  for (const id of Object.keys(TARGETS)) {
    await setupTarget(id);
  }
} else if (platform) {
  const targets = PLATFORM_GROUPS[platform];
  if (!targets) {
    echo(chalk.red`❌ Unknown platform: ${platform}`);
    process.exit(1);
  }
  for (const id of targets) {
    await setupTarget(id);
  }
} else {
  const currentId = `${os.platform()}-${os.arch()}`;
  if (TARGETS[currentId]) {
    await setupTarget(currentId);
  } else {
    echo(chalk.red`❌ Current system ${currentId} not supported.`);
    process.exit(1);
  }
}

echo(chalk.green`\n🎉 Done!`);
