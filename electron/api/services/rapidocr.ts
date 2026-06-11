/* eslint-disable @typescript-eslint/no-explicit-any */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

function resolveWorkerPath(): string {
  const { app } = require('electron');

  if (app?.isPackaged) {
    // Production: use process.resourcesPath (available in Electron)
    const prodPath = join(process.resourcesPath, 'app', 'dist-electron', 'api', 'services', 'rapidocr-worker.py');
    if (existsSync(prodPath)) return prodPath;

    // Fallback to extraResources location
    const extraPath = join(process.resourcesPath, 'rapidocr-worker.py');
    if (existsSync(extraPath)) return extraPath;

    return prodPath;
  }

  // Dev mode: project root / electron / api / services / rapidocr-worker.py
  return join(process.cwd(), 'electron', 'api', 'services', 'rapidocr-worker.py');
}

function resolvePythonPath(): string {
  const platform = `${process.platform}-${process.arch}`;
  const { app } = require('electron');

  if (app?.isPackaged) {
    // 1. Try bundled ocr-env first (highest priority)
    const bundledEnvDir = join(process.resourcesPath, 'ocr-env', platform);
    const bundledPython = process.platform === 'win32'
      ? join(bundledEnvDir, 'Scripts', 'python.exe')
      : join(bundledEnvDir, 'bin', 'python');
    if (existsSync(bundledPython)) return bundledPython;

    // 2. Fallback: system python3
    return 'python3';
  }

  // Dev mode: project root / resources / ocr-env / platform
  const devEnvDir = join(process.cwd(), 'resources', 'ocr-env', platform);
  const devPython = process.platform === 'win32'
    ? join(devEnvDir, 'Scripts', 'python.exe')
    : join(devEnvDir, 'bin', 'python');
  if (existsSync(devPython)) return devPython;

  return 'python3';
}

const WORKER_PATH = resolveWorkerPath();
console.log('[RapidOCR] Worker path:', WORKER_PATH, 'exists:', existsSync(WORKER_PATH));

interface OcrBlock {
  type: string;
  bbox: number[][];
  content: string;
  confidence: number;
}

interface OcrResult {
  fullText: string;
  blocks: OcrBlock[];
  pageCount: number;
}

interface WorkerResponse {
  success: boolean;
  fullText?: string;
  blocks?: OcrBlock[];
  pageCount?: number;
  error?: string;
}

/**
 * Run OCR on a single image buffer via RapidOCR Python worker.
 */
export async function recognizeImage(imageBuffer: Buffer): Promise<string> {
  const result = await runOcrWorker({ type: 'image', base64: imageBuffer.toString('base64') });
  return result.fullText;
}

/**
 * Run OCR on multiple image buffers (e.g. PDF pages) via RapidOCR Python worker.
 */
export async function recognizeMultiple(imageBuffers: Buffer[]): Promise<string> {
  const texts: string[] = [];
  for (const buf of imageBuffers) {
    const text = await recognizeImage(buf);
    if (text.trim()) {
      texts.push(text);
    }
  }
  return texts.join('\n');
}

/**
 * Run OCR on a PDF file directly via RapidOCR Python worker (with built-in PyMuPDF rendering).
 * Preferred over recognizeMultiple when source is a PDF file path.
 */
export async function recognizePdf(pdfPath: string, dpi = 200): Promise<string> {
  const result = await runOcrWorker({ type: 'pdf', path: pdfPath, dpi });
  return result.fullText;
}

/**
 * Spawn the RapidOCR Python worker and communicate via stdin/stdout.
 */
const WORKER_TIMEOUT_MS = 120_000; // 2 minutes max per request

function runOcrWorker(payload: Record<string, unknown>): Promise<OcrResult> {
  return new Promise((resolve, reject) => {
    const pythonPath = resolvePythonPath();

    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill('SIGTERM');
        reject(new Error('RapidOCR worker timed out after 2 minutes'));
      }
    }, WORKER_TIMEOUT_MS);

    console.log('[RapidOCR] Spawning worker:', pythonPath, WORKER_PATH);
    const child = spawn(pythonPath, [WORKER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.on('spawn', () => {
      console.log('[RapidOCR] Worker spawned successfully. PID:', child.pid);
    });

    child.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Failed to spawn RapidOCR worker: ${error.message}`));
      }
    });

    // stdin error (EPIPE, etc.) must be caught or it becomes an unhandled exception.
    // Let handleChild collect diagnostics via child.on('close') before rejecting.
    child.stdin.on('error', (error) => {
      console.log('[RapidOCR] stdin stream error:', error.message);
      // Do not immediately reject — handleChild will collect stdout/stderr and report.
    });

    handleChild(child, payload, timeout, (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    }, (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
  });
}

function handleChild(
  child: ReturnType<typeof spawn>,
  payload: Record<string, unknown>,
  timeout: ReturnType<typeof setTimeout>,
  resolve: (value: OcrResult) => void,
  reject: (reason: Error) => void,
) {
  let stderrData = '';
  let stdoutData = '';
  let writeError: Error | null = null;
  let closeReceived = false;

  // Helper to finalize with collected diagnostics
  const finalize = (err: Error) => {
    clearTimeout(timeout);
    reject(err);
  };

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderrData += text;
    console.log('[RapidOCR] stderr:', text);
  });

  child.stdout.on('data', (chunk) => {
    stdoutData += chunk.toString();
  });

  child.on('close', (code, signal) => {
    if (closeReceived) return;
    closeReceived = true;
    clearTimeout(timeout);
    console.log('[RapidOCR] Worker exited. code:', code, 'signal:', signal, 'stderr:', stderrData);

    // If we got a write error (e.g. EPIPE), include diagnostics in the error
    if (writeError) {
      const diag = `Exit code: ${code}, signal: ${signal}, stdout: ${stdoutData.slice(0, 500)}, stderr: ${stderrData.slice(0, 500)}`;
      reject(new Error(`RapidOCR worker failed: ${writeError.message}. ${diag}`));
      return;
    }

    try {
      const lines = stdoutData.split('\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];
      if (!lastLine) {
        reject(new Error(`RapidOCR worker returned empty output. Exit code: ${code}, stderr: ${stderrData}`));
        return;
      }

      const response: WorkerResponse = JSON.parse(lastLine);
      if (!response.success) {
        reject(new Error(response.error || 'RapidOCR failed'));
        return;
      }

      resolve({
        fullText: response.fullText || '',
        blocks: response.blocks || [],
        pageCount: response.pageCount || 1,
      });
    } catch (error) {
      reject(new Error(`Failed to parse RapidOCR output: ${stdoutData}. Error: ${String(error)}`));
    }
  });

  // Send input — guard against EPIPE on broken stdin.
  // Do NOT immediately reject on EPIPE; let child.on('close') collect stdout/stderr first.
  try {
    child.stdin.write(JSON.stringify(payload), (err) => {
      if (err) {
        console.log('[RapidOCR] Write error:', err.message);
        writeError = err;
        // Give child.on('close') a tick to collect output before rejecting
        setTimeout(() => {
          if (!closeReceived) {
            finalize(new Error(`Failed to write to RapidOCR worker stdin: ${err.message}`));
          }
        }, 100);
        return;
      }
      child.stdin.end();
    });
  } catch (error) {
    writeError = error instanceof Error ? error : new Error(String(error));
    setTimeout(() => {
      if (!closeReceived) {
        finalize(new Error(`Unexpected error writing to RapidOCR worker: ${String(error)}`));
      }
    }, 100);
  }
}
