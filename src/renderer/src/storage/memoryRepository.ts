import { DuplicateExamError } from './contract';
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

let counter = 0;
const newId = (prefix: string): string => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`;

/** In-memory Repository for tests and component previews. */
export function createMemoryRepository(): Repository {
  let exams: ExamRow[] = [];
  let questions: QuestionRow[] = [];
  let sessions: SessionRow[] = [];
  let answers: AnswerRow[] = [];

  return {
    async listExams() {
      return [...exams].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
    },
    async getExam(id) {
      return exams.find((e) => e.id === id);
    },
    async findExamByHash(fileHash) {
      return exams.find((e) => e.fileHash === fileHash);
    },
    async saveExam(exam: NewExam, rows: NewQuestion[]) {
      const existing = exams.find((e) => e.fileHash === exam.fileHash);
      if (existing) throw new DuplicateExamError(existing);
      const id = newId('exam');
      const row: ExamRow = {
        ...exam,
        id,
        importedAt: new Date().toISOString(),
        questionCount: rows.filter((q) => !q.excluded).length,
      };
      exams.push(row);
      questions.push(...rows.map((q) => ({ ...q, id: `${id}:${q.number}`, examId: id })));
      return row;
    },
    async deleteExam(id) {
      exams = exams.filter((e) => e.id !== id);
      questions = questions.filter((q) => q.examId !== id);
      sessions = sessions.filter((s) => s.examId !== id);
      answers = answers.filter((a) => a.examId !== id);
    },
    async clearAll() {
      exams = [];
      questions = [];
      sessions = [];
      answers = [];
    },
    async resetProgress(examId) {
      sessions = sessions.filter((s) => s.examId !== examId);
      answers = answers.filter((a) => a.examId !== examId);
    },
    async getQuestions(examId) {
      return questions.filter((q) => q.examId === examId).sort((a, b) => a.number - b.number);
    },
    async createSession(session: NewSession) {
      if (!exams.some((e) => e.id === session.examId)) throw new Error(`Exam ${session.examId} not found.`);
      const row: SessionRow = { ...session, id: newId('sess'), startedAt: new Date().toISOString() };
      sessions.push(row);
      return row;
    },
    async getSession(id) {
      return sessions.find((s) => s.id === id);
    },
    async listSessions(examId) {
      return sessions.filter((s) => s.examId === examId).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    },
    async completeSession(id) {
      const session = sessions.find((s) => s.id === id);
      if (!session) throw new Error(`Session ${id} not found.`);
      session.completedAt = new Date().toISOString();
      return session;
    },
    async deleteSession(id) {
      sessions = sessions.filter((s) => s.id !== id);
      answers = answers.filter((a) => a.sessionId !== id);
    },
    async recordAnswer(answer: NewAnswer) {
      const row: AnswerRow = { ...answer, id: newId('ans'), answeredAt: answer.answeredAt ?? new Date().toISOString() };
      answers.push(row);
      return row;
    },
    async listAnswers(examId) {
      return answers.filter((a) => a.examId === examId).sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
    },
    async listSessionAnswers(sessionId) {
      return answers.filter((a) => a.sessionId === sessionId).sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
    },
    async exportAll(): Promise<BackupFile> {
      return serialiseBackup({ exams, questions, sessions, answers });
    },
    async importAll(backup: unknown) {
      const parsed = await parseBackup(backup);
      exams = parsed.exams;
      questions = parsed.questions;
      sessions = parsed.sessions;
      answers = parsed.answers;
    },
  };
}
