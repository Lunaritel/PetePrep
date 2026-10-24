import { parseAnswerKey } from './answerKey';
import { extractPages } from './extract';
import { buildLines, isKeyPage, stripRunningText } from './layout';
import { parseQuestions } from './questionParser';
import type { Line, PageItems, ParsedExam, ReportIssue } from './types';
import { validateAndMerge } from './validate';

const MIN_TEXT_ITEMS = 20;

function findHeader(lines: Line[][], height: number): { title: string; testCode?: string } {
  const top = lines.flat().filter((l) => l.y > height * 0.9);
  const code = top.map((l) => /\bTest\s+(\d+)/.exec(l.text)?.[1]).find(Boolean);
  const titleLine = top.find((l) => /EXAM/.test(l.text) && !/KEY/.test(l.text));
  const title = (titleLine?.text ?? 'Imported exam').replace(/^Test\s+\d+\s*/, '').replace(/\s+\d+$/, '').trim();
  return { title: title || 'Imported exam', testCode: code };
}

export function parseExamFromPages(pages: PageItems[]): ParsedExam {
  const rawLines = pages.map(buildLines);
  const keyFlags = pages.map((p, i) => isKeyPage(p, rawLines[i]));
  const height = pages[0]?.height ?? 792;
  const header = findHeader(rawLines.filter((_, i) => !keyFlags[i]), height);
  const cleaned = stripRunningText(pages, rawLines);

  const questionLines = cleaned.filter((_, i) => !keyFlags[i]).flat();
  const keyLines = cleaned.filter((_, i) => keyFlags[i]).flat();

  const issues: ReportIssue[] = [];
  const totalItems = pages.reduce((n, p) => n + p.items.length, 0);
  if (totalItems < MIN_TEXT_ITEMS * Math.max(1, pages.length) * 0.25) {
    issues.push({ severity: 'error', message: 'This PDF has almost no selectable text, so it looks scanned. Scanned PDFs are not supported.' });
  }
  if (!keyFlags.some(Boolean)) {
    issues.push({ severity: 'error', message: 'No answer-key pages were found (expected pages headed "KEY").' });
  }

  const parsedQ = parseQuestions(questionLines);
  const parsedK = parseAnswerKey(keyLines);
  const merged = validateAndMerge(parsedQ.questions, parsedK.entries, pages.length);
  const all = [...issues, ...parsedQ.issues, ...parsedK.issues, ...merged.issues];

  return {
    title: header.title,
    testCode: header.testCode,
    questions: merged.questions,
    report: {
      ok: !all.some((i) => i.severity === 'error'),
      pageCount: pages.length,
      questionCount: parsedQ.questions.length,
      keyCount: parsedK.entries.length,
      issues: all,
    },
  };
}

export async function parseExamPdf(data: Uint8Array): Promise<ParsedExam> {
  return parseExamFromPages(await extractPages(data));
}
