import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as path from 'node:path';

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
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx as any, viewport }).promise;

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
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx as any, viewport }).promise;
      const pngBuffer = await canvas.encode('png');
      pages.push(Buffer.from(pngBuffer));
    }
    return pages;
  } finally {
    await doc.destroy();
  }
}
