import { BackupFormatError } from './contract';
import type { AnswerRow, BackupFile, BackupQuestion, ExamRow, QuestionRow, SessionRow } from './contract';

export interface DatabaseSnapshot {
  exams: ExamRow[];
  questions: QuestionRow[];
  sessions: SessionRow[];
  answers: AnswerRow[];
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export async function serialiseBackup(db: DatabaseSnapshot): Promise<BackupFile> {
  const questions: BackupQuestion[] = [];
  for (const { snapshot, ...rest } of db.questions) {
    questions.push(
      snapshot
        ? { ...rest, options: [...rest.options], snapshotPngBase64: bytesToBase64(await blobBytes(snapshot)) }
        : { ...rest, options: [...rest.options] },
    );
  }
  return {
    format: 'deca-mastery-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    // Copies, so a backup is a snapshot and never aliases a repository's live rows.
    exams: db.exams.map((e) => ({ ...e })),
    questions,
    sessions: db.sessions.map((s) => ({ ...s, questionIds: [...s.questionIds] })),
    answers: db.answers.map((a) => ({ ...a })),
  };
}

function fail(message: string): never {
  throw new BackupFormatError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(row: Record<string, unknown>, key: string, where: string): string {
  const value = row[key];
  if (typeof value !== 'string') fail(`${where}: "${key}" must be text.`);
  return value;
}

function num(row: Record<string, unknown>, key: string, where: string): number {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${where}: "${key}" must be a number.`);
  return value;
}

function bool(row: Record<string, unknown>, key: string, where: string): boolean {
  const value = row[key];
  if (typeof value !== 'boolean') fail(`${where}: "${key}" must be true or false.`);
  return value;
}

function list(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) fail(`Backup is missing the "${name}" list.`);
  return value;
}

/**
 * Validates an untrusted backup and returns database rows. Throws BackupFormatError with a
 * plain-language reason on any problem, so a bad file can never half-restore.
 */
export async function parseBackup(input: unknown): Promise<DatabaseSnapshot> {
  if (!isRecord(input)) fail('This file is not a DECA Mastery backup.');
  if (input.format !== 'deca-mastery-backup') fail('This file is not a DECA Mastery backup.');
  if (input.version !== 1) fail(`Unsupported backup version ${String(input.version)}.`);

  const exams: ExamRow[] = list(input.exams, 'exams').map((raw, i) => {
    const where = `Exam ${i + 1}`;
    if (!isRecord(raw)) fail(`${where} is malformed.`);
    return {
      id: str(raw, 'id', where),
      title: str(raw, 'title', where),
      testCode: typeof raw.testCode === 'string' ? raw.testCode : undefined,
      fileHash: str(raw, 'fileHash', where),
      fileName: str(raw, 'fileName', where),
      importedAt: str(raw, 'importedAt', where),
      questionCount: num(raw, 'questionCount', where),
    };
  });
  const examIds = new Set(exams.map((e) => e.id));
  if (examIds.size !== exams.length) fail('Backup contains the same exam twice.');
  if (new Set(exams.map((e) => e.fileHash)).size !== exams.length) fail('Backup contains two exams from the same PDF.');

  const questions: QuestionRow[] = list(input.questions, 'questions').map((raw, i) => {
    const where = `Question ${i + 1}`;
    if (!isRecord(raw)) fail(`${where} is malformed.`);
    const examId = str(raw, 'examId', where);
    if (!examIds.has(examId)) fail(`${where} belongs to an exam that is not in the backup.`);
    const options = raw.options;
    if (!Array.isArray(options) || options.length !== 4 || options.some((o) => typeof o !== 'string')) {
      fail(`${where} must have exactly four text options.`);
    }
    const correctIndex = num(raw, 'correctIndex', where);
    if (![0, 1, 2, 3].includes(correctIndex)) fail(`${where} has an answer outside A-D.`);
    const row: QuestionRow = {
      id: str(raw, 'id', where),
      examId,
      number: num(raw, 'number', where),
      prompt: str(raw, 'prompt', where),
      options: options as QuestionRow['options'],
      correctIndex: correctIndex as QuestionRow['correctIndex'],
      explanation: str(raw, 'explanation', where),
      sourcePage: num(raw, 'sourcePage', where),
      parseConfidence: num(raw, 'parseConfidence', where),
      rawText: str(raw, 'rawText', where),
      hasLetterRefs: bool(raw, 'hasLetterRefs', where),
      excluded: bool(raw, 'excluded', where),
    };
    if (typeof raw.snapshotPngBase64 === 'string') {
      let bytes: Uint8Array;
      try {
        bytes = base64ToBytes(raw.snapshotPngBase64);
      } catch {
        fail(`${where} has a damaged picture.`);
      }
      row.snapshot = new Blob([bytes as BlobPart], { type: 'image/png' });
    }
    return row;
  });
  const questionIds = new Set(questions.map((q) => q.id));
  if (questionIds.size !== questions.length) fail('Backup contains the same question twice.');

  const sessions: SessionRow[] = list(input.sessions, 'sessions').map((raw, i) => {
    const where = `Session ${i + 1}`;
    if (!isRecord(raw)) fail(`${where} is malformed.`);
    const examId = str(raw, 'examId', where);
    if (!examIds.has(examId)) fail(`${where} belongs to an exam that is not in the backup.`);
    const kind = str(raw, 'kind', where);
    if (kind !== 'practice' && kind !== 'master') fail(`${where} has an unknown kind.`);
    const ids = raw.questionIds;
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) fail(`${where} has a bad question list.`);
    return {
      id: str(raw, 'id', where),
      examId,
      kind,
      questionIds: ids as string[],
      startedAt: str(raw, 'startedAt', where),
      completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : undefined,
    };
  });
  const sessionIds = new Set(sessions.map((s) => s.id));
  if (sessionIds.size !== sessions.length) fail('Backup contains the same session twice.');
  for (const session of sessions) {
    if (session.questionIds.some((id) => !questionIds.has(id))) {
      fail('A session refers to a question that is not in the backup.');
    }
  }

  const answers: AnswerRow[] = list(input.answers, 'answers').map((raw, i) => {
    const where = `Answer ${i + 1}`;
    if (!isRecord(raw)) fail(`${where} is malformed.`);
    const sessionId = str(raw, 'sessionId', where);
    const questionId = str(raw, 'questionId', where);
    if (!sessionIds.has(sessionId)) fail(`${where} belongs to a session that is not in the backup.`);
    if (!examIds.has(str(raw, 'examId', where))) fail(`${where} belongs to an exam that is not in the backup.`);
    if (!questionIds.has(questionId)) fail(`${where} belongs to a question that is not in the backup.`);
    const chosen = raw.chosenIndex;
    if (chosen !== null && (typeof chosen !== 'number' || ![0, 1, 2, 3].includes(chosen))) {
      fail(`${where} has a choice outside A-D.`);
    }
    return {
      id: str(raw, 'id', where),
      sessionId,
      examId: str(raw, 'examId', where),
      questionId,
      chosenIndex: chosen as number | null,
      correct: bool(raw, 'correct', where),
      answeredAt: str(raw, 'answeredAt', where),
      durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : undefined,
    };
  });

  if (new Set(answers.map((a) => a.id)).size !== answers.length) fail('Backup contains the same answer twice.');

  return { exams, questions, sessions, answers };
}
