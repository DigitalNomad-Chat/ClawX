# Desensitize OCR + PDF Scan Support Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intelligent PDF type detection (text vs scanned) and OCR support for scanned PDFs and images, mirroring guada_ai's architecture.

**Architecture:** When a PDF is uploaded, first analyze if it's text-based using character density heuristics (guada_ai approach). Text-based PDFs go through direct text extraction (existing). Scanned/image-based PDFs are rendered to images and OCR'd via tesseract.js. Image uploads are also OCR'd directly. All extracted text then flows into the existing desensitization pipeline.

**Tech Stack:** tesseract.js (Node.js worker), pdfjs-dist (PDF rendering + text extraction), sharp (PDF-to-image fallback), existing desensitize service

---

## Chunk 1: OCR Engine Setup

### Task 1: Install tesseract.js

**Files:**
- Modify: `package.json`
- Modify: `electron/api/routes/files.ts`

- [ ] **Step 1: Install tesseract.js**

```bash
pnpm add tesseract.js
```

- [ ] **Step 2: Verify tesseract.js can create a worker in Node.js**

Add a quick test in `electron/api/routes/files.ts` (temporary, remove after):

```typescript
import { createWorker } from 'tesseract.js';

async function testOcr() {
  const worker = await createWorker('chi_sim', 1, {
    workerPath: require.resolve('tesseract.js/dist/worker-script/node/index.js'),
  });
  // ...
  await worker.terminate();
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "deps: add tesseract.js for OCR"
```

---

## Chunk 2: PDF Analysis (Text vs Scanned Detection)

### Task 2: Add PDF analyze helper

**Files:**
- Create: `electron/api/services/pdf-analyze.ts`
- Test: `tests/unit/pdf-analyze.test.ts`

This mirrors `guada_ai/backend-ts/src/modules/document-processor/services/pdf-analyze.service.ts`.

- [ ] **Step 1: Write the PDF analyze service**

```typescript
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
      try { await doc.destroy(); } catch { /* ignore */ }
    }
  }
}
```

- [ ] **Step 2: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { analyzePdf } from '@/electron/api/services/pdf-analyze';

describe('analyzePdf', () => {
  it('returns isTextBased=true for a text PDF', async () => {
    // Create a simple text PDF buffer or mock
    // ...
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add electron/api/services/pdf-analyze.ts tests/unit/pdf-analyze.test.ts
git commit -m "feat(ocr): add PDF text/scanned type detection"
```

---

## Chunk 3: Scanned PDF OCR

### Task 3: PDF-to-image rendering

**Files:**
- Create: `electron/api/services/pdf-render.ts`

We need to render PDF pages to images for OCR. In Node.js, `pdfjs-dist` needs a Canvas API.

Option A: Use `canvas` npm package (node-canvas) — native module, may need compilation.
Option B: Use `sharp` (already in deps) — supports PDF-to-image if libvips has PDF support.

Try sharp first (simpler), fall back to canvas if needed.

- [ ] **Step 1: Test if sharp supports PDF rendering**

```typescript
import sharp from 'sharp';

export async function pdfPageToImage(pdfBuffer: Buffer, pageIndex: number): Promise<Buffer> {
  return sharp(pdfBuffer, { page: pageIndex, density: 200 })
    .png()
    .toBuffer();
}
```

If sharp fails, use `canvas` package:

```typescript
import { createCanvas } from 'canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function renderPdfPageToBuffer(data: Uint8Array, pageNum: number): Promise<Buffer> {
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const page = await doc.getPage(pageNum);
  const scale = 2.0;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  const buffer = canvas.toBuffer('image/png');
  await doc.destroy();
  return buffer;
}
```

- [ ] **Step 2: Commit rendering helper**

```bash
git add electron/api/services/pdf-render.ts
git commit -m "feat(ocr): add PDF page to image rendering"
```

### Task 4: OCR service wrapper

**Files:**
- Create: `electron/api/services/ocr.ts`

- [ ] **Step 1: Write OCR service**

```typescript
import { createWorker, Worker } from 'tesseract.js';

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('chi_sim', 1, {
      workerPath: require.resolve('tesseract.js/dist/worker-script/node/index.js'),
    });
  }
  return worker;
}

export async function recognizeImage(imageBuffer: Buffer): Promise<string> {
  const w = await getWorker();
  const {
    data: { text },
  } = await w.recognize(imageBuffer);
  return text;
}

export async function recognizePdfPages(pageBuffers: Buffer[]): Promise<string> {
  const texts: string[] = [];
  for (const buf of pageBuffers) {
    const text = await recognizeImage(buf);
    if (text.trim()) texts.push(text);
  }
  return texts.join('\n');
}

export async function terminateOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add electron/api/services/ocr.ts
git commit -m "feat(ocr): add tesseract.js OCR service wrapper"
```

### Task 5: Integrate into files route

**Files:**
- Modify: `electron/api/routes/files.ts`

- [ ] **Step 1: Modify `/api/files/extract-text` to use smart detection**

```typescript
import { analyzePdf } from '../services/pdf-analyze';
import { pdfPageToImage } from '../services/pdf-render';
import { recognizePdfPages, recognizeImage } from '../services/ocr';

// In extract-text route:
const data = await fsP.readFile(body.stagedPath);
const analysis = await analyzePdf(data);

if (analysis.isTextBased) {
  sendJson(res, 200, { success: true, text: analysis.text, pageCount: analysis.pageCount, source: 'text' });
  return true;
}

// Scanned PDF: render to images then OCR
const pageBuffers: Buffer[] = [];
for (let i = 0; i < analysis.pageCount; i++) {
  const imgBuffer = await pdfPageToImage(data, i);
  pageBuffers.push(imgBuffer);
}
const ocrText = await recognizePdfPages(pageBuffers);
sendJson(res, 200, { success: true, text: ocrText, pageCount: analysis.pageCount, source: 'ocr' });
```

- [ ] **Step 2: Add image OCR route**

Add a new route `POST /api/files/ocr-image`:

```typescript
if (url.pathname === '/api/files/ocr-image' && req.method === 'POST') {
  const body = await parseJsonBody<{ stagedPath: string }>(req);
  const fsP = await import('node:fs/promises');
  const data = await fsP.readFile(body.stagedPath);
  const text = await recognizeImage(data);
  sendJson(res, 200, { success: true, text });
  return true;
}
```

- [ ] **Step 3: Commit**

```bash
git add electron/api/routes/files.ts
git commit -m "feat(ocr): integrate PDF type detection and OCR into files route"
```

---

## Chunk 4: Frontend Integration

### Task 6: Update DesensitizePanel for image OCR

**Files:**
- Modify: `src/components/desensitize/DesensitizePanel.tsx`

- [ ] **Step 1: Change image handling from manual paste to OCR**

Replace the image branch in `handleFileSelect`:

```typescript
} else if (file.type.startsWith('image/')) {
  const reader = new FileReader();
  const base64 = await new Promise<string>((resolve, reject) => {
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
  const staged = await hostApiFetch<...>('/api/files/stage-buffer', {
    method: 'POST',
    body: JSON.stringify({ base64, fileName: file.name, mimeType: file.type }),
  });
  const extracted = await hostApiFetch<{ success: boolean; text?: string; error?: string }>(
    '/api/files/ocr-image',
    { method: 'POST', body: JSON.stringify({ stagedPath: staged.stagedPath }) },
  );
  if (!extracted.success || extracted.text == null) {
    throw new Error(extracted.error || '图片 OCR 失败');
  }
  text = extracted.text;
}
```

- [ ] **Step 2: Update UI hint text**

Change the drag-drop hint from "图片（需OCR）" to "图片（自动OCR）" or similar.

- [ ] **Step 3: Commit**

```bash
git add src/components/desensitize/DesensitizePanel.tsx
git commit -m "feat(ocr): auto-OCR images in desensitize panel"
```

---

## Chunk 5: Enhanced Desensitization Rules

### Task 7: Add missing PII patterns

**Files:**
- Modify: `electron/api/services/desensitize.ts`
- Test: `tests/unit/desensitize.test.ts` (existing or new)

Add the following patterns that exist in guada_ai but are missing in ClawX:

1. **Hong Kong / Taiwan / Macau mobile numbers**
2. **Fund account numbers**
3. **Securities / Stock account numbers**
4. **Social security / housing fund account numbers**
5. **English Policy Number patterns**

- [ ] **Step 1: Add missing patterns to desensitize function**

After existing PHONE rule, add:

```typescript
// Hong Kong mobile
result = replaceMatches(
  'PHONE_HK',
  /(?<!\d)(?:\+?852[-\s]?)?[2-9]\d{3}[-\s]?\d{4}(?!\d)/g,
  result,
);

// Taiwan mobile
result = replaceMatches(
  'PHONE_TW',
  /(?<!\d)(?:\+?886[-\s]?)?0?9\d{2}[-\s]?\d{3}[-\s]?\d{3}(?!\d)/g,
  result,
);

// Macau mobile
result = replaceMatches(
  'PHONE_MO',
  /(?<!\d)(?:\+?853[-\s]?)?[6]\d{3}[-\s]?\d{4}(?!\d)/g,
  result,
);
```

After existing POLICY_NUMBER rule, add:

```typescript
// English Policy Number
result = replaceMatches(
  'POLICY_NUMBER',
  /(?<=Policy\s*(?:No|Number|#)?[:\.\s]*)[A-Za-z0-9\-]{6,30}(?=[\s\n,，。；;:、]|$)/gi,
  result,
);

// Fund account
result = replaceMatches(
  'FUND_ACCOUNT',
  /(?<=(?:基金账号|基金账户|基金帐号|基金戶口|Fund\s*(?:Acc|Account|#)?)[:：\.\s]*)[A-Za-z0-9]{8,20}(?=[\s\n,，。；;:、]|$)/gi,
  result,
);

// Securities / Stock account
result = replaceMatches(
  'STOCK_ACCOUNT',
  /(?<=(?:证券账号|证券账户|股票账号|股票账户|证券帐号|股票帐号|证券戶口|股票戶口|Securities\s*(?:Acc|Account|#)?|Stock\s*(?:Acc|Account|#)?)[:：\.\s]*)[A-Za-z]\d{8,12}(?=[\s\n,，。；;:、]|$)/gi,
  result,
);

// Social security / housing fund
result = replaceMatches(
  'SOCIAL_SECURITY',
  /(?<=(?:社保卡号|社保卡號|社保号|社保號|社会保障号|社会保障號|公积金账号|公積金賬號|公积金帐户|公積金帳戶|住房公积金号|住房公積金號)[:：\.\s]*)\d{9,18}(?=[\s\n,，。；;:、]|$)/g,
  result,
);
```

- [ ] **Step 2: Run desensitize tests and fix any issues**

- [ ] **Step 3: Commit**

```bash
git add electron/api/services/desensitize.ts tests/unit/desensitize.test.ts
git commit -m "feat(desensitize): add HK/TW/MO phones, fund/stock/SS accounts, EN policy numbers"
```

---

## Final Integration Test

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 2: Run unit tests**

```bash
pnpm test --run
```

- [ ] **Step 3: Manual verification checklist**

- Upload a text-based PDF → direct text extraction (fast)
- Upload a scanned/image PDF → OCR extraction (slower, shows progress)
- Upload an image → OCR extraction
- All extracted text goes through desensitization correctly
- Desensitized content can be sent and toggled back to original

---

## Notes

- `tesseract.js` language data (`chi_sim.traineddata`) will be downloaded automatically on first use and cached. For offline use, pre-download to `node_modules/tesseract.js-core/tessdata/`.
- PDF rendering via `sharp` requires libvips with PDF support (poppler/pdfium). On macOS this is usually available via Homebrew libvips. If not, use the `canvas` package as fallback.
- The `workerPath` for tesseract.js in Node.js may need adjustment based on how the project bundles dependencies.
