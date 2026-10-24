import { renderSnapshot, type CanvasLike, type SnapshotDeps } from '../../../core/pdf/snapshot';
import type { SnapshotSegment } from '../../../core/pdf/types';
import { ensurePdfWorker } from './pdfjsSetup';

/** Canvas plumbing for core's DOM-free renderSnapshot, backed by real <canvas> elements. */
export const domSnapshotDeps: SnapshotDeps = {
  createCanvas(width, height): CanvasLike {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as CanvasLike;
  },
  toPng(canvas): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      (canvas as unknown as HTMLCanvasElement).toBlob((blob) => {
        if (!blob) {
          reject(new Error('The browser could not encode the question screenshot.'));
          return;
        }
        blob.arrayBuffer().then((buffer) => resolve(new Uint8Array(buffer)), reject);
      }, 'image/png');
    });
  },
};

/** Screenshot of the given page bands as a PNG Blob, ready to store on a QuestionRow. */
export async function renderSnapshotBlob(
  data: Uint8Array,
  segments: SnapshotSegment[],
  scale = 2,
): Promise<Blob> {
  ensurePdfWorker();
  const png = await renderSnapshot(data, segments, domSnapshotDeps, scale);
  return new Blob([png as BlobPart], { type: 'image/png' });
}
