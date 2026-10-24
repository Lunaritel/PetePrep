export interface TextItem {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  str: string;
}

export type VisualKind = 'image' | 'graphic';

/** A picture or ruled/drawn region on a page, in PDF user space (origin bottom-left, y up). */
export interface VisualRegion {
  kind: VisualKind;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** A horizontal band of one page to crop for a question screenshot (PDF user space, y up; top > bottom). */
export interface SnapshotSegment {
  page: number;
  top: number;
  bottom: number;
}

export interface PageItems {
  page: number;
  width: number;
  height: number;
  items: TextItem[];
  visuals?: VisualRegion[];
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
  /** Present when the question contains a picture, table or drawing that text extraction cannot capture. */
  visual?: { kinds: VisualKind[]; segments: SnapshotSegment[] };
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
