import type { ParsedExam, ParsedQuestion, ReportIssue } from '../../../../core/pdf/types';
import type { NewQuestion } from '../../storage/contract';

export type Options = [string, string, string, string];

/** A parsed question being reviewed: editable fields plus review bookkeeping. */
export interface Draft {
  number: number;
  prompt: string;
  options: Options;
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  sourcePage: number;
  parseConfidence: number;
  rawText: string;
  hasLetterRefs: boolean;
  excluded: boolean;
  /** Parser doubted this question (low confidence or a report issue). */
  flagged: boolean;
  /** Why it was flagged, in plain language. */
  reasons: string[];
  /** The user edited it or ticked "I checked this", which clears the flag. */
  checked: boolean;
  /** Has a picture or table that text extraction cannot capture. */
  hasVisual: boolean;
  snapshot?: Blob;
}

export type EditableField = 'prompt' | 'explanation';

export function toDrafts(parsed: ParsedExam): Draft[] {
  const issuesByQuestion = new Map<number, ReportIssue[]>();
  for (const issue of parsed.report.issues) {
    if (issue.question === undefined) continue;
    const list = issuesByQuestion.get(issue.question) ?? [];
    list.push(issue);
    issuesByQuestion.set(issue.question, list);
  }
  return parsed.questions.map((q: ParsedQuestion) => {
    const issues = issuesByQuestion.get(q.number) ?? [];
    const reasons = issues.map((i) => i.message);
    if (q.parseConfidence < 1 && reasons.length === 0) reasons.push('The parser was not fully sure about this question.');
    return {
      number: q.number,
      prompt: q.prompt,
      options: [...q.options] as Options,
      correctIndex: q.correctIndex as 0 | 1 | 2 | 3,
      explanation: q.explanation,
      sourcePage: q.sourcePage,
      parseConfidence: q.parseConfidence,
      rawText: q.rawText,
      hasLetterRefs: q.hasLetterRefs,
      excluded: false,
      flagged: reasons.length > 0,
      reasons,
      checked: false,
      hasVisual: q.visual !== undefined,
    };
  });
}

export const needsReview = (d: Draft): boolean => d.flagged && !d.checked;

export function setField(drafts: Draft[], number: number, field: EditableField, value: string): Draft[] {
  return drafts.map((d) => (d.number === number ? { ...d, [field]: value, checked: true } : d));
}

export function setOption(drafts: Draft[], number: number, index: number, value: string): Draft[] {
  return drafts.map((d) => {
    if (d.number !== number) return d;
    const options = [...d.options] as Options;
    options[index] = value;
    return { ...d, options, checked: true };
  });
}

export function setCorrect(drafts: Draft[], number: number, index: 0 | 1 | 2 | 3): Draft[] {
  return drafts.map((d) => (d.number === number ? { ...d, correctIndex: index, checked: true } : d));
}

export function toggleExcluded(drafts: Draft[], number: number): Draft[] {
  return drafts.map((d) => (d.number === number ? { ...d, excluded: !d.excluded } : d));
}

export function markChecked(drafts: Draft[], number: number): Draft[] {
  return drafts.map((d) => (d.number === number ? { ...d, checked: true } : d));
}

/** Problems that must be fixed (or the question excluded) before saving. */
export function blockingProblems(d: Draft): string[] {
  if (d.excluded) return [];
  const problems: string[] = [];
  if (d.prompt.trim() === '') problems.push('The question text is empty.');
  d.options.forEach((o, i) => {
    if (o.trim() === '') problems.push(`Option ${'ABCD'[i]} is empty.`);
  });
  return problems;
}

export interface Summary {
  included: number;
  excluded: number;
  /** Included questions that were flagged and the user has not edited or checked. */
  unreviewed: number;
  /** Included questions with problems that block saving. */
  blocked: number;
  canSave: boolean;
}

export function summarise(drafts: Draft[]): Summary {
  const included = drafts.filter((d) => !d.excluded);
  const unreviewed = included.filter(needsReview).length;
  const blocked = included.filter((d) => blockingProblems(d).length > 0).length;
  return {
    included: included.length,
    excluded: drafts.length - included.length,
    unreviewed,
    blocked,
    canSave: included.length > 0 && blocked === 0,
  };
}

/** All questions are kept (excluded ones too, for re-parsing); only `excluded` decides what is studied. */
export function toNewQuestions(drafts: Draft[]): NewQuestion[] {
  return drafts.map((d) => ({
    number: d.number,
    prompt: d.prompt.trim(),
    options: d.options.map((o) => o.trim()) as Options,
    correctIndex: d.correctIndex,
    explanation: d.explanation.trim(),
    sourcePage: d.sourcePage,
    parseConfidence: d.parseConfidence,
    rawText: d.rawText,
    hasLetterRefs: d.hasLetterRefs,
    excluded: d.excluded,
    snapshot: d.snapshot,
  }));
}
