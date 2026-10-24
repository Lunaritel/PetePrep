import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnswerKey } from './answerKey';
import { extractPages } from './extract';
import { buildLines, isKeyPage, stripRunningText } from './layout';
import type { Line, TextItem } from './types';

function line(page: number, y: number, ...cells: [number, string][]): Line {
  const items: TextItem[] = cells.map(([x, str]) => ({
    page,
    x,
    y,
    width: str.length * 5,
    height: 10,
    str,
  }));
  return { page, y, x: cells[0][0], text: cells.map(([, s]) => s).join(' '), items };
}

describe('parseAnswerKey (synthetic)', () => {
  it('joins wrapped explanations and stops at SOURCE blocks', () => {
    const { entries, issues } = parseAnswerKey([
      line(1, 700, [38, '1.'], [50, 'B']),
      line(1, 690, [50, 'Career. Career goals are goals connected']),
      line(1, 680, [50, 'with work.']),
      line(1, 670, [50, 'SOURCE:'], [118, 'PD:018 Set personal goals']),
      line(1, 660, [50, 'SOURCE:'], [118, 'LAP-PD-918']),
      line(1, 650, [50, 'Go for the Goal']),
      line(1, 640, [38, '2.'], [50, 'D']),
      line(1, 630, [50, 'Presentation. Clear.']),
    ]);
    expect(issues).toEqual([]);
    expect(entries.map((e) => [e.number, e.letter])).toEqual([
      [1, 'B'],
      [2, 'D'],
    ]);
    expect(entries[0].explanation).toBe('Career. Career goals are goals connected with work.');
    expect(entries[0].rawText).toContain('LAP-PD-918');
    expect(entries[0].explanation).not.toContain('SOURCE');
  });

  it('continues an entry across a page break', () => {
    const { entries } = parseAnswerKey([
      line(1, 100, [38, '1.'], [50, 'A']),
      line(1, 90, [50, 'First half of the rationale']),
      line(2, 700, [50, 'and second half.']),
      line(2, 690, [38, '2.'], [50, 'C']),
      line(2, 680, [50, 'Next.']),
    ]);
    expect(entries[0].explanation).toBe('First half of the rationale and second half.');
    expect(entries[1].page).toBe(2);
  });

  it('reports an error when the letter is missing and skips the entry', () => {
    const { entries, issues } = parseAnswerKey([
      line(1, 700, [38, '1.'], [50, 'A']),
      line(1, 690, [50, 'ok']),
      line(1, 680, [38, '2.']),
      line(1, 670, [50, 'orphan text']),
      line(1, 660, [38, '3.'], [50, 'B']),
      line(1, 650, [50, 'fine']),
    ]);
    expect(entries.map((e) => e.number)).toEqual([1, 3]);
    expect(issues).toEqual([expect.objectContaining({ severity: 'error', question: 2 })]);
  });

  it('accepts a letter-only key with an empty-explanation warning', () => {
    const { entries, issues } = parseAnswerKey([
      line(1, 700, [38, '1.'], [50, 'C']),
      line(1, 690, [38, '2.'], [50, 'A']),
    ]);
    expect(entries.map((e) => e.letter)).toEqual(['C', 'A']);
    expect(issues.map((i) => i.severity)).toEqual(['warning', 'warning']);
    expect(entries[0].explanation).toBe('');
  });

  it('does not start an entry on non-sequential or year-like markers', () => {
    const { entries } = parseAnswerKey([
      line(1, 700, [38, '1.'], [50, 'A']),
      line(1, 690, [50, 'Explained in']),
      line(1, 680, [50, '2019.'], [80, 'Retrieved later']),
      line(1, 670, [50, '7.'], [70, 'B']),
      line(1, 660, [50, 'still entry one.']),
      line(1, 650, [38, '2.'], [50, 'B']),
      line(1, 640, [50, 'Second.']),
    ]);
    expect(entries.map((e) => e.number)).toEqual([1, 2]);
    expect(entries[0].explanation).toContain('still entry one.');
  });
});

const pdfDir = resolve(__dirname, '../../../../pdfs');
const real = [
  { file: 'HS_Hospitality_Tourism_Cluster_Sample_Exam_20.pdf', letter: 'D', start: 'Franchisee. Franchising is' },
  { file: '69a1ee5b3ca1c1f9ba6535bf_Hospitality-District Exam.pdf', letter: 'B', start: 'Career. Career goals' },
];

describe('parseAnswerKey (real PDFs)', () => {
  for (const { file, letter, start } of real) {
    const path = resolve(pdfDir, file);
    it.skipIf(!existsSync(path))(
      `parses 100 key entries from ${file}`,
      async () => {
        const pages = await extractPages(new Uint8Array(readFileSync(path)));
        const all = pages.map(buildLines);
        const stripped = stripRunningText(pages, all);
        const keyLines = stripped.filter((_, i) => isKeyPage(pages[i], all[i])).flat();
        const { entries } = parseAnswerKey(keyLines);

        expect(entries).toHaveLength(100);
        expect(entries.map((e) => e.number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
        for (const e of entries) {
          expect(e.explanation, `entry ${e.number}`).not.toBe('');
          expect(e.explanation).not.toContain('SOURCE:');
        }
        expect(entries[0].letter).toBe(letter);
        expect(entries[0].explanation.startsWith(start)).toBe(true);
      },
      60000,
    );
  }
});
