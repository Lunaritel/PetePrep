import { joinWrapped } from './layout';
import type { Line, ReportIssue } from './types';

export interface RawQuestion {
  number: number;
  prompt: string;
  options: string[];
  sourcePage: number;
  rawText: string;
}

const QUESTION_MARKER = /^(\d{1,3})\.$/;
const OPTION_MARKER = /^([A-D])\.$/;
const OPTION_LETTERS = 'ABCD';
const COLUMN_TOLERANCE = 3;

interface Draft {
  number: number;
  sourcePage: number;
  promptParts: string[];
  optionParts: string[][];
  rawLines: string[];
}

function afterMarker(line: Line, marker: string): string {
  return line.text.slice(marker.length).trim();
}

function finish(draft: Draft, issues: ReportIssue[]): RawQuestion {
  const options = draft.optionParts.map((parts) => joinWrapped(parts));
  if (options.length !== OPTION_LETTERS.length) {
    issues.push({
      severity: 'error',
      question: draft.number,
      message: `Question ${draft.number} has ${options.length} options; expected ${OPTION_LETTERS.length}.`,
    });
  }
  return {
    number: draft.number,
    prompt: joinWrapped(draft.promptParts),
    options,
    sourcePage: draft.sourcePage,
    rawText: draft.rawLines.join('\n'),
  };
}

export function parseQuestions(lines: Line[]): { questions: RawQuestion[]; issues: ReportIssue[] } {
  const questions: RawQuestion[] = [];
  const issues: ReportIssue[] = [];
  let draft: Draft | null = null;
  let lastNumber = 0;
  let lastMarkerX = 0;

  for (const line of lines) {
    const first = line.items[0]?.str ?? '';

    const q = QUESTION_MARKER.exec(first);
    if (q) {
      const n = Number(q[1]);
      const sequential = n === lastNumber + 1;
      const gap =
        n > lastNumber + 1 && lastNumber > 0 && Math.abs(line.x - lastMarkerX) <= COLUMN_TOLERANCE;
      if (sequential || gap) {
        if (gap) {
          issues.push({
            severity: 'warning',
            question: n,
            message: `Question numbering jumps from ${lastNumber} to ${n}.`,
          });
        }
        if (draft) questions.push(finish(draft, issues));
        draft = {
          number: n,
          sourcePage: line.page,
          promptParts: [afterMarker(line, first)],
          optionParts: [],
          rawLines: [line.text],
        };
        lastNumber = n;
        lastMarkerX = line.x;
        continue;
      }
    }

    if (!draft) continue;
    draft.rawLines.push(line.text);

    const o = OPTION_MARKER.exec(first);
    if (o && o[1] === OPTION_LETTERS[draft.optionParts.length]) {
      draft.optionParts.push([afterMarker(line, first)]);
      continue;
    }

    const current = draft.optionParts[draft.optionParts.length - 1];
    (current ?? draft.promptParts).push(line.text);
  }

  if (draft) questions.push(finish(draft, issues));
  return { questions, issues };
}
