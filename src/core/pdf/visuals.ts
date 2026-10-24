import type { VisualKind, VisualRegion } from './types';

export interface OperatorListLike {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

/** The subset of pdf.js `OPS` this module reads; passed in so core stays free of pdf.js internals. */
export interface OpCodes {
  save: number;
  restore: number;
  transform: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  paintImageXObject: number;
  paintInlineImageXObject: number;
  paintImageMaskXObject: number;
  constructPath: number;
  stroke: number;
  closeStroke: number;
  fill: number;
  eoFill: number;
  fillStroke: number;
  eoFillStroke: number;
  closeFillStroke: number;
  closeEOFillStroke: number;
}

type Matrix = [number, number, number, number, number, number];
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const EDGE_FRACTION = 0.05;
const MERGE_GAP = 8;
const MIN_GRAPHIC_SIZE = 24;
const MIN_GRAPHIC_PARTS = 3;
const MIN_IMAGE_SIZE = 6;
const FULL_PAGE_FRACTION = 0.85;

/** Matrix that applies `m` first, then `n` (PDF `cm` semantics: CTM' = m x CTM). */
function then(m: Matrix, n: Matrix): Matrix {
  return [
    m[0] * n[0] + m[1] * n[2],
    m[0] * n[1] + m[1] * n[3],
    m[2] * n[0] + m[3] * n[2],
    m[2] * n[1] + m[3] * n[3],
    m[4] * n[0] + m[5] * n[2] + n[4],
    m[4] * n[1] + m[5] * n[3] + n[5],
  ];
}

function boxOf(corners: [number, number][], ctm: Matrix): Box {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of corners) {
    xs.push(ctm[0] * x + ctm[2] * y + ctm[4]);
    ys.push(ctm[1] * x + ctm[3] * y + ctm[5]);
  }
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

function isMatrix(value: unknown): value is Matrix {
  return Array.isArray(value) && value.length === 6 && value.every((n) => typeof n === 'number');
}

function toNumbers(value: unknown): number[] | null {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const out = Array.from(value as ArrayLike<number>);
    return out.every((n) => typeof n === 'number' && Number.isFinite(n)) ? out : null;
  }
  return null;
}

function touches(a: Box, b: Box): boolean {
  return (
    a.x0 - MERGE_GAP <= b.x1 && b.x0 - MERGE_GAP <= a.x1 && a.y0 - MERGE_GAP <= b.y1 && b.y0 - MERGE_GAP <= a.y1
  );
}

function cluster(boxes: Box[]): { box: Box; parts: number }[] {
  const groups = boxes.map((box) => ({ box: { ...box }, parts: 1 }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i += 1) {
      for (let j = i + 1; j < groups.length; j += 1) {
        if (!touches(groups[i].box, groups[j].box)) continue;
        const a = groups[i];
        const b = groups[j];
        a.box = {
          x0: Math.min(a.box.x0, b.box.x0),
          y0: Math.min(a.box.y0, b.box.y0),
          x1: Math.max(a.box.x1, b.box.x1),
          y1: Math.max(a.box.y1, b.box.y1),
        };
        a.parts += b.parts;
        groups.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return groups;
}

/**
 * Finds pictures and drawn (ruled / filled) regions on one page from its pdf.js operator list.
 * Page furniture (edge bands, full-page backgrounds, lone rules) is ignored.
 */
export function detectPageVisuals(
  ops: OperatorListLike,
  codes: OpCodes,
  pageWidth: number,
  pageHeight: number,
): VisualRegion[] {
  const paint = new Set([
    codes.stroke,
    codes.closeStroke,
    codes.fill,
    codes.eoFill,
    codes.fillStroke,
    codes.eoFillStroke,
    codes.closeFillStroke,
    codes.closeEOFillStroke,
  ]);
  const images = new Set([codes.paintImageXObject, codes.paintInlineImageXObject, codes.paintImageMaskXObject]);
  const unit: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];

  let ctm = IDENTITY;
  const stack: Matrix[] = [];
  const imageBoxes: Box[] = [];
  const pathBoxes: Box[] = [];

  for (let i = 0; i < ops.fnArray.length; i += 1) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === codes.save || fn === codes.paintFormXObjectBegin) {
      stack.push(ctm);
      if (fn === codes.paintFormXObjectBegin && Array.isArray(args) && isMatrix(args[0])) ctm = then(args[0], ctm);
    } else if (fn === codes.restore || fn === codes.paintFormXObjectEnd) {
      ctm = stack.pop() ?? IDENTITY;
    } else if (fn === codes.transform && isMatrix(args)) {
      ctm = then(args, ctm);
    } else if (images.has(fn)) {
      imageBoxes.push(boxOf(unit, ctm));
    } else if (fn === codes.constructPath && Array.isArray(args) && paint.has(args[0] as number)) {
      const mm = toNumbers(args[2]);
      if (mm && mm.length === 4) {
        pathBoxes.push(boxOf([[mm[0], mm[1]], [mm[2], mm[3]]], ctm));
      }
    }
  }

  const regions: VisualRegion[] = [];
  const keep = (box: Box, kind: VisualKind): void => {
    const width = box.x1 - box.x0;
    const height = box.y1 - box.y0;
    const centre = (box.y0 + box.y1) / 2;
    if (centre < pageHeight * EDGE_FRACTION || centre > pageHeight * (1 - EDGE_FRACTION)) return;
    if (width > pageWidth * FULL_PAGE_FRACTION && height > pageHeight * FULL_PAGE_FRACTION) return;
    regions.push({ kind, ...box });
  };

  for (const box of imageBoxes) {
    if (box.x1 - box.x0 >= MIN_IMAGE_SIZE && box.y1 - box.y0 >= MIN_IMAGE_SIZE) keep(box, 'image');
  }
  for (const { box, parts } of cluster(pathBoxes)) {
    const bigEnough = box.x1 - box.x0 >= MIN_GRAPHIC_SIZE && box.y1 - box.y0 >= MIN_GRAPHIC_SIZE;
    if (parts >= MIN_GRAPHIC_PARTS || bigEnough) keep(box, 'graphic');
  }
  return regions.sort((a, b) => b.y1 - a.y1);
}
