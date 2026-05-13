import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'fs';
import path from 'path';
import { globSync } from 'glob';

const rendererOptions = {
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.7,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  stringArray: true,
  stringArrayThreshold: 0.8,
  stringArrayEncoding: ['base64'],
  identifierNamesGenerator: 'mangled',
  disableConsoleOutput: true,
  selfDefending: true,
};

const files = globSync('dist/assets/**/*.js', { absolute: true });

for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  const result = JavaScriptObfuscator.obfuscate(code, rendererOptions);
  fs.writeFileSync(file, result.getObfuscatedCode());
  console.log(`Obfuscated: ${path.relative(process.cwd(), file)}`);
}

console.log(`Obfuscated ${files.length} files.`);
