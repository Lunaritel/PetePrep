import type { KeyEntry } from './answerKey';
import type { RawQuestion } from './questionParser';
import type { ParsedQuestion, ReportIssue } from './types';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const LETTER_REF = /\b(?:correct\s+(?:answer|choice|option)|answer)\s+(?:is|would be)\s+\(?[A-D]\b/i;

function stripPunctuation(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** The DECA key opens each rationale with the correct option's text (the option, a period, then the explanation). */
export function explanationAgrees(explanation: string, option: string): boolean {
  const wanted = stripPunctuation(option);
  return wanted !== '' && stripPunctuation(explanation).startsWith(wanted);
}

export interface ValidationResult {
  questions: ParsedQuestion[];
  issues: ReportIssue[];
}

export function validateAndMerge(
  raw: RawQuestion[],
  keys: KeyEntry[],
  pageCount: number,
): ValidationResult {
  const issues: ReportIssue[] = [];
  const keyByNumber = new Map(keys.map((k) => [k.number, k]));

  if (raw.length === 0) {
    issues.push({
      severity: 'error',
      message:
        pageCount > 0
          ? 'No questions were found. This PDF may be a scan with no text layer, or an unsupported layout.'
          : 'The PDF has no pages.',
    });
  }
  if (raw.length !== keys.length) {
    issues.push({
      severity: 'error',
      message: `Found ${raw.length} questions but ${keys.length} answer-key entries.`,
    });
  }
  raw.forEach((q, i) => {
    if (q.number !== i + 1) {
      issues.push({ severity: 'error', question: q.number, message: `Question numbering is not contiguous (expected ${i + 1}).` });
    }
  });

  const seenStems = new Map<string, number>();
  const questions: ParsedQuestion[] = [];

  for (const q of raw) {
    const key = keyByNumber.get(q.number);
    let confidence = 1;
    const flag = (severity: 'error' | 'warning', message: string, penalty: number): void => {
      issues.push({ severity, question: q.number, message });
      confidence = Math.max(0, confidence - penalty);
    };

    if (!key) {
      flag('error', 'No answer-key entry for this question.', 1);
      continue;
    }
    if (q.options.length !== 4) continue; // already reported by the question parser

    const stem = stripPunctuation(q.prompt);
    const dup = seenStems.get(stem);
    if (dup !== undefined) flag('warning', `Same question text as question ${dup}.`, 0.2);
    else seenStems.set(stem, q.number);

    if (stem.length < 10) flag('warning', 'Question text is unusually short.', 0.3);
    q.options.forEach((opt, i) => {
      if (opt.trim() === '') flag('error', `Option ${LETTERS[i]} is empty.`, 1);
    });

    const correctIndex = LETTERS.indexOf(key.letter);
    if (!key.explanation) flag('warning', 'No explanation in the answer key.', 0.2);
    else if (!explanationAgrees(key.explanation, q.options[correctIndex])) {
      flag('warning', `Explanation does not start with the text of option ${key.letter}; check the key.`, 0.4);
    }

    questions.push({
      number: q.number,
      prompt: q.prompt,
      options: q.options,
      correctIndex,
      explanation: key.explanation,
      sourcePage: q.sourcePage,
      rawText: q.rawText,
      parseConfidence: Math.round(confidence * 100) / 100,
      hasLetterRefs: LETTER_REF.test(key.explanation),
    });
  }

  for (const k of keys) {
    if (!raw.some((q) => q.number === k.number)) {
      issues.push({ severity: 'error', question: k.number, message: 'Answer-key entry has no matching question.' });
    }
  }
  return { questions, issues };
}
