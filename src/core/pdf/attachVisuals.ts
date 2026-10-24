import type { RawQuestion } from './questionParser';
import type { Line, PageItems, SnapshotSegment, VisualKind, VisualRegion } from './types';

const PAD = 4;
const EDGE_FRACTION = 0.05;

export interface QuestionVisual {
  kinds: VisualKind[];
  segments: SnapshotSegment[];
}

interface Owned {
  extents: Map<number, SnapshotSegment>;
  kinds: Set<VisualKind>;
}

function grow(map: Map<number, SnapshotSegment>, page: number, top: number, bottom: number): void {
  const seen = map.get(page);
  if (seen) {
    seen.top = Math.max(seen.top, top);
    seen.bottom = Math.min(seen.bottom, bottom);
  } else {
    map.set(page, { page, top, bottom });
  }
}

/**
 * Decides which question owns each picture or drawn region and returns the page bands to screenshot
 * so the whole question (text, figure and options) can be shown as it appears in the PDF.
 *
 * A region belongs to the question whose text starts above it and whose next question starts below it.
 * A region above all text on a page continues the last question of the previous page.
 */
export function attachVisuals(questions: RawQuestion[], pages: PageItems[]): Map<number, QuestionVisual> {
  const owned = new Map<number, Owned>();

  for (const page of pages) {
    const regions: VisualRegion[] = page.visuals ?? [];
    if (regions.length === 0) continue;

    const entries = questions
      .flatMap((q) => q.extents.filter((e) => e.page === page.page).map((e) => ({ q, extent: e })))
      .sort((a, b) => b.extent.top - a.extent.top);

    for (const region of regions) {
      const centre = (region.y0 + region.y1) / 2;
      let owner: RawQuestion | undefined;

      for (let i = 0; i < entries.length; i += 1) {
        const next = entries[i + 1]?.extent.top ?? page.height * EDGE_FRACTION;
        if (centre <= entries[i].extent.top && centre > next) {
          owner = entries[i].q;
          break;
        }
      }
      if (!owner) {
        // Above all text on this page: it belongs to the question still open from the previous page.
        const first = entries[0]?.q;
        if (first && first.sourcePage < page.page) owner = first;
        else owner = [...questions].reverse().find((q) => q.sourcePage < page.page);
      }
      if (!owner) continue;

      const entry = owned.get(owner.number) ?? { extents: new Map(), kinds: new Set<VisualKind>() };
      for (const e of owner.extents) grow(entry.extents, e.page, e.top, e.bottom);
      grow(entry.extents, page.page, region.y1 + PAD, region.y0 - PAD);
      entry.kinds.add(region.kind);
      owned.set(owner.number, entry);
    }
  }

  const out = new Map<number, QuestionVisual>();
  for (const [number, entry] of owned) {
    out.set(number, {
      kinds: [...entry.kinds].sort(),
      segments: [...entry.extents.values()].sort((a, b) => a.page - b.page),
    });
  }
  return out;
}

const MARKER = /^(?:\d{1,3}|[A-D])\.$/;

/**
 * Removes text that sits inside a detected figure (table cells, chart labels) so it does not leak into
 * the typed question text. The screenshot still shows it. Question and option markers are always kept.
 */
export function dropFigureText(lines: Line[], pages: PageItems[]): Line[] {
  const byPage = new Map(pages.map((p) => [p.page, p.visuals ?? []]));
  return lines.filter((line) => {
    if (MARKER.test(line.items[0]?.str ?? '')) return true;
    const regions = byPage.get(line.page) ?? [];
    return !regions.some(
      (r) => r.kind === 'graphic' && line.y >= r.y0 - 2 && line.y <= r.y1 + 2 && line.items.every((i) => i.x >= r.x0 - 2 && i.x + i.width <= r.x1 + 2),
    );
  });
}
