import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';

let configured = false;

/**
 * Points pdf.js at its bundled worker. Only the renderer calls this: core/pdf/extract.ts must keep
 * working untouched in Node (vitest), where pdf.js runs its fake in-process worker.
 */
export function ensurePdfWorker(): void {
  if (configured) return;
  GlobalWorkerOptions.workerSrc = workerUrl;
  configured = true;
}
