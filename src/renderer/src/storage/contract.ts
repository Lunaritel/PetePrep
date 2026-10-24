/**
 * Storage contract shared by every screen. Two implementations exist: an in-memory one
 * (tests, previews) and a Dexie/IndexedDB one (the app). Both must pass storage/repositoryContract.ts.
 *
 * Mastery is never stored: it is derived by replaying `answers` in answeredAt order (see studyService.ts).
 */

export interface ExamRow {
  id: string;
  title: string;
  testCode?: string;
  /** SHA-256 hex of the imported PDF; blocks importing the same file twice. */
  fileHash: string;
  fileName: string;
  importedAt: string;
  /** Count of non-excluded questions. */
  questionCount: number;
}

export interface QuestionRow {
  /** examId + ":" + number */
  id: string;
  examId: string;
  number: number;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanation: string;
  sourcePage: number;
  parseConfidence: number;
  rawText: string;
  hasLetterRefs: boolean;
  /** Questions the user removed in the review step. They are kept for re-parsing but never studied. */
  excluded: boolean;
  /** PNG screenshot of the question as printed, for questions with a picture or table. */
  snapshot?: Blob;
}

export type SessionKind = 'practice' | 'master';

export interface SessionRow {
  id: string;
  examId: string;
  kind: SessionKind;
  questionIds: string[];
  startedAt: string;
  completedAt?: string;
}

export interface AnswerRow {
  id: string;
  sessionId: string;
  examId: string;
  questionId: string;
  /** null when the question was skipped or timed out. */
  chosenIndex: number | null;
  correct: boolean;
  answeredAt: string;
  /** Milliseconds the question was on screen before answering. */
  durationMs?: number;
}

export type NewExam = Omit<ExamRow, 'id' | 'importedAt' | 'questionCount'>;
export type NewQuestion = Omit<QuestionRow, 'id' | 'examId'>;
export type NewSession = Omit<SessionRow, 'id' | 'startedAt' | 'completedAt'>;
export type NewAnswer = Omit<AnswerRow, 'id' | 'answeredAt'> & { answeredAt?: string };

export type BackupQuestion = Omit<QuestionRow, 'snapshot'> & { snapshotPngBase64?: string };

export interface BackupFile {
  format: 'deca-mastery-backup';
  version: 1;
  exportedAt: string;
  exams: ExamRow[];
  questions: BackupQuestion[];
  sessions: SessionRow[];
  answers: AnswerRow[];
}

export interface Repository {
  listExams(): Promise<ExamRow[]>;
  getExam(id: string): Promise<ExamRow | undefined>;
  findExamByHash(fileHash: string): Promise<ExamRow | undefined>;
  /** Saves an exam and its questions atomically. Rejects with DuplicateExamError if the hash exists. */
  saveExam(exam: NewExam, questions: NewQuestion[]): Promise<ExamRow>;
  deleteExam(id: string): Promise<void>;
  /** Deletes all sessions and answers for the exam; the exam and questions stay. */
  resetProgress(examId: string): Promise<void>;

  getQuestions(examId: string): Promise<QuestionRow[]>;

  createSession(session: NewSession): Promise<SessionRow>;
  getSession(id: string): Promise<SessionRow | undefined>;
  listSessions(examId: string): Promise<SessionRow[]>;
  completeSession(id: string): Promise<SessionRow>;
  deleteSession(id: string): Promise<void>;

  recordAnswer(answer: NewAnswer): Promise<AnswerRow>;
  /** All answers for an exam, ordered by answeredAt ascending. */
  listAnswers(examId: string): Promise<AnswerRow[]>;
  listSessionAnswers(sessionId: string): Promise<AnswerRow[]>;

  exportAll(): Promise<BackupFile>;
  /** Replaces the entire database with the backup contents (validated first). */
  importAll(backup: unknown): Promise<void>;
}

export class DuplicateExamError extends Error {
  constructor(public readonly existing: ExamRow) {
    super(`"${existing.title}" has already been imported.`);
    this.name = 'DuplicateExamError';
  }
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}
