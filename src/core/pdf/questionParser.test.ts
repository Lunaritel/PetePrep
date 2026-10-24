import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractPages } from './extract';
import { buildLines, isKeyPage, stripRunningText } from './layout';
import { parseQuestions } from './questionParser';
import { fingerprint } from './testing/fingerprint';
import type { Line, TextItem } from './types';

function item(str: string, x: number, y: number, page = 1): TextItem {
  return { page, x, y, width: str.length * 5, height: 10, str };
}

/** A line made of one marker item plus (optionally) a text item, like pdf.js emits. */
function line(marker: string | null, text: string, y: number, page = 1, markerX = 49): Line {
  const items: TextItem[] = [];
  if (marker) items.push(item(marker, markerX, y, page));
  if (text) items.push(item(text, marker ? markerX + 12 : 61, y, page));
  return {
    page,
    y,
    x: items[0].x,
    text: [marker, text].filter(Boolean).join(' '),
    items,
  };
}

function question(n: number, y: number, page = 1): Line[] {
  return [
    line(`${n}.`, `Prompt ${n}`, y, page),
    line('A.', `a${n}`, y - 14, page, 61),
    line('B.', `b${n}`, y - 28, page, 61),
    line('C.', `c${n}`, y - 42, page, 61),
    line('D.', `d${n}`, y - 56, page, 61),
  ];
}

describe('parseQuestions', () => {
  it('accepts markers merged into the same text item as the text (other PDF generators)', () => {
    const merged = (text: string, y: number): Line => ({ page: 1, y, x: 49, text, items: [item(text, 49, y)] });
    const { questions, issues } = parseQuestions([
      merged('1. Which is right?', 700),
      merged('A. one', 680),
      merged('B. two', 666),
      merged('C. three', 652),
      merged('D. four', 638),
    ]);
    expect(issues).toEqual([]);
    expect(questions[0].prompt).toBe('Which is right?');
    expect(questions[0].options).toEqual(['one', 'two', 'three', 'four']);
  });

  it('parses a simple question and ignores cover-page lines before the first marker', () => {
    const lines = [line(null, 'SAMPLE EXAM', 500), ...question(1, 700)];
    const { questions, issues } = parseQuestions(lines);
    expect(issues).toEqual([]);
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({
      number: 1,
      prompt: 'Prompt 1',
      options: ['a1', 'b1', 'c1', 'd1'],
      sourcePage: 1,
    });
  });

  it('joins a wrapped prompt and a wrapped option', () => {
    const lines = [
      line('1.', 'To evaluate an online source, what aspect would you consider', 700),
      line(null, 'to read?', 688),
      line('A.', 'Relevance', 670, 1, 61),
      line('B.', 'Objectivity and a very long', 656, 1, 61),
      line(null, 'second line of the option', 644),
      line('C.', 'Timeliness', 630, 1, 61),
      line('D.', 'Presentation', 616, 1, 61),
    ];
    const { questions, issues } = parseQuestions(lines);
    expect(issues).toEqual([]);
    expect(questions[0].prompt).toBe(
      'To evaluate an online source, what aspect would you consider to read?',
    );
    expect(questions[0].options[1]).toBe('Objectivity and a very long second line of the option');
  });

  it('keeps the hyphen when a line ends with a hyphen and the next starts lowercase', () => {
    const lines = [
      line('1.', 'A career-', 700),
      line(null, 'sustaining goal is', 688),
      ...question(1, 700).slice(1),
    ];
    expect(parseQuestions(lines).questions[0].prompt).toBe('A career-sustaining goal is');
  });

  it('continues across a page break and records the starting page', () => {
    const lines = [...question(1, 700, 1), ...question(2, 700, 2)];
    const { questions, issues } = parseQuestions(lines);
    expect(issues).toEqual([]);
    expect(questions.map((q) => [q.number, q.sourcePage])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('accepts an aligned marker that jumps ahead and warns about the gap', () => {
    const lines = [...question(1, 700), ...question(3, 600)];
    const { questions, issues } = parseQuestions(lines);
    expect(questions.map((q) => q.number)).toEqual([1, 3]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'warning', question: 3 });
    expect(issues[0].message).toContain('1 to 3');
  });

  it('flags a question that is missing an option', () => {
    const lines = [
      line('1.', 'Prompt', 700),
      line('A.', 'a', 686, 1, 61),
      line('B.', 'b', 672, 1, 61),
      line('D.', 'd', 644, 1, 61),
    ];
    const { questions, issues } = parseQuestions(lines);
    expect(questions[0].options).toHaveLength(2);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', question: 1 });
  });

  it('does not start a question from a number-looking continuation line', () => {
    const lines = [
      line('1.', 'In which year did the event happen:', 700),
      line(null, '2019. It was a good year.', 688),
      ...question(1, 700).slice(1),
    ];
    const { questions } = parseQuestions(lines);
    expect(questions).toHaveLength(1);
    expect(questions[0].prompt).toBe('In which year did the event happen: 2019. It was a good year.');
  });

  it('ignores an out-of-sequence marker that is not aligned with the previous marker', () => {
    const lines = [...question(1, 700), line('7.', 'stray number in the margin', 600, 1, 300)];
    const { questions } = parseQuestions(lines);
    expect(questions).toHaveLength(1);
    expect(questions[0].options[3]).toBe('d1 7. stray number in the margin');
  });

  it('keeps rawText as the unmodified lines joined with newlines', () => {
    const { questions } = parseQuestions(question(1, 700));
    expect(questions[0].rawText).toBe('1. Prompt 1\nA. a1\nB. b1\nC. c1\nD. d1');
  });
});

const PDF = resolve(__dirname, '../../../../pdfs/HS_Hospitality_Tourism_Cluster_Sample_Exam_20.pdf');

describe('parseQuestions on the real sample exam', () => {
  it.skipIf(!existsSync(PDF))('finds 100 contiguous questions with four options', async () => {
    const pages = await extractPages(new Uint8Array(readFileSync(PDF)));
    // Key pages must be detected before stripping: their "KEY" header repeats on most pages.
    const raw = pages.map(buildLines);
    const lines = stripRunningText(pages, raw);
    const questionLines = lines.filter((_, i) => !isKeyPage(pages[i], raw[i])).flat();
    const { questions, issues } = parseQuestions(questionLines);

    expect(issues).toEqual([]);
    expect(questions).toHaveLength(100);
    expect(questions.map((q) => q.number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
    for (const q of questions) expect(q.options).toHaveLength(4);
    expect(fingerprint(questions[0].prompt)).toBe('262f04324249c8f8');
    expect(fingerprint(questions[99].options[3], 100)).toBe('f17c4be3388925fb');
  });
});
