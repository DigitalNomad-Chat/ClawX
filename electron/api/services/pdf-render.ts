import { createCanvas, Canvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as path from 'node:path';

/**
 * Create a pdfjs-dist-compatible canvas context wrapper.
 *
 * @napi-rs/canvas is not 100% API-compatible with the browser Canvas 2D
 * context. pdfjs-dist calls some methods in ways napi-rs does not accept
 * (e.g. ctx.fill() / ctx.stroke() with no arguments, Path2D usage).
 * This proxy intercepts those calls and adapts them.
 */
function createPdfjsCompatibleContext(canvas: Canvas) {
  const ctx = canvas.getContext('2d');

  return new Proxy(ctx as any, {
    get(target, prop) {
      const value = target[prop];

      if (prop === 'fill') {
        return function (...args: any[]) {
          // napi-rs/canvas requires fill(rule: string) or fill(path: Path)
          // pdfjs-dist sometimes calls fill() with no args
          if (args.length === 0) {
            return target.fill('evenodd');
          }
          return target.fill(...args);
        };
      }

      if (prop === 'stroke') {
        return function (...args: any[]) {
          // napi-rs/canvas requires stroke(path: Path) or no-arg
          // pdfjs-dist sometimes passes extra args napi-rs rejects
          if (args.length === 0) {
            return target.stroke();
          }
          return target.stroke(...args);
        };
      }

      if (prop === 'createPattern') {
        return function (image: any, repetition: string) {
          // napi-rs/canvas createPattern may not accept all image types
          try {
            return target.createPattern(image, repetition);
          } catch {
            // Fallback: return a dummy pattern object
            return {
              setTransform: () => {},
            };
          }
        };
      }

      if (prop === 'setTransform') {
        return function (...args: any[]) {
          // Handle both DOMMatrix and 6-number signatures
          if (args.length === 1 && args[0] != null && typeof args[0] === 'object') {
            const m = args[0];
            if (typeof m.a === 'number') {
              return target.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
            }
          }
          return target.setTransform(...args);
        };
      }

      if (typeof value === 'function') {
        return value.bind(target);
      }

      return value;
    },
  });
}

/**
 * Render a single PDF page to a PNG image buffer using pdfjs-dist + @napi-rs/canvas.
 * @param buffer Raw PDF bytes
 * @param pageNum 1-based page number
 * @param scale Render scale (default 2.0 for 144 DPI)
 */
export async function renderPdfPage(
  buffer: Buffer,
  pageNum: number,
  scale = 2.0,
): Promise<Buffer> {
  const cMapUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/') + '/';
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    useSystemFonts: true,
  }).promise;

  try {
    const page = await doc.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = createPdfjsCompatibleContext(canvas);

    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngBuffer = await canvas.encode('png');
    return Buffer.from(pngBuffer);
  } finally {
    await doc.destroy();
  }
}

/**
 * Render all pages of a PDF to PNG image buffers.
 */
export async function renderPdfPages(
  buffer: Buffer,
  scale = 2.0,
): Promise<Buffer[]> {
  const cMapUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/') + '/';
  const data = new Uint8Array(buffer);
  const doc = await pdfjsLib.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    useSystemFonts: true,
  }).promise;

  try {
    const pages: Buffer[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = createPdfjsCompatibleContext(canvas);
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pngBuffer = await canvas.encode('png');
      pages.push(Buffer.from(pngBuffer));
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
