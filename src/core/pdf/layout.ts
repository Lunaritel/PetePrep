import type { Line, PageItems, TextItem } from './types';

const Y_TOLERANCE = 2;
const SPACE_GAP = 1;

export function buildLines(page: PageItems): Line[] {
  const sorted = [...page.items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const item of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - item.y) <= Y_TOLERANCE) row.push(item);
    else rows.push([item]);
  }
  return rows.map((row) => {
    const items = [...row].sort((a, b) => a.x - b.x);
    let text = items[0].str;
    for (let i = 1; i < items.length; i += 1) {
      const prev = items[i - 1];
      const gap = items[i].x - (prev.x + prev.width);
      const needsSpace = gap > SPACE_GAP && !text.endsWith(' ') && !items[i].str.startsWith(' ');
      text += (needsSpace ? ' ' : '') + items[i].str;
    }
    return { page: page.page, y: items[0].y, x: items[0].x, text: text.trim(), items };
  });
}

const DIGITS = /\d+/g;

function normalise(text: string): string {
  return text.replace(DIGITS, '#');
}

/**
 * Drops running headers/footers: lines in the top or bottom band of a page whose
 * digit-normalised text repeats on at least half of the pages.
 */
export function stripRunningText(pages: PageItems[], lines: Line[][]): Line[][] {
  if (pages.length < 3) return lines;
  const counts = new Map<string, number>();
  const seen = (page: PageItems, line: Line): string | null => {
    const inBand = line.y > page.height * 0.9 || line.y < page.height * 0.08;
    return inBand ? `${line.y > page.height / 2 ? 'top' : 'bottom'}:${normalise(line.text)}` : null;
  };
  pages.forEach((page, i) => {
    const keys = new Set<string>();
    for (const line of lines[i]) {
      const key = seen(page, line);
      if (key) keys.add(key);
    }
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  // Question pages and key pages carry different headers, so each may be well under half the document.
  const threshold = Math.max(3, pages.length * 0.25);
  return lines.map((pageLines, i) =>
    pageLines.filter((line) => {
      const key = seen(pages[i], line);
      return !key || (counts.get(key) ?? 0) < threshold;
    }),
  );
}

/** A key page carries "KEY" in its running header (top band). */
export function isKeyPage(page: PageItems, lines: Line[]): boolean {
  return lines.some((l) => l.y > page.height * 0.9 && /\bKEY\b/.test(l.text));
}

export function joinWrapped(parts: string[]): string {
  let out = '';
  for (const raw of parts) {
    const part = raw.trim();
    if (!part) continue;
    if (!out) out = part;
    else if (/[A-Za-z]-$/.test(out) && /^[a-z]/.test(part)) out += part;
    else out += ' ' + part;
  }
  return out;
}
