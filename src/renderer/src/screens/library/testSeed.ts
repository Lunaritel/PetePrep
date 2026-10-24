import type { ExamRow, NewQuestion, Repository } from '../../storage/contract';

export function makeQuestion(number: number, correctIndex: 0 | 1 | 2 | 3 = 0): NewQuestion {
  return {
    number,
    prompt: `Stem for question ${number} that is long enough to be shown in a table`,
    options: ['alpha', 'beta', 'gamma', 'delta'],
    correctIndex,
    explanation: `Because ${number}`,
    sourcePage: 1,
    parseConfidence: 1,
    rawText: '',
    hasLetterRefs: false,
    excluded: false,
  };
}

let hashCounter = 0;

export async function seedExam(
  repo: Repository,
  options: { title?: string; testCode?: string; count?: number } = {},
): Promise<ExamRow> {
  hashCounter += 1;
  return repo.saveExam(
    {
      title: options.title ?? 'Hospitality Sample',
      testCode: options.testCode,
      fileHash: `hash-${hashCounter}`,
      fileName: `exam-${hashCounter}.pdf`,
    },
    Array.from({ length: options.count ?? 4 }, (_, i) => makeQuestion(i + 1)),
  );
}

/** Records an answer at an explicit time so histories are deterministic. */
export async function answer(
  repo: Repository,
  sessionId: string,
  examId: string,
  number: number,
  correct: boolean,
  at: string,
  durationMs?: number,
): Promise<void> {
  await repo.recordAnswer({
    sessionId,
    examId,
    questionId: `${examId}:${number}`,
    chosenIndex: correct ? 0 : 1,
    correct,
    answeredAt: at,
    durationMs,
  });
}
