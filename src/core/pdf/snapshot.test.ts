import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { renderSnapshot, type CanvasLike, type SnapshotDeps } from './snapshot';
import { makeVisualPdf } from './testing/makeVisualPdf';

const deps: SnapshotDeps = {
  createCanvas: (w, h) => createCanvas(w, h) as unknown as CanvasLike,
  toPng: async (canvas) => new Uint8Array(await (canvas as unknown as { encode(format: 'png'): Promise<Buffer> }).encode('png')),
};

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function decode(png: Uint8Array) {
  const { loadImage } = await import('@napi-rs/canvas');
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
}

function hasInk(img: { width: number; height: number; data: Uint8ClampedArray }, predicate: (r: number, g: number, b: number) => boolean): boolean {
  for (let i = 0; i < img.data.length; i += 4) if (predicate(img.data[i], img.data[i + 1], img.data[i + 2])) return true;
  return false;
}

describe('renderSnapshot', () => {
  it('crops a band to the expected pixel size and shows the red image', async () => {
    const pdf = await makeVisualPdf();
    const png = await renderSnapshot(pdf, [{ page: 1, top: 715, bottom: 565 }], deps, 2);
    expect(Array.from(png.slice(0, 8))).toEqual(PNG_SIGNATURE);
    const img = await decode(png);
    expect(img.width).toBe(Math.round((612 - 40) * 2));
    expect(img.height).toBe(300);
    expect(hasInk(img, (r, g, b) => r > 200 && g < 60 && b < 60)).toBe(true);
    expect(hasInk(img, (r, g, b) => r < 80 && g < 80 && b < 80)).toBe(true);
  });

  it('returns an all-white image for a band over empty page space', async () => {
    const png = await renderSnapshot(await makeVisualPdf(), [{ page: 1, top: 130, bottom: 80 }], deps, 1);
    const img = await decode(png);
    expect(hasInk(img, (r, g, b) => r < 250 || g < 250 || b < 250)).toBe(false);
  });

  it('stitches two segments into an image taller than either', async () => {
    const pdf = await makeVisualPdf();
    const one = await decode(await renderSnapshot(pdf, [{ page: 1, top: 715, bottom: 565 }], deps, 1));
    const two = await decode(await renderSnapshot(pdf, [{ page: 1, top: 500, bottom: 400 }], deps, 1));
    const both = await decode(
      await renderSnapshot(pdf, [{ page: 1, top: 715, bottom: 565 }, { page: 1, top: 500, bottom: 400 }], deps, 1),
    );
    expect(both.height).toBeGreaterThan(Math.max(one.height, two.height));
    expect(both.height).toBe(one.height + two.height + 8);
  });

  it('clamps bands that run past the page edge', async () => {
    const img = await decode(await renderSnapshot(await makeVisualPdf(), [{ page: 1, top: 900, bottom: 700 }], deps, 1));
    expect(img.height).toBe(792 - 700);
  });

  it('rejects empty segment lists and bad page numbers', async () => {
    const pdf = await makeVisualPdf();
    await expect(renderSnapshot(pdf, [], deps)).rejects.toThrow(/at least one segment/);
    await expect(renderSnapshot(pdf, [{ page: 2, top: 700, bottom: 600 }], deps)).rejects.toThrow(/page 2/);
    await expect(renderSnapshot(pdf, [{ page: 1, top: -5, bottom: -50 }], deps)).rejects.toThrow(/empty/);
  });
});
