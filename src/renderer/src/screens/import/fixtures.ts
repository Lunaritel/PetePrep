import type { ParsedExam, ParsedQuestion, ReportIssue } from '../../../../core/pdf/types';

export function parsedQuestion(number: number, overrides: Partial<ParsedQuestion> = {}): ParsedQuestion {
  return {
    number,
    prompt: `Which answer is right for question ${number}?`,
    options: [`alpha ${number}`, `beta ${number}`, `gamma ${number}`, `delta ${number}`],
    correctIndex: 1,
    explanation: `Beta ${number}. Because beta is right.`,
    sourcePage: 2 + Math.floor((number - 1) / 7),
    rawText: `${number}. raw`,
    parseConfidence: 1,
    hasLetterRefs: false,
    ...overrides,
  };
}

export function parsedExam(
  questions: ParsedQuestion[],
  issues: ReportIssue[] = [],
  overrides: Partial<ParsedExam> = {},
): ParsedExam {
  return {
    title: 'HOSPITALITY AND TOURISM CLUSTER EXAM',
    testCode: '1206',
    questions,
    report: {
      ok: !issues.some((i) => i.severity === 'error'),
      pageCount: 33,
      questionCount: questions.length,
      keyCount: questions.length,
      issues,
    },
    ...overrides,
  };
}
