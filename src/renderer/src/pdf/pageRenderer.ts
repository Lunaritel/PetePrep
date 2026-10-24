import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { ensurePdfWorker } from './pdfjsSetup';

export interface PageRenderer {
  pageCount: number;
  /** Renders a 1-based page to a PNG Blob (cached per page and scale). */
  render(page: number, scale?: number): Promise<Blob>;
  destroy(): Promise<void>;
}

/** Opens the PDF once and renders pages on demand for the review screen's "original page" view. */
export async function createPageRenderer(data: Uint8Array): Promise<PageRenderer> {
  ensurePdfWorker();
  // pdf.js detaches the buffer it is given; hand it a copy so the caller's bytes stay usable.
  const task = getDocument({ data: data.slice(), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const cache = new Map<string, Promise<Blob>>();

  async function draw(pageNumber: number, scale: number): Promise<Blob> {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > doc.numPages) {
      throw new Error(`Page ${pageNumber} is outside the document (1-${doc.numPages}).`);
    }
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas drawing is not available.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, canvas, viewport }).promise;
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the page.'))), 'image/png');
    });
  }

  return {
    pageCount: doc.numPages,
    render(page, scale = 1.5) {
      const key = `${page}@${scale}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = draw(page, scale);
        pending.catch(() => cache.delete(key));
        cache.set(key, pending);
      }
      return pending;
    },
    async destroy() {
      cache.clear();
      await task.destroy();
    },
  };
}
