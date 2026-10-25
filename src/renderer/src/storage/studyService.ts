import { computeStatus, getProgress, isMasteryComplete } from '../../../core/mastery';
import type { Attempt, Exam, MasteryState, MasteryStatus, Progress, Question } from '../../../core/domain';
import type { AnswerRow, ExamRow, QuestionRow, Repository, SessionKind, SessionRow } from './contract';
import { deriveReview, isInMistakeBank, type ReviewInfo } from './mistakeBank';

export const LETTERS = ['A', 'B', 'C', 'D'] as const;

export interface Study {
  exam: ExamRow;
  /** Non-excluded questions in printed order. */
  questions: QuestionRow[];
  answers: AnswerRow[];
  core: Exam;
  state: MasteryState;
  progress: Progress;
  complete: boolean;
  /** Mistake-bank bookkeeping per question id (see mistakeBank.ts). */
  review: Map<string, ReviewInfo>;
}

export function toCoreExam(exam: ExamRow, rows: QuestionRow[]): Exam {
  const questions: Question[] = rows
    .filter((q) => !q.excluded)
    .map((q) => ({
      id: q.id,
      number: q.number,
      prompt: q.prompt,
      choices: q.options.map((text, i) => ({ id: LETTERS[i], label: LETTERS[i], text })),
      correctChoiceId: LETTERS[q.correctIndex],
      explanation: q.explanation,
    }));
  return { id: exam.id, title: exam.title, sourceFile: exam.fileName, questions };
}

/**
 * Mastery is derived by replaying every answer for the exam in time order. Skips (null choice) are
 * ignored: an unanswered question stays as it was and is never penalised.
 */
export function deriveState(exam: Exam, answers: AnswerRow[]): MasteryState {
  const known = new Set(exam.questions.map((q) => q.id));
  const ordered = [...answers].filter((a) => known.has(a.questionId) && a.chosenIndex !== null).sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
  const attempt: Attempt = {
    id: 'replay',
    examId: exam.id,
    kind: 'initial',
    startedAt: ordered[0]?.answeredAt ?? new Date(0).toISOString(),
    answers: ordered.map((a) => ({
      questionId: a.questionId,
      selectedChoiceId: a.chosenIndex === null ? null : LETTERS[a.chosenIndex],
      correct: a.correct,
      answeredAt: a.answeredAt,
    })),
  };
  return { examId: exam.id, status: computeStatus([attempt]), attempts: [attempt] };
}

export async function loadStudy(repo: Repository, examId: string): Promise<Study> {
  const exam = await repo.getExam(examId);
  if (!exam) throw new Error('That exam no longer exists.');
  const all = await repo.getQuestions(examId);
  const questions = all.filter((q) => !q.excluded);
  const answers = await repo.listAnswers(examId);
  const core = toCoreExam(exam, questions);
  const state = deriveState(core, answers);
  return { exam, questions, answers, core, state, progress: getProgress(state, core), complete: isMasteryComplete(state, core), review: deriveReview(answers) };
}

export function statusOf(study: Study, questionId: string): MasteryStatus {
  return study.state.status[questionId] ?? 'unseen';
}

export type Rng = () => number;

/** Fisher-Yates; pass a seeded Rng in tests. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface PoolOptions {
  /** 0-100: extra already-mastered questions to mix in, as a percentage of the unmastered count. Default 0. */
  mixMasteredPercent?: number;
  rng?: Rng;
}

/** Master-exam pool: every question not yet mastered (learning + unseen), shuffled, plus an optional review mix. */
export function buildMasterPool(study: Study, options: PoolOptions = {}): QuestionRow[] {
  const rng = options.rng ?? Math.random;
  const pending = study.questions.filter((q) => statusOf(study, q.id) !== 'mastered');
  const mastered = study.questions.filter((q) => statusOf(study, q.id) === 'mastered');
  const percent = Math.min(100, Math.max(0, options.mixMasteredPercent ?? 0));
  const extra = pending.length === 0 ? 0 : Math.min(mastered.length, Math.round((pending.length * percent) / 100));
  return shuffle([...pending, ...shuffle(mastered, rng).slice(0, extra)], rng);
}

export async function startSession(
  repo: Repository,
  examId: string,
  kind: SessionKind,
  questions: QuestionRow[],
): Promise<SessionRow> {
  if (questions.length === 0) throw new Error('There are no questions to study.');
  return repo.createSession({ examId, kind, questionIds: questions.map((q) => q.id) });
}

/** Grades against the stored key and records the answer. `chosenIndex` null records a skip. */
export async function answerQuestion(
  repo: Repository,
  session: SessionRow,
  question: QuestionRow,
  chosenIndex: number | null,
  durationMs?: number,
): Promise<AnswerRow> {
  if (chosenIndex !== null && (chosenIndex < 0 || chosenIndex > 3)) throw new Error('Choice must be A-D.');
  return repo.recordAnswer({
    sessionId: session.id,
    examId: question.examId,
    questionId: question.id,
    chosenIndex,
    correct: chosenIndex !== null && chosenIndex === question.correctIndex,
    durationMs,
  });
}

/** The next unanswered question of a session, or undefined when finished (used to resume). */
export function nextUnanswered(session: SessionRow, answers: AnswerRow[]): string | undefined {
  const done = new Set(answers.filter((a) => a.sessionId === session.id).map((a) => a.questionId));
  return session.questionIds.find((id) => !done.has(id));
}

/** This exam's questions that are currently in the mistake bank, in printed order. */
export function weakQuestions(study: Study): QuestionRow[] {
  return study.questions.filter((q) => isInMistakeBank(study.review.get(q.id)));
}
