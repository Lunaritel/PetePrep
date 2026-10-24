import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { SnapshotSegment } from './types';

// The canvas type is deliberately loose: the renderer passes a DOM canvas, Node tests pass @napi-rs/canvas.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CanvasLike {
  width: number;
  height: number;
  getContext(type: '2d'): any;
}

export interface SnapshotDeps {
  createCanvas(width: number, height: number): CanvasLike;
  toPng(canvas: CanvasLike): Promise<Uint8Array>;
}

const SIDE_MARGIN = 20;
const SEGMENT_GAP_PX = 8;

interface Crop {
  page: CanvasLike;
  sx: number;
  sy: number;
  width: number;
  height: number;
}

/**
 * Renders the given page bands (PDF user space, y up) into one PNG, stacked top to bottom.
 * Used to show a question whose picture or table cannot be rebuilt from extracted text.
 */
export async function renderSnapshot(
  data: Uint8Array,
  segments: SnapshotSegment[],
  deps: SnapshotDeps,
  scale = 2,
): Promise<Uint8Array> {
  if (segments.length === 0) throw new Error('renderSnapshot needs at least one segment.');

  // pdf.js takes ownership of the buffer it is handed, so give it a copy and let callers reuse theirs.
  const task = getDocument({ data: data.slice(), useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  try {
    const rendered = new Map<number, { canvas: CanvasLike; width: number; height: number }>();
    const crops: Crop[] = [];

    for (const segment of segments) {
      if (!Number.isInteger(segment.page) || segment.page < 1 || segment.page > doc.numPages) {
        throw new Error(`Snapshot page ${segment.page} is outside the document (1-${doc.numPages}).`);
      }
      let entry = rendered.get(segment.page);
      if (!entry) {
        const page = await doc.getPage(segment.page);
        const viewport = page.getViewport({ scale });
        const canvas = deps.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, canvas: canvas as unknown as HTMLCanvasElement, viewport }).promise;
        entry = { canvas, width: viewport.width / scale, height: viewport.height / scale };
        rendered.set(segment.page, entry);
      }

      const top = Math.min(entry.height, Math.max(0, segment.top));
      const bottom = Math.min(entry.height, Math.max(0, segment.bottom));
      const sy = Math.round((entry.height - Math.max(top, bottom)) * scale);
      const height = Math.round(Math.abs(top - bottom) * scale);
      if (height < 1) throw new Error(`Snapshot band on page ${segment.page} is empty after clamping to the page.`);
      const margin = Math.min(SIDE_MARGIN, entry.width / 4);
      const sx = Math.round(margin * scale);
      crops.push({ page: entry.canvas, sx, sy, width: Math.round((entry.width - 2 * margin) * scale), height });
    }

    const width = Math.max(...crops.map((c) => c.width));
    const height = crops.reduce((sum, c) => sum + c.height, 0) + SEGMENT_GAP_PX * (crops.length - 1);
    const out = deps.createCanvas(width, height);
    const context = out.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    let y = 0;
    for (const c of crops) {
      context.drawImage(c.page, c.sx, c.sy, c.width, c.height, 0, y, c.width, c.height);
      y += c.height + SEGMENT_GAP_PX;
    }
    return await deps.toPng(out);
  } finally {
    await task.destroy();
  }
}
