import { joinWrapped } from './layout';
import type { Line, ReportIssue, SnapshotSegment } from './types';

export interface RawQuestion {
  number: number;
  prompt: string;
  options: string[];
  sourcePage: number;
  rawText: string;
  /** Vertical extent of the question's own text on each page it touches (PDF y-up). */
  extents: SnapshotSegment[];
}

// A marker may be its own text item (DECA files) or merged with the text that follows it (other generators).
const QUESTION_MARKER = /^(\d{1,3})\.(?=\s|$)/;
const OPTION_MARKER = /^([A-D])\.(?=\s|$)/;
const OPTION_LETTERS = 'ABCD';
const COLUMN_TOLERANCE = 3;
const LINE_ASCENT = 9;
const LINE_DESCENT = 3;

interface Draft {
  number: number;
  sourcePage: number;
  promptParts: string[];
  optionParts: string[][];
  rawLines: string[];
  extents: Map<number, SnapshotSegment>;
}

function track(draft: Draft, line: Line): void {
  const top = line.y + LINE_ASCENT;
  const bottom = line.y - LINE_DESCENT;
  const seen = draft.extents.get(line.page);
  if (seen) {
    seen.top = Math.max(seen.top, top);
    seen.bottom = Math.min(seen.bottom, bottom);
  } else {
    draft.extents.set(line.page, { page: line.page, top, bottom });
  }
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
    extents: [...draft.extents.values()],
  };
}

export function parseQuestions(lines: Line[]): { questions: RawQuestion[]; issues: ReportIssue[] } {
  const questions: RawQuestion[] = [];
  const issues: ReportIssue[] = [];
  let draft: Draft | null = null;
  let lastNumber = 0;
  let lastMarkerX = 0;

  for (const line of lines) {
    const q = QUESTION_MARKER.exec(line.text);
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
          promptParts: [afterMarker(line, q[0])],
          optionParts: [],
          rawLines: [line.text],
          extents: new Map(),
        };
        track(draft, line);
        lastNumber = n;
        lastMarkerX = line.x;
        continue;
      }
    }

    if (!draft) continue;
    draft.rawLines.push(line.text);
    track(draft, line);

    const o = OPTION_MARKER.exec(line.text);
    if (o && o[1] === OPTION_LETTERS[draft.optionParts.length]) {
      draft.optionParts.push([afterMarker(line, o[0])]);
      continue;
    }

    const current = draft.optionParts[draft.optionParts.length - 1];
    (current ?? draft.promptParts).push(line.text);
  }

  if (draft) questions.push(finish(draft, issues));
  return { questions, issues };
}
