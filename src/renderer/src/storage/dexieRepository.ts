import Dexie, { type Table } from 'dexie';
import { BANK_EXAM_ID, DuplicateExamError } from './contract';
import type {
  AnswerRow,
  BackupFile,
  ExamRow,
  NewAnswer,
  NewExam,
  NewQuestion,
  NewSession,
  QuestionRow,
  Repository,
  SessionRow,
} from './contract';
import { parseBackup, serialiseBackup } from './backupFormat';

class DecaDatabase extends Dexie {
  exams!: Table<ExamRow, string>;
  questions!: Table<QuestionRow, string>;
  sessions!: Table<SessionRow, string>;
  answers!: Table<AnswerRow, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      exams: 'id, &fileHash',
      questions: 'id, examId',
      sessions: 'id, examId',
      answers: 'id, sessionId, examId, questionId, answeredAt',
    });
  }
}

let counter = 0;

/**
 * Ids sort in creation order (padded timestamp + padded counter), so rows that share the same
 * millisecond timestamp still replay in the order they were written.
 */
function newId(prefix: string): string {
  const time = Date.now().toString(36).padStart(9, '0');
  const seq = (counter++ % 1_679_616).toString(36).padStart(4, '0');
  const salt = Math.floor(Math.random() * 1_679_616).toString(36).padStart(4, '0');
  return `${prefix}_${time}${seq}${salt}`;
}

function byAnsweredAt(a: AnswerRow, b: AnswerRow): number {
  return a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id);
}

/** Dexie/IndexedDB Repository. `name` lets tests use an isolated database per case. */
export function createDexieRepository(name = 'deca-mastery'): Repository {
  const db = new DecaDatabase(name);

  return {
    async listExams() {
      const rows = await db.exams.toArray();
      return rows.sort((a, b) => b.importedAt.localeCompare(a.importedAt) || b.id.localeCompare(a.id));
    },
    getExam: (id) => db.exams.get(id),
    findExamByHash: (fileHash) => db.exams.where('fileHash').equals(fileHash).first(),

    async saveExam(exam: NewExam, rows: NewQuestion[]) {
      return db.transaction('rw', db.exams, db.questions, async () => {
        const existing = await db.exams.where('fileHash').equals(exam.fileHash).first();
        if (existing) throw new DuplicateExamError(existing);
        const id = newId('exam');
        const row: ExamRow = {
          ...exam,
          id,
          importedAt: new Date().toISOString(),
          questionCount: rows.filter((q) => !q.excluded).length,
        };
        await db.exams.add(row);
        await db.questions.bulkAdd(rows.map((q) => ({ ...q, id: `${id}:${q.number}`, examId: id })));
        return row;
      });
    },

    async deleteExam(id) {
      await db.transaction('rw', db.exams, db.questions, db.sessions, db.answers, async () => {
        await db.answers.where('examId').equals(id).delete();
        await db.sessions.where('examId').equals(id).delete();
        await db.questions.where('examId').equals(id).delete();
        await db.exams.delete(id);
      });
    },

    async clearAll() {
      await db.transaction('rw', db.exams, db.questions, db.sessions, db.answers, async () => {
        await Promise.all([db.answers.clear(), db.sessions.clear(), db.questions.clear(), db.exams.clear()]);
      });
    },

    async resetProgress(examId) {
      await db.transaction('rw', db.sessions, db.answers, async () => {
        await db.answers.where('examId').equals(examId).delete();
        await db.sessions.where('examId').equals(examId).delete();
      });
    },

    async getQuestions(examId) {
      const rows = await db.questions.where('examId').equals(examId).toArray();
      return rows.sort((a, b) => a.number - b.number);
    },

    async createSession(session: NewSession) {
      return db.transaction('rw', db.exams, db.sessions, async () => {
        if (session.examId !== BANK_EXAM_ID && !(await db.exams.get(session.examId))) {
          throw new Error(`Exam ${session.examId} not found.`);
        }
        const row: SessionRow = { ...session, id: newId('sess'), startedAt: new Date().toISOString() };
        await db.sessions.add(row);
        return row;
      });
    },
    getSession: (id) => db.sessions.get(id),
    async listSessions(examId) {
      const rows = await db.sessions.where('examId').equals(examId).toArray();
      return rows.sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
    },
    async completeSession(id) {
      return db.transaction('rw', db.sessions, async () => {
        const session = await db.sessions.get(id);
        if (!session) throw new Error(`Session ${id} not found.`);
        const updated: SessionRow = { ...session, completedAt: new Date().toISOString() };
        await db.sessions.put(updated);
        return updated;
      });
    },
    async deleteSession(id) {
      await db.transaction('rw', db.sessions, db.answers, async () => {
        await db.answers.where('sessionId').equals(id).delete();
        await db.sessions.delete(id);
      });
    },

    async recordAnswer(answer: NewAnswer) {
      const row: AnswerRow = { ...answer, id: newId('ans'), answeredAt: answer.answeredAt ?? new Date().toISOString() };
      await db.answers.add(row);
      return row;
    },
    async listAnswers(examId) {
      return (await db.answers.where('examId').equals(examId).toArray()).sort(byAnsweredAt);
    },
    async listSessionAnswers(sessionId) {
      return (await db.answers.where('sessionId').equals(sessionId).toArray()).sort(byAnsweredAt);
    },

    async exportAll(): Promise<BackupFile> {
      const [exams, questions, sessions, answers] = await db.transaction('r', db.exams, db.questions, db.sessions, db.answers, () =>
        Promise.all([db.exams.toArray(), db.questions.toArray(), db.sessions.toArray(), db.answers.toArray()]),
      );
      return serialiseBackup({ exams, questions, sessions, answers });
    },

    async importAll(backup: unknown) {
      // Validate fully first: a bad file must not touch existing data.
      const parsed = await parseBackup(backup);
      await db.transaction('rw', db.exams, db.questions, db.sessions, db.answers, async () => {
        await Promise.all([db.exams.clear(), db.questions.clear(), db.sessions.clear(), db.answers.clear()]);
        await db.exams.bulkAdd(parsed.exams);
        await db.questions.bulkAdd(parsed.questions);
        await db.sessions.bulkAdd(parsed.sessions);
        await db.answers.bulkAdd(parsed.answers);
      });
    },
  };
}
