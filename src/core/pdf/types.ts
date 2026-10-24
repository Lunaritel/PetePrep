export interface TextItem {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  str: string;
}

export interface PageItems {
  page: number;
  width: number;
  height: number;
  items: TextItem[];
}

export interface Line {
  page: number;
  y: number;
  x: number;
  text: string;
  items: TextItem[];
}

export interface ParsedQuestion {
  number: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  sourcePage: number;
  rawText: string;
  parseConfidence: number;
  hasLetterRefs: boolean;
}

export type Severity = 'error' | 'warning';

export interface ReportIssue {
  severity: Severity;
  question?: number;
  message: string;
}

export interface ParseReport {
  ok: boolean;
  pageCount: number;
  questionCount: number;
  keyCount: number;
  issues: ReportIssue[];
}

export interface ParsedExam {
  title: string;
  testCode?: string;
  questions: ParsedQuestion[];
  report: ParseReport;
}
