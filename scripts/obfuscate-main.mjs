import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

// Detect files containing lone surrogate unicode escapes (\uD800-\uDFFF).
// javascript-obfuscator's stringArrayEncoding fails on these because
// encodeURIComponent rejects lone surrogates.
const LONE_SURROGATE_ESCAPE_RE = /\\u[dD][8-9a-fA-F][0-9a-fA-F]{2}|\\u[dD][c-fC-F][0-9a-fA-F]{2}/;

const baseOptions = {
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 1.0,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.4,
  stringArray: true,
  stringArrayThreshold: 1.0,
  stringArrayEncoding: ['rc4', 'base64'],
  stringArrayRotate: true,
  stringArrayShuffle: true,
  identifierNamesGenerator: 'mangled',
  renameGlobals: true,
  numbersToExpressions: true,
  disableConsoleOutput: true,
  debugProtection: true,
  debugProtectionInterval: 2000,
  selfDefending: true,
  transformObjectKeys: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
};

const fallbackOptions = {
  ...baseOptions,
  stringArrayThreshold: 0.1,
};

const files = globSync('dist-electron/**/*.js', { absolute: true });

let successCount = 0;
let failCount = 0;
let fallbackCount = 0;
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const hasLoneSurrogates = LONE_SURROGATE_ESCAPE_RE.test(code);
  const options = hasLoneSurrogates ? fallbackOptions : baseOptions;

  try {
    const result = JavaScriptObfuscator.obfuscate(code, options);
    fs.writeFileSync(file, result.getObfuscatedCode());
    if (hasLoneSurrogates) {
      console.log(`Obfuscated (fallback): ${path.relative(process.cwd(), file)}`);
      fallbackCount++;
    } else {
      console.log(`Obfuscated: ${path.relative(process.cwd(), file)}`);
    }
    successCount++;
  } catch (err) {
    console.warn(`Skipped (obfuscate error): ${path.relative(process.cwd(), file)} — ${err.message}`);
    failCount++;
  }
}

console.log(`Obfuscated ${successCount}/${files.length} files. Skipped ${failCount}. Fallback: ${fallbackCount}.`);
