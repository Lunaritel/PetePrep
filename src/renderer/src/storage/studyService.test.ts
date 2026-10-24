import { describe, expect, it } from 'vitest';
import type { NewQuestion, Repository } from './contract';
import { createMemoryRepository } from './memoryRepository';
import { answerQuestion, buildMasterPool, loadStudy, nextUnanswered, startSession } from './studyService';

function question(number: number, correctIndex: 0 | 1 | 2 | 3 = 0): NewQuestion {
  return {
    number,
    prompt: `Question ${number}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex,
    explanation: `Because ${number}`,
    sourcePage: 1,
    parseConfidence: 1,
    rawText: '',
    hasLetterRefs: false,
    excluded: false,
  };
}

async function seed(repo: Repository, count = 4) {
  return repo.saveExam(
    { title: 'Sample', fileHash: 'h1', fileName: 's.pdf' },
    Array.from({ length: count }, (_, i) => question(i + 1)),
  );
}

describe('study service', () => {
  it('starts with everything unseen', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo);
    const study = await loadStudy(repo, exam.id);
    expect(study.progress).toMatchObject({ total: 4, unseen: 4, mastered: 0, percentMastered: 0 });
    expect(study.complete).toBe(false);
  });

  it('excluded questions never count', async () => {
    const repo = createMemoryRepository();
    const exam = await repo.saveExam({ title: 'x', fileHash: 'h2', fileName: 'x.pdf' }, [
      question(1),
      { ...question(2), excluded: true },
    ]);
    const study = await loadStudy(repo, exam.id);
    expect(study.questions.map((q) => q.number)).toEqual([1]);
    expect(exam.questionCount).toBe(1);
  });

  it('miss -> drill -> drill reaches 100% and stops offering rounds', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 3);
    let study = await loadStudy(repo, exam.id);

    // Round 1: miss question 2, get 1 and 3 right.
    let session = await startSession(repo, exam.id, 'practice', study.questions);
    for (const q of study.questions) await answerQuestion(repo, session, q, q.number === 2 ? 1 : 0);
    await repo.completeSession(session.id);
    study = await loadStudy(repo, exam.id);
    expect(study.progress).toMatchObject({ learning: 3, mastered: 0 });

    // Round 2: nothing is mastered yet, so the pool is all three; answer everything correctly.
    let pool = buildMasterPool(study);
    expect(pool).toHaveLength(3);
    session = await startSession(repo, exam.id, 'master', pool);
    for (const q of pool) await answerQuestion(repo, session, q, 0);
    study = await loadStudy(repo, exam.id);
    // 1 and 3 reached two in a row; 2 has one correct after a miss.
    expect(study.progress).toMatchObject({ mastered: 2, learning: 1 });

    // Round 3: only question 2 is left.
    pool = buildMasterPool(study);
    expect(pool.map((q) => q.number)).toEqual([2]);
    session = await startSession(repo, exam.id, 'master', pool);
    await answerQuestion(repo, session, pool[0], 0);
    study = await loadStudy(repo, exam.id);
    expect(study.progress.percentMastered).toBe(100);
    expect(study.complete).toBe(true);
    expect(buildMasterPool(study)).toEqual([]);
  });

  it('a wrong answer demotes a mastered question back to learning', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 1);
    let study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'practice', study.questions);
    const q = study.questions[0];
    await answerQuestion(repo, session, q, 0);
    await answerQuestion(repo, session, q, 0);
    expect((await loadStudy(repo, exam.id)).complete).toBe(true);
    await answerQuestion(repo, session, q, 2);
    study = await loadStudy(repo, exam.id);
    expect(study.complete).toBe(false);
    expect(study.progress.learning).toBe(1);
  });

  it('skips do not penalise or count', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 1);
    const study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'practice', study.questions);
    await answerQuestion(repo, session, study.questions[0], 0);
    await answerQuestion(repo, session, study.questions[0], null);
    await answerQuestion(repo, session, study.questions[0], 0);
    expect((await loadStudy(repo, exam.id)).complete).toBe(true);
  });

  it('deleting a session reverts mastery (replay, never stored)', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 1);
    const study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'practice', study.questions);
    await answerQuestion(repo, session, study.questions[0], 0);
    await answerQuestion(repo, session, study.questions[0], 0);
    expect((await loadStudy(repo, exam.id)).complete).toBe(true);
    await repo.deleteSession(session.id);
    expect((await loadStudy(repo, exam.id)).progress.unseen).toBe(1);
  });

  it('mixes in mastered questions by percentage and never exceeds what exists', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 10);
    let study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'practice', study.questions);
    for (const q of study.questions.slice(0, 6)) {
      await answerQuestion(repo, session, q, 0);
      await answerQuestion(repo, session, q, 0);
    }
    study = await loadStudy(repo, exam.id);
    expect(buildMasterPool(study)).toHaveLength(4);
    expect(buildMasterPool(study, { mixMasteredPercent: 50 })).toHaveLength(6);
    expect(buildMasterPool(study, { mixMasteredPercent: 100 })).toHaveLength(8);
    expect(buildMasterPool(study, { mixMasteredPercent: 1000 })).toHaveLength(8);
  });

  it('finds where to resume a session', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 3);
    const study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'practice', study.questions);
    expect(nextUnanswered(session, [])).toBe(session.questionIds[0]);
    const a = await answerQuestion(repo, session, study.questions[0], 0);
    expect(nextUnanswered(session, [a])).toBe(session.questionIds[1]);
  });

  it('rejects an empty session and out-of-range choices', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 1);
    const study = await loadStudy(repo, exam.id);
    await expect(startSession(repo, exam.id, 'practice', [])).rejects.toThrow();
    const session = await startSession(repo, exam.id, 'practice', study.questions);
    await expect(answerQuestion(repo, session, study.questions[0], 4)).rejects.toThrow();
  });
});
