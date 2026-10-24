import { joinWrapped } from './layout';
import type { Line, ReportIssue } from './types';

export interface KeyEntry {
  number: number;
  letter: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  rawText: string;
  page: number;
}

const MARKER = /^(\d{1,3})\.$/;
const LETTER = /^[A-D]$/;

interface Open {
  number: number;
  letter: KeyEntry['letter'] | null;
  parts: string[];
  raw: string[];
  page: number;
  inSource: boolean;
}

export function parseAnswerKey(lines: Line[]): { entries: KeyEntry[]; issues: ReportIssue[] } {
  const entries: KeyEntry[] = [];
  const issues: ReportIssue[] = [];
  let current: Open | null = null;
  let last = 0;

  const close = (): void => {
    if (!current) return;
    if (!current.letter) {
      issues.push({
        severity: 'error',
        question: current.number,
        message: `Answer key entry ${current.number} has no answer letter.`,
      });
    } else {
      const explanation = joinWrapped(current.parts);
      if (!explanation) {
        issues.push({
          severity: 'warning',
          question: current.number,
          message: `Answer key entry ${current.number} has no explanation.`,
        });
      }
      entries.push({
        number: current.number,
        letter: current.letter,
        explanation,
        rawText: current.raw.join('\n'),
        page: current.page,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const marker = MARKER.exec(line.items[0]?.str ?? '');
    if (marker && Number(marker[1]) === last + 1) {
      close();
      last = Number(marker[1]);
      const rest = line.items.slice(1);
      const letterIndex = rest.findIndex((item) => LETTER.test(item.str));
      const trailing = letterIndex === -1 ? [] : rest.slice(letterIndex + 1).map((item) => item.str);
      current = {
        number: last,
        letter: letterIndex === -1 ? null : (rest[letterIndex].str as KeyEntry['letter']),
        parts: [],
        raw: [line.text],
        page: line.page,
        inSource: false,
      };
      if (trailing.length > 0) current.parts.push(trailing.join(' '));
      continue;
    }
    if (!current) continue;
    current.raw.push(line.text);
    if (current.inSource) continue;
    if (line.text.startsWith('SOURCE:')) current.inSource = true;
    else current.parts.push(line.text);
  }
  close();
  return { entries, issues };
}
