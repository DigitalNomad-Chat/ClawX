import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as path from 'node:path';

export interface PDFAnalysisResult {
  isTextBased: boolean;
  text: string;
  pageCount: number;
}

const TEXT_THRESHOLD = 200;
const PAGE_SUBSTANTIAL_THRESHOLD = 80;
const DENSITY_THRESHOLD = 100;
const SUBSTANTIAL_RATIO_THRESHOLD = 0.3;

export async function analyzePdf(buffer: Buffer): Promise<PDFAnalysisResult> {
  let doc: any = null;
  try {
    const cMapUrl = path.join(process.cwd(), 'node_modules/pdfjs-dist/cmaps/') + '/';
    const data = new Uint8Array(buffer);
    doc = await pdfjsLib.getDocument({
      data,
      cMapUrl,
      cMapPacked: true,
      useSystemFonts: true,
    }).promise;

    const pageCount = doc.numPages || 1;
    let fullText = '';
    let totalMeaningful = 0;
    let substantialPages = 0;

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join('');
      fullText += pageText + '\n';

      const pageMeaningful = (pageText.match(/[\p{L}\p{N}]/gu) || []).length;
      totalMeaningful += pageMeaningful;
      if (pageMeaningful > PAGE_SUBSTANTIAL_THRESHOLD) {
        substantialPages++;
      }
    }

    const text = fullText.trim();
    const avgDensity = totalMeaningful / pageCount;
    const substantialRatio = substantialPages / pageCount;

    const isTextBased =
      totalMeaningful > TEXT_THRESHOLD &&
      avgDensity > DENSITY_THRESHOLD &&
      substantialRatio > SUBSTANTIAL_RATIO_THRESHOLD;

    return { isTextBased, text, pageCount };
  } catch (error: any) {
    // Conservative fallback: treat as image-based PDF
    return { isTextBased: false, text: '', pageCount: 0 };
  } finally {
    if (doc) {
      try {
        await doc.destroy();
      } catch {
        // ignore cleanup errors
      }
    }
  }
}
