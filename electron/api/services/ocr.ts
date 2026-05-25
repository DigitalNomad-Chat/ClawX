import { createWorker, Worker } from 'tesseract.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

function resolveTessdataDir(): string {
  const { app } = require('electron');
  if (app?.isPackaged) {
    return join(process.resourcesPath, 'tessdata');
  }
  // Dev mode: project root / resources / tessdata
  const devPath = join(process.cwd(), 'resources', 'tessdata');
  if (existsSync(devPath)) return devPath;
  return join(process.resourcesPath, 'tessdata');
}

const TESSDATA_DIR = resolveTessdataDir();

let worker: Worker | null = null;
let workerLangs = '';

async function getWorker(langs: string): Promise<Worker> {
  if (!worker || workerLangs !== langs) {
    if (worker) {
      await worker.terminate();
    }
    worker = await createWorker(langs, 1, {
      logger: () => {},
      langPath: TESSDATA_DIR,
      cachePath: TESSDATA_DIR,
      cacheMethod: 'readOnly',
      gzip: false,
    });
    workerLangs = langs;
  }
  return worker;
}

/**
 * Recognize text from an image buffer.
 * @param imageBuffer PNG/JPEG image buffer
 * @param langs OCR language(s), default 'chi_sim+eng'
 */
export async function recognizeImage(
  imageBuffer: Buffer,
  langs = 'chi_sim+eng',
): Promise<string> {
  const w = await getWorker(langs);
  const {
    data: { text },
  } = await w.recognize(imageBuffer);
  return text;
}

/**
 * Recognize text from multiple image buffers (e.g. PDF pages).
 */
export async function recognizeMultiple(
  imageBuffers: Buffer[],
  langs = 'chi_sim+eng',
): Promise<string> {
  const texts: string[] = [];
  for (const buf of imageBuffers) {
    const text = await recognizeImage(buf, langs);
    if (text.trim()) {
      texts.push(text);
    }
  }
  return texts.join('\n');
}

/**
 * Terminate the shared OCR worker to free resources.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerLangs = '';
  }
}
