import type {
  AnswerRecord,
  Attempt,
  Exam,
  MasteryState,
  MasteryStatus,
  Progress,
  Question,
} from './domain';

const MASTERY_STREAK = 2;

export function createMasteryState(examId: string): MasteryState {
  return { examId, status: {}, attempts: [] };
}

export function isCorrect(question: Question, selectedChoiceId: string | null): boolean {
  if (!question.correctChoiceId || selectedChoiceId === null) return false;
  return question.correctChoiceId === selectedChoiceId;
}

export function gradeAnswer(
  question: Question,
  selectedChoiceId: string | null,
  answeredAt: string = new Date().toISOString(),
): AnswerRecord {
  return {
    questionId: question.id,
    selectedChoiceId,
    correct: isCorrect(question, selectedChoiceId),
    answeredAt,
  };
}

export function computeStatus(attempts: Attempt[]): Record<string, MasteryStatus> {
  const streaks = new Map<string, number>();
  const status: Record<string, MasteryStatus> = {};

  for (const attempt of attempts) {
    for (const answer of attempt.answers) {
      if (answer.correct) {
        const streak = (streaks.get(answer.questionId) ?? 0) + 1;
        streaks.set(answer.questionId, streak);
        status[answer.questionId] = streak >= MASTERY_STREAK ? 'mastered' : 'learning';
      } else {
        streaks.set(answer.questionId, 0);
        status[answer.questionId] = 'learning';
      }
    }
  }

  return status;
}

export function recordAttempt(state: MasteryState, exam: Exam, attempt: Attempt): MasteryState {
  const known = new Set(exam.questions.map((question) => question.id));
  const answers = attempt.answers.filter((answer) => known.has(answer.questionId));
  const attempts = [...state.attempts, { ...attempt, answers }];

  return {
    examId: state.examId,
    status: computeStatus(attempts),
    attempts,
  };
}

export function getStatus(state: MasteryState, questionId: string): MasteryStatus {
  return state.status[questionId] ?? 'unseen';
}

export function getUnmasteredQuestions(state: MasteryState, exam: Exam): Question[] {
  return exam.questions.filter((question) => getStatus(state, question.id) !== 'mastered');
}

export function buildMasterExam(state: MasteryState, exam: Exam): Exam | null {
  const remaining = getUnmasteredQuestions(state, exam);
  if (remaining.length === 0) return null;

  const masterAttempts = state.attempts.filter((attempt) => attempt.kind === 'master').length;
  return {
    id: `${exam.id}-master-${masterAttempts + 1}`,
    title: `${exam.title} - Master Exam`,
    sourceFile: exam.sourceFile,
    questions: remaining,
  };
}

export function getProgress(state: MasteryState, exam: Exam): Progress {
  let mastered = 0;
  let learning = 0;
  let unseen = 0;

  for (const question of exam.questions) {
    const status = getStatus(state, question.id);
    if (status === 'mastered') mastered += 1;
    else if (status === 'learning') learning += 1;
    else unseen += 1;
  }

  const total = exam.questions.length;
  return {
    total,
    mastered,
    learning,
    unseen,
    percentMastered: total === 0 ? 0 : Math.round((mastered / total) * 100),
  };
}

export function isMasteryComplete(state: MasteryState, exam: Exam): boolean {
  return (
    exam.questions.length > 0 &&
    exam.questions.every((question) => getStatus(state, question.id) === 'mastered')
  );
}
