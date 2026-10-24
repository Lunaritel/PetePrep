import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { attachVisuals, dropFigureText } from './attachVisuals';
import { extractPages } from './extract';
import { buildLines, isKeyPage, stripRunningText } from './layout';
import { parseExamPdf } from './parseExam';
import { parseQuestions, type RawQuestion } from './questionParser';
import { makeVisualPdf } from './testing/makeVisualPdf';
import type { PageItems, SnapshotSegment, VisualRegion } from './types';

function q(number: number, extents: SnapshotSegment[]): RawQuestion {
  return { number, prompt: `q${number}`, options: ['a', 'b', 'c', 'd'], sourcePage: extents[0].page, rawText: '', extents };
}

function page(n: number, visuals: VisualRegion[]): PageItems {
  return { page: n, width: 612, height: 792, items: [], visuals };
}

const image = (y0: number, y1: number): VisualRegion => ({ kind: 'image', x0: 70, y0, x1: 190, y1 });

describe('attachVisuals', () => {
  it('gives a region to the question whose text starts above it', () => {
    const qs = [q(1, [{ page: 1, top: 700, bottom: 600 }]), q(2, [{ page: 1, top: 500, bottom: 420 }])];
    const out = attachVisuals(qs, [page(1, [image(540, 580)])]);
    expect([...out.keys()]).toEqual([1]);
    expect(out.get(1)?.kinds).toEqual(['image']);
    // Band covers the question's text and reaches down past the figure.
    expect(out.get(1)?.segments).toEqual([{ page: 1, top: 700, bottom: 536 }].map((s) => ({ ...s, bottom: Math.min(600, s.bottom) })));
  });

  it('leaves questions without figures untouched', () => {
    expect(attachVisuals([q(1, [{ page: 1, top: 700, bottom: 600 }])], [page(1, [])]).size).toBe(0);
  });

  it('assigns a region at the top of a page to the question carried over from the previous page', () => {
    const qs = [
      q(7, [{ page: 1, top: 200, bottom: 100 }, { page: 2, top: 700, bottom: 680 }]),
      q(8, [{ page: 2, top: 400, bottom: 320 }]),
    ];
    const out = attachVisuals(qs, [page(1, []), page(2, [image(500, 640)])]);
    expect([...out.keys()]).toEqual([7]);
    expect(out.get(7)?.segments.map((s) => s.page)).toEqual([1, 2]);
  });

  it('assigns a region above the first question on a page to the last question of the previous page', () => {
    const qs = [q(3, [{ page: 1, top: 200, bottom: 100 }]), q(4, [{ page: 2, top: 500, bottom: 420 }])];
    const out = attachVisuals(qs, [page(1, []), page(2, [image(600, 700)])]);
    expect([...out.keys()]).toEqual([3]);
  });

  it('shows the question that owns an image and one that owns a ruled table (generated PDF)', async () => {
    const pages = await extractPages(await makeVisualPdf());
    const lines = stripRunningText(pages, pages.map(buildLines));
    const { questions } = parseQuestions(lines.flat());
    expect(questions.map((x) => x.number)).toEqual([1, 2, 3]);
    expect(pages[0].visuals?.map((v) => v.kind).sort()).toEqual(['graphic', 'image']);

    const out = attachVisuals(questions, pages);
    expect(out.get(1)?.kinds).toEqual(['image']);
    expect(out.get(2)?.kinds).toEqual(['graphic']);
    expect(out.has(3)).toBe(false);
    // Q1's band contains its text and the picture (picture spans y 612..692).
    const band = out.get(1)!.segments[0];
    expect(band.top).toBeGreaterThanOrEqual(700);
    expect(band.bottom).toBeLessThanOrEqual(608);
  });
});

describe('dropFigureText', () => {
  it('keeps table cell text out of the typed question but leaves the stem and options', async () => {
    const pages = await extractPages(await makeVisualPdf());
    const lines = stripRunningText(pages, pages.map(buildLines)).flat();
    const { questions: before } = parseQuestions(lines);
    expect(before[1].rawText).toContain('Cell');
    const { questions } = parseQuestions(dropFigureText(lines, pages));
    expect(questions[1].prompt).toBe('Use the table to answer the question.');
    expect(questions[1].options).toEqual(['alpha', 'beta', 'gamma', 'delta']);
    expect(questions[0].prompt).toBe('Which item is shown in the picture below?');
  });
});

describe('visual detection on the real exams', () => {
  for (const file of ['HS_Hospitality_Tourism_Cluster_Sample_Exam_20.pdf', '69a1ee5b3ca1c1f9ba6535bf_Hospitality-District Exam.pdf']) {
    const path = `../pdfs/${file}`;
    it.skipIf(!existsSync(path))(`${file}: reports no figures unless one is really there`, async () => {
      const data = new Uint8Array(readFileSync(path));
      const pages = await extractPages(data.slice());
      // Page 1 is the cover, whose decorative title boxes are expected; question pages must be clean.
      const flagged = pages.filter((p) => p.page > 1).flatMap((p) => (p.visuals ?? []).map((v) => `p${p.page}:${v.kind}@${Math.round(v.y0)}-${Math.round(v.y1)}`));
      const parsed = await parseExamPdf(data);
      const withVisual = parsed.questions.filter((x) => x.visual).map((x) => x.number);
      // Both sample exams are text-only, so any hit here is a false positive to investigate.
      expect({ flagged, withVisual }).toEqual({ flagged: [], withVisual: [] });
      expect(pages.some((p) => isKeyPage(p, buildLines(p)))).toBe(true);
    }, 30000);
  }
});
