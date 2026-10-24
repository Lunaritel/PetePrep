import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseExamFromPages, parseExamPdf } from './parseExam';
import { fingerprint } from './testing/fingerprint';

const PDF_DIR = '../pdfs';
const EXAMS = [
  { file: 'HS_Hospitality_Tourism_Cluster_Sample_Exam_20.pdf', code: '1206', q1Key: 3, q1Print: '262f04324249c8f8', reviewed: [47] },
  { file: '69a1ee5b3ca1c1f9ba6535bf_Hospitality-District Exam.pdf', code: '1323', q1Key: 1, q1Print: '062c579ac560ead2', reviewed: [] },
];

describe('parseExamPdf (real exams)', () => {
  for (const exam of EXAMS) {
    const path = `${PDF_DIR}/${exam.file}`;
    it.skipIf(!existsSync(path))(`parses ${exam.file} cleanly`, async () => {
      const parsed = await parseExamPdf(new Uint8Array(readFileSync(path)));
      const errors = parsed.report.issues.filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);
      expect(parsed.report.ok).toBe(true);
      expect(parsed.testCode).toBe(exam.code);
      expect(parsed.questions).toHaveLength(100);
      expect(parsed.questions.map((q) => q.number)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
      for (const q of parsed.questions) {
        expect(q.options).toHaveLength(4);
        expect(q.explanation).not.toBe('');
        expect(q.explanation).not.toContain('SOURCE:');
      }
      expect(fingerprint(parsed.questions[0].prompt)).toBe(exam.q1Print);
      expect(parsed.questions[0].correctIndex).toBe(exam.q1Key);
      // Q41 ends a page; its last option must not swallow the next page's running header.
      expect(parsed.questions[40].options[3]).not.toMatch(/Test \d+/);
      expect(parsed.title).not.toMatch(/\d$/);
      // No header, footer or citation text may leak into any parsed field.
      const leak = /Test \d{3,}|Copyright|KEY|SOURCE|Retrieved|https?:|LAP-/;
      for (const q of parsed.questions) {
        for (const text of [q.prompt, ...q.options, q.explanation]) expect(text, `Q${q.number}`).not.toMatch(leak);
      }
      // Every key letter must agree with the rationale's opening words, or be reviewed by hand.
      const unverified = parsed.report.issues.filter((i) => i.severity === 'warning').map((i) => i.question);
      expect(unverified).toEqual(exam.reviewed);
    }, 30000);
  }
});

describe('parseExamFromPages (refusals)', () => {
  it('rejects a document with no text layer', () => {
    const parsed = parseExamFromPages([{ page: 1, width: 612, height: 792, items: [] }]);
    expect(parsed.report.ok).toBe(false);
    expect(parsed.report.issues.some((i) => /scan/i.test(i.message))).toBe(true);
  });
});
