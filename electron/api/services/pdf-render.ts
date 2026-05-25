import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, unlink, rmdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = join(__dirname, 'pdf-render-worker.mjs');

interface WorkerMessage {
  type: 'page' | 'done' | 'error';
  index?: number;
  pngPath?: string;
  pageCount?: number;
  pngPaths?: string[];
  tmpDir?: string;
  message?: string;
}

/**
 * Render a single PDF page to a PNG image buffer by spawning an isolated
 * Node.js worker process. This prevents native canvas crashes from taking
 * down the Electron main process.
 */
export async function renderPdfPage(
  pdfPath: string,
  pageNum: number,
  _scale = 2.0,
): Promise<Buffer> {
  const pages = await renderPdfPages(pdfPath, _scale);
  return pages[pageNum - 1];
}

/**
 * Render all pages of a PDF to PNG image buffers via an isolated worker.
 */
export async function renderPdfPages(
  pdfPath: string,
  scale = 2.0,
): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WORKER_PATH], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const pngPaths: string[] = [];
    let tmpDir = '';
    let stderrData = '';

    child.stderr.on('data', (chunk) => {
      stderrData += chunk.toString();
    });

    child.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const msg: WorkerMessage = JSON.parse(line);
          if (msg.type === 'page' && msg.pngPath) {
            pngPaths.push(msg.pngPath);
          } else if (msg.type === 'done') {
            tmpDir = msg.tmpDir || '';
          } else if (msg.type === 'error') {
            reject(new Error(msg.message || 'PDF render worker error'));
            return;
          }
        } catch {
          // Ignore non-JSON lines (e.g. warnings)
        }
      }
    });

    child.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`PDF render worker exited with code ${code}: ${stderrData}`));
        return;
      }
      try {
        const buffers = await Promise.all(
          pngPaths.map((p) => readFile(p)),
        );
        // Clean up temp files
        for (const p of pngPaths) {
          try { await unlink(p); } catch { /* ignore */ }
        }
        if (tmpDir) {
          try { await rmdir(tmpDir); } catch { /* ignore */ }
        }
        resolve(buffers);
      } catch (error) {
        reject(error);
      }
    });

    child.on('error', (error) => {
      reject(new Error(`Failed to spawn PDF render worker: ${error.message}`));
    });

    // Send input to worker
    child.stdin.write(JSON.stringify({ pdfPath, scale }));
    child.stdin.end();
  });
}
