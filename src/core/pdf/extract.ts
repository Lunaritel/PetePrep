import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PageItems, TextItem } from './types';
import { detectPageVisuals } from './visuals';

interface RawTextItem {
  str: string;
  width: number;
  height: number;
  transform: number[];
}

function isTextItem(item: unknown): item is RawTextItem {
  return typeof item === 'object' && item !== null && 'str' in item && 'transform' in item;
}

export async function extractPages(data: Uint8Array): Promise<PageItems[]> {
  const task = getDocument({ data, useSystemFonts: true, verbosity: 0 });
  const doc = await task.promise;
  const pages: PageItems[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n += 1) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const raw of content.items) {
        if (!isTextItem(raw) || raw.str.trim() === '') continue;
        items.push({
          page: n,
          x: raw.transform[4],
          y: raw.transform[5],
          width: raw.width,
          height: raw.height,
          str: raw.str,
        });
      }
      const visuals = detectPageVisuals(await page.getOperatorList(), OPS, viewport.width, viewport.height);
      pages.push({ page: n, width: viewport.width, height: viewport.height, items, visuals });
    }
  } finally {
    await task.destroy();
  }
  return pages;
}
