import { describe, expect, it } from 'vitest';
import type { AnswerRecord, Attempt, Exam, Question } from './domain';
import {
  buildMasterExam,
  createMasteryState,
  getProgress,
  getStatus,
  getUnmasteredQuestions,
  gradeAnswer,
  isCorrect,
  isMasteryComplete,
  recordAttempt,
} from './mastery';
import { sampleExam } from './testing/sampleExam';

const AT = '2026-01-01T00:00:00.000Z';
const DONE = '2026-01-01T00:05:00.000Z';

function makeAttempt(
  exam: Exam,
  kind: Attempt['kind'],
  selections: Record<string, string | null>,
  id = 'attempt-1',
): Attempt {
  const answers: AnswerRecord[] = Object.entries(selections).map(
    ([questionId, selectedChoiceId]) => {
      const question = exam.questions.find((item) => item.id === questionId);
      if (!question) throw new Error(`Unknown question: ${questionId}`);
      return gradeAnswer(question, selectedChoiceId, AT);
    },
  );
  return { id, examId: exam.id, kind, answers, startedAt: AT, completedAt: DONE };
}

function answerAllCorrectly(exam: Exam, except: string[] = []): Record<string, string | null> {
  const selections: Record<string, string | null> = {};
  for (const question of exam.questions) {
    selections[question.id] = except.includes(question.id)
      ? 'not-a-choice'
      : (question.correctChoiceId ?? null);
  }
  return selections;
}

function answerCorrectly(exam: Exam, questionId: string): Record<string, string | null> {
  const question = exam.questions.find((item) => item.id === questionId);
  if (!question) throw new Error(`Unknown question: ${questionId}`);
  return { [questionId]: question.correctChoiceId ?? null };
}

describe('createMasteryState', () => {
  it('starts with no statuses and no attempts', () => {
    expect(createMasteryState('exam-1')).toEqual({
      examId: 'exam-1',
      status: {},
      attempts: [],
    });
  });
});

describe('isCorrect', () => {
  const question = sampleExam.questions[0];

  it('returns false when nothing is selected', () => {
    expect(isCorrect(question, null)).toBe(false);
  });

  it('returns false for a wrong selection', () => {
    const wrong = question.choices.find((choice) => choice.id !== question.correctChoiceId);
    expect(wrong).toBeDefined();
    expect(isCorrect(question, wrong!.id)).toBe(false);
  });

  it('returns true for the correct selection', () => {
    expect(isCorrect(question, question.correctChoiceId!)).toBe(true);
  });

  it('returns false when the question has no answer key', () => {
    const noKey: Question = { ...question, correctChoiceId: undefined };
    expect(isCorrect(noKey, question.correctChoiceId!)).toBe(false);
  });
});

describe('gradeAnswer', () => {
  it('builds a graded answer record', () => {
    const question = sampleExam.questions[0];
    expect(gradeAnswer(question, question.correctChoiceId!, AT)).toEqual({
      questionId: question.id,
      selectedChoiceId: question.correctChoiceId,
      correct: true,
      answeredAt: AT,
    });
  });
});

describe('recordAttempt', () => {
  const [first, second] = sampleExam.questions;

  it('keeps a single correct answer in learning rather than mastering it', () => {
    const state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id)),
    );

    expect(getStatus(state, first.id)).toBe('learning');
  });

  it('masters a question after two consecutive correct answers', () => {
    let state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id)),
    );
    expect(getStatus(state, first.id)).toBe('learning');

    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id), 'attempt-2'),
    );
    expect(getStatus(state, first.id)).toBe('mastered');
  });

  it('masters a question across an initial attempt and a master attempt', () => {
    let state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id)),
    );

    const masterExam = buildMasterExam(state, sampleExam);
    expect(masterExam).not.toBeNull();
    expect(masterExam!.questions.map((question) => question.id)).toContain(first.id);

    state = recordAttempt(
      state,
      masterExam!,
      makeAttempt(masterExam!, 'master', answerCorrectly(masterExam!, first.id), 'attempt-2'),
    );
    expect(getStatus(state, first.id)).toBe('mastered');
  });

  it('resets the streak when a correct answer is followed by a wrong one', () => {
    let state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id)),
    );
    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', { [first.id]: 'not-a-choice' }, 'attempt-2'),
    );
    expect(getStatus(state, first.id)).toBe('learning');

    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id), 'attempt-3'),
    );
    expect(getStatus(state, first.id)).toBe('learning');

    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id), 'attempt-4'),
    );
    expect(getStatus(state, first.id)).toBe('mastered');
  });

  it('demotes a mastered question when it is answered wrong', () => {
    let state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id)),
    );
    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id), 'attempt-2'),
    );
    expect(getStatus(state, first.id)).toBe('mastered');

    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', { [first.id]: 'not-a-choice' }, 'attempt-3'),
    );
    expect(getStatus(state, first.id)).toBe('learning');
  });

  it('keeps a wrong answer in learning', () => {
    const state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', { [second.id]: 'not-a-choice' }),
    );

    expect(getStatus(state, second.id)).toBe('learning');
  });

  it('leaves unanswered questions unseen instead of penalising them', () => {
    const state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id)),
    );

    expect(getStatus(state, first.id)).toBe('learning');
    expect(getStatus(state, second.id)).toBe('unseen');
  });

  it('does not let one question affect the streak of another', () => {
    let state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam)),
    );
    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam, [second.id]), 'attempt-2'),
    );

    expect(getStatus(state, first.id)).toBe('mastered');
    expect(getStatus(state, second.id)).toBe('learning');
  });

  it('ignores answers for questions outside the exam', () => {
    const state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      {
        ...makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, first.id)),
        answers: [
          {
            questionId: 'not-in-this-exam',
            selectedChoiceId: 'a',
            correct: true,
            answeredAt: AT,
          },
        ],
      },
    );

    expect(state.status['not-in-this-exam']).toBeUndefined();
    expect(getStatus(state, first.id)).toBe('unseen');
  });

  it('appends attempts and leaves the input state untouched', () => {
    const state = createMasteryState(sampleExam.id);
    const next = recordAttempt(state, sampleExam, makeAttempt(sampleExam, 'initial', {}));

    expect(state.attempts).toHaveLength(0);
    expect(state.status).toEqual({});
    expect(next.attempts).toHaveLength(1);
    expect(next).not.toBe(state);
  });
});

describe('getUnmasteredQuestions', () => {
  it('returns learning and unseen questions in exam order', () => {
    const [first, second, third, fourth, fifth] = sampleExam.questions;
    const mastered = answerCorrectly(sampleExam, fifth.id);
    const state = recordAttempt(
      recordAttempt(
        createMasteryState(sampleExam.id),
        sampleExam,
        makeAttempt(sampleExam, 'initial', mastered),
      ),
      sampleExam,
      makeAttempt(sampleExam, 'initial', mastered, 'attempt-2'),
    );

    expect(getUnmasteredQuestions(state, sampleExam).map((question) => question.id)).toEqual([
      first.id,
      second.id,
      third.id,
      fourth.id,
    ]);
  });

  it('excludes mastered questions', () => {
    const question = sampleExam.questions[0];
    let state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, question.id)),
    );
    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerCorrectly(sampleExam, question.id), 'attempt-2'),
    );

    expect(getUnmasteredQuestions(state, sampleExam).map((item) => item.id)).not.toContain(
      question.id,
    );
  });
});

describe('buildMasterExam', () => {
  it('builds an exam from the unmastered questions with a unique id', () => {
    const missed = sampleExam.questions[2];
    const state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam, [missed.id])),
    );

    const masterExam = buildMasterExam(state, sampleExam);
    expect(masterExam).not.toBeNull();
    expect(masterExam!.id).toBe(`${sampleExam.id}-master-1`);
    expect(masterExam!.title).toContain('Master Exam');
    expect(masterExam!.questions.map((question) => question.id)).toContain(missed.id);
  });

  it('returns null when nothing is left unmastered', () => {
    let state = createMasteryState(sampleExam.id);
    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam)),
    );
    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam), 'attempt-2'),
    );

    expect(buildMasterExam(state, sampleExam)).toBeNull();
  });
});

describe('getProgress', () => {
  it('reports every question unseen before any attempt', () => {
    expect(getProgress(createMasteryState(sampleExam.id), sampleExam)).toEqual({
      total: sampleExam.questions.length,
      mastered: 0,
      learning: 0,
      unseen: sampleExam.questions.length,
      percentMastered: 0,
    });
  });

  it('counts mastered, learning, and unseen questions and rounds the percentage', () => {
    let state = recordAttempt(
      createMasteryState(sampleExam.id),
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam, [
        sampleExam.questions[3].id,
        sampleExam.questions[4].id,
      ])),
    );
    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam, [
        sampleExam.questions[3].id,
        sampleExam.questions[4].id,
      ]), 'attempt-2'),
    );

    expect(getProgress(state, sampleExam)).toEqual({
      total: sampleExam.questions.length,
      mastered: 3,
      learning: 2,
      unseen: 0,
      percentMastered: 60,
    });
  });

  it('reports zero percent for an empty exam', () => {
    const empty: Exam = { id: 'empty', title: 'Empty', questions: [] };
    expect(getProgress(createMasteryState('empty'), empty)).toEqual({
      total: 0,
      mastered: 0,
      learning: 0,
      unseen: 0,
      percentMastered: 0,
    });
  });
});

describe('isMasteryComplete', () => {
  it('is false for an empty exam', () => {
    const empty: Exam = { id: 'empty', title: 'Empty', questions: [] };
    expect(isMasteryComplete(createMasteryState('empty'), empty)).toBe(false);
  });

  it('is only true once every question is answered correctly twice in a row', () => {
    let state = createMasteryState(sampleExam.id);
    expect(isMasteryComplete(state, sampleExam)).toBe(false);

    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam)),
    );
    expect(isMasteryComplete(state, sampleExam)).toBe(false);

    state = recordAttempt(
      state,
      sampleExam,
      makeAttempt(sampleExam, 'initial', answerAllCorrectly(sampleExam), 'attempt-2'),
    );
    expect(isMasteryComplete(state, sampleExam)).toBe(true);
  });
});
