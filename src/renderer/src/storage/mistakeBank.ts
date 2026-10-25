import type { AnswerRow, ExamRow, QuestionRow, Repository } from './contract';
import { shuffle, type Rng } from './studyService';

/**
 * The mistake bank, derived by replaying answers (never stored, like mastery).
 *
 * A question enters the bank when you miss it. It leaves after you answer it correctly twice, and the two
 * correct answers must come from two different rounds: a second correct answer inside the same round does not
 * count. A new miss puts it straight back in.
 */
export const CLEAR_AFTER_CORRECT_ROUNDS = 2;

export interface ReviewInfo {
  timesMissed: number;
  /** Correct answers since the last miss, counting at most one per round. */
  correctRounds: number;
}

/** Replays answers in time order. Skips (null choice) are ignored. */
export function deriveReview(answers: AnswerRow[]): Map<string, ReviewInfo> {
  const info = new Map<string, ReviewInfo>();
  const lastCorrectSession = new Map<string, string>();
  const ordered = [...answers]
    .filter((a) => a.chosenIndex !== null)
    .sort((a, b) => a.answeredAt.localeCompare(b.answeredAt) || a.id.localeCompare(b.id));

  for (const a of ordered) {
    const current = info.get(a.questionId) ?? { timesMissed: 0, correctRounds: 0 };
    if (a.correct) {
      if (lastCorrectSession.get(a.questionId) !== a.sessionId) current.correctRounds += 1;
      lastCorrectSession.set(a.questionId, a.sessionId);
    } else {
      current.timesMissed += 1;
      current.correctRounds = 0;
      lastCorrectSession.delete(a.questionId);
    }
    info.set(a.questionId, current);
  }
  return info;
}

export function isInMistakeBank(info: ReviewInfo | undefined): boolean {
  return !!info && info.timesMissed > 0 && info.correctRounds < CLEAR_AFTER_CORRECT_ROUNDS;
}

export interface BankEntry {
  question: QuestionRow;
  exam: ExamRow;
  timesMissed: number;
  /** 0 or 1: correct rounds so far towards leaving the bank. */
  correctRounds: number;
}

/** Every question, from every exam, that is currently in the mistake bank. */
export async function loadMistakeBank(repo: Repository): Promise<BankEntry[]> {
  const entries: BankEntry[] = [];
  for (const exam of await repo.listExams()) {
    const [questions, answers] = await Promise.all([repo.getQuestions(exam.id), repo.listAnswers(exam.id)]);
    const review = deriveReview(answers);
    for (const question of questions) {
      if (question.excluded) continue;
      const info = review.get(question.id);
      if (isInMistakeBank(info)) {
        entries.push({ question, exam, timesMissed: info!.timesMissed, correctRounds: info!.correctRounds });
      }
    }
  }
  return entries;
}

export function bankCountsByExam(entries: BankEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.exam.id, (counts.get(e.exam.id) ?? 0) + 1);
  return counts;
}

function wordingKey(q: QuestionRow): string {
  return q.prompt.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Two exams drawn from the same item bank can contain a question with identical wording. In a mixed drill those
 * should not appear back to back, so move the second one further down the list.
 */
export function separateRepeatedWording(questions: QuestionRow[]): QuestionRow[] {
  const out = [...questions];
  for (let i = 1; i < out.length; i += 1) {
    if (wordingKey(out[i]) !== wordingKey(out[i - 1])) continue;
    const j = out.findIndex((q, at) => at > i && wordingKey(q) !== wordingKey(out[i]) && wordingKey(q) !== wordingKey(out[i - 1]));
    if (j !== -1) [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Questions for one drill, shuffled, each question exactly once (a question never repeats within a round).
 * Pass an examId for the "weak points of one exam" drill; omit it for the mixed drill across all exams.
 */
export function buildMistakePool(entries: BankEntry[], options: { examId?: string; rng?: Rng } = {}): QuestionRow[] {
  const chosen = options.examId ? entries.filter((e) => e.exam.id === options.examId) : entries;
  return separateRepeatedWording(
    shuffle(
      chosen.map((e) => e.question),
      options.rng,
    ),
  );
}
