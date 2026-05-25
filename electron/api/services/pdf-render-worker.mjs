/**
 * PDF Render Worker — standalone Node.js process for rendering PDF pages to PNG.
 *
 * Run via child_process.fork/spawn to isolate native canvas operations
 * from the Electron main process (prevents crashes).
 *
 * Usage (stdin):
 *   { pdfPath: string, scale?: number }
 *
 * Output (stdout JSON lines):
 *   { type: 'page', index: number, pngPath: string }
 *   { type: 'done', pageCount: number }
 *   { type: 'error', message: string }
 */
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function createPdfjsCompatibleContext(canvas) {
  const ctx = canvas.getContext('2d');
  return new Proxy(ctx, {
    get(target, prop) {
      const value = target[prop];
      if (prop === 'fill') {
        return function (...args) {
          if (args.length === 0) return target.fill('evenodd');
          return target.fill(...args);
        };
      }
      if (prop === 'stroke') {
        return function (...args) {
          if (args.length === 0) return target.stroke();
          return target.stroke(...args);
        };
      }
      if (prop === 'createPattern') {
        return function (image, repetition) {
          try {
            return target.createPattern(image, repetition);
          } catch {
            return { setTransform: () => {} };
          }
        };
      }
      if (prop === 'setTransform') {
        return function (...args) {
          if (args.length === 1 && args[0] != null && typeof args[0] === 'object') {
            const m = args[0];
            if (typeof m.a === 'number') {
              return target.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
            }
          }
          return target.setTransform(...args);
        };
      }
      if (typeof value === 'function') return value.bind(target);
      return value;
    },
  });
}

async function renderPdf(pdfPath, scale = 2.0) {
  const cMapUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/') + '/';
  const fs = await import('node:fs/promises');
  const data = new Uint8Array(await fs.readFile(pdfPath));
  const doc = await pdfjsLib.getDocument({ data, cMapUrl, cMapPacked: true, useSystemFonts: true }).promise;

  const tmpDir = await mkdtemp(path.join(tmpdir(), 'pdf-render-'));
  const pngPaths = [];

  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = createPdfjsCompatibleContext(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const pngPath = path.join(tmpDir, `page-${i}.png`);
      const pngBuffer = await canvas.encode('png');
      await writeFile(pngPath, pngBuffer);
      pngPaths.push(pngPath);

      // Send progress
      console.log(JSON.stringify({ type: 'page', index: i, pngPath }));
    }
  } finally {
    await doc.destroy();
  }

  return { pageCount: doc.numPages, pngPaths, tmpDir };
}

// Read input from stdin
let inputBuffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { inputBuffer += chunk; });
process.stdin.on('end', async () => {
  try {
    const { pdfPath, scale } = JSON.parse(inputBuffer);
    const result = await renderPdf(pdfPath, scale);
    console.log(JSON.stringify({ type: 'done', pageCount: result.pageCount, pngPaths: result.pngPaths, tmpDir: result.tmpDir }));
    process.exit(0);
  } catch (error) {
    console.log(JSON.stringify({ type: 'error', message: error.message }));
    process.exit(1);
  }
});
