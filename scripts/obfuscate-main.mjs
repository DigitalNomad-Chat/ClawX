import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const obfuscatorOptions = {
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

const files = globSync('dist-electron/**/*.js', { absolute: true });

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);
  fs.writeFileSync(file, result.getObfuscatedCode());
  console.log(`Obfuscated: ${path.relative(process.cwd(), file)}`);
}

console.log(`Obfuscated ${files.length} files.`);
