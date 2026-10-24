import { describe, expect, it } from 'vitest';
import { parsedExam, parsedQuestion } from './fixtures';
import {
  blockingProblems,
  markChecked,
  needsReview,
  setCorrect,
  setField,
  setOption,
  summarise,
  toDrafts,
  toNewQuestions,
  toggleExcluded,
} from './importState';

const exam = parsedExam(
  [parsedQuestion(1), parsedQuestion(2, { parseConfidence: 0.6 }), parsedQuestion(3)],
  [{ severity: 'warning', question: 3, message: 'Explanation does not start with option B.' }],
);

describe('import drafts', () => {
  it('flags questions with a report issue or low confidence, with plain reasons', () => {
    const drafts = toDrafts(exam);
    expect(drafts.map((d) => d.flagged)).toEqual([false, true, true]);
    expect(drafts[1].reasons[0]).toMatch(/not fully sure/);
    expect(drafts[2].reasons).toEqual(['Explanation does not start with option B.']);
  });

  it('editing any field clears the flag; so does ticking "checked"', () => {
    let drafts = toDrafts(exam);
    expect(drafts.filter(needsReview)).toHaveLength(2);
    drafts = setField(drafts, 2, 'prompt', 'Fixed text');
    drafts = markChecked(drafts, 3);
    expect(drafts.filter(needsReview)).toHaveLength(0);
    expect(drafts[1].prompt).toBe('Fixed text');
    expect(drafts[1].flagged).toBe(true); // history is kept, only the open review is cleared

    drafts = toDrafts(exam);
    expect(needsReview(setOption(drafts, 2, 0, 'x')[1])).toBe(false);
    expect(needsReview(setCorrect(drafts, 2, 3)[1])).toBe(false);
  });

  it('excluding does not clear the flag but removes the question from the summary', () => {
    let drafts = toDrafts(exam);
    drafts = toggleExcluded(drafts, 2);
    expect(summarise(drafts)).toMatchObject({ included: 2, excluded: 1, unreviewed: 1, canSave: true });
  });

  it('cannot save with zero included questions', () => {
    let drafts = toDrafts(exam);
    for (const n of [1, 2, 3]) drafts = toggleExcluded(drafts, n);
    expect(summarise(drafts)).toMatchObject({ included: 0, canSave: false });
  });

  it('blocks empty question text or options, unless the question is excluded', () => {
    let drafts = toDrafts(exam);
    drafts = setField(drafts, 1, 'prompt', '   ');
    drafts = setOption(drafts, 1, 2, '');
    expect(blockingProblems(drafts[0])).toEqual(['The question text is empty.', 'Option C is empty.']);
    expect(summarise(drafts)).toMatchObject({ blocked: 1, canSave: false });
    expect(summarise(toggleExcluded(drafts, 1)).canSave).toBe(true);
  });

  it('keeps excluded questions in the saved rows, trimmed, with their snapshot', () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    let drafts = toDrafts(exam);
    drafts[0].snapshot = blob;
    drafts = setOption(drafts, 1, 0, '  padded  ');
    drafts = toggleExcluded(drafts, 3);
    const rows = toNewQuestions(drafts);
    expect(rows).toHaveLength(3);
    expect(rows[0].options[0]).toBe('padded');
    expect(rows[0].snapshot).toBe(blob);
    expect(rows[2].excluded).toBe(true);
    expect(rows[1]).toMatchObject({ number: 2, correctIndex: 1, sourcePage: 2 });
  });

  it('marks questions that have a picture or table', () => {
    const withVisual = parsedExam([parsedQuestion(1, { visual: { kinds: ['image'], segments: [{ page: 2, top: 700, bottom: 600 }] } })]);
    expect(toDrafts(withVisual)[0].hasVisual).toBe(true);
  });
});
