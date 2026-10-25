import { describe, expect, it } from 'vitest';
import { BANK_EXAM_ID, type NewQuestion, type Repository } from './contract';
import { createMemoryRepository } from './memoryRepository';
import { bankCountsByExam, buildMistakePool, deriveReview, isInMistakeBank, loadMistakeBank, separateRepeatedWording } from './mistakeBank';
import { answerQuestion, loadStudy, startSession, weakQuestions } from './studyService';

function question(number: number): NewQuestion {
  return {
    number,
    prompt: `Question ${number}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 0,
    explanation: `Because ${number}`,
    sourcePage: 1,
    parseConfidence: 1,
    rawText: '',
    hasLetterRefs: false,
    excluded: false,
  };
}

const seed = (repo: Repository, hash: string, count = 5) =>
  repo.saveExam({ title: `Exam ${hash}`, fileHash: hash, fileName: `${hash}.pdf` }, Array.from({ length: count }, (_, i) => question(i + 1)));

/** One round over the given questions: `miss` lists question numbers answered wrong, the rest right. */
async function round(repo: Repository, examId: string, numbers: number[], miss: number[] = [], kind: 'practice' | 'master' | 'weak' = 'practice') {
  const study = await loadStudy(repo, examId);
  const rows = numbers.map((n) => study.questions.find((q) => q.number === n)!);
  const session = await startSession(repo, examId, kind, rows);
  for (const q of rows) await answerQuestion(repo, session, q, miss.includes(q.number) ? 1 : 0);
  await repo.completeSession(session.id);
  return session;
}

describe('separateRepeatedWording', () => {
  const q = (id: string, prompt: string) => ({ id, prompt }) as never;

  it('moves a repeated wording away from its twin when it can', () => {
    const out = separateRepeatedWording([q('a', 'Same text'), q('b', 'same  TEXT'), q('c', 'Other'), q('d', 'Another')]);
    const prompts = out.map((x) => (x as { prompt: string }).prompt.toLowerCase().replace(/\s+/g, ' '));
    for (let i = 1; i < prompts.length; i += 1) expect(prompts[i]).not.toBe(prompts[i - 1]);
    expect(out.map((x) => (x as { id: string }).id).sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps every question and leaves a list with no twins untouched', () => {
    const input = [q('a', 'One'), q('b', 'Two'), q('c', 'Three')];
    expect(separateRepeatedWording(input)).toEqual(input);
  });

  it('cannot help when every question has the same wording, but never loses any', () => {
    const out = separateRepeatedWording([q('a', 'X'), q('b', 'X')]);
    expect(out).toHaveLength(2);
  });
});

describe('mistake bank', () => {
  it('starts empty and only fills with questions you miss', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 'a');
    expect(await loadMistakeBank(repo)).toEqual([]);
    await round(repo, exam.id, [1, 2, 3, 4, 5], [2, 4]);
    const bank = await loadMistakeBank(repo);
    expect(bank.map((e) => e.question.number).sort()).toEqual([2, 4]);
    expect(bank.every((e) => e.timesMissed === 1 && e.correctRounds === 0)).toBe(true);
  });

  it('a question leaves the bank after two correct answers in two separate rounds', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 'a');
    await round(repo, exam.id, [1, 2, 3], [2]); // miss 2
    await round(repo, exam.id, [2], [], 'weak'); // correct, round 1 of 2
    let bank = await loadMistakeBank(repo);
    expect(bank.map((e) => [e.question.number, e.correctRounds])).toEqual([[2, 1]]);
    await round(repo, exam.id, [2], [], 'weak'); // correct, round 2 of 2
    bank = await loadMistakeBank(repo);
    expect(bank).toEqual([]);
  });

  it('two correct answers inside the SAME round do not clear a question', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 'a');
    await round(repo, exam.id, [1], [1]);
    const study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'weak', [study.questions[0]]);
    await answerQuestion(repo, session, study.questions[0], 0);
    await answerQuestion(repo, session, study.questions[0], 0);
    const review = deriveReview((await loadStudy(repo, exam.id)).answers);
    expect(review.get(study.questions[0].id)).toEqual({ timesMissed: 1, correctRounds: 1 });
    expect(isInMistakeBank(review.get(study.questions[0].id))).toBe(true);
  });

  it('a miss while recovering resets progress, and a cleared question re-enters on a new miss', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 'a');
    await round(repo, exam.id, [1], [1]);
    await round(repo, exam.id, [1]); // 1 correct round
    await round(repo, exam.id, [1], [1]); // missed again: back to 0
    let [entry] = await loadMistakeBank(repo);
    expect(entry).toMatchObject({ timesMissed: 2, correctRounds: 0 });
    await round(repo, exam.id, [1]);
    await round(repo, exam.id, [1]); // cleared
    expect(await loadMistakeBank(repo)).toEqual([]);
    await round(repo, exam.id, [1], [1]); // missed again later
    [entry] = await loadMistakeBank(repo);
    expect(entry).toMatchObject({ timesMissed: 3, correctRounds: 0 });
  });

  it('skips never count as misses or correct answers', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 'a');
    const study = await loadStudy(repo, exam.id);
    const session = await startSession(repo, exam.id, 'practice', [study.questions[0]]);
    await answerQuestion(repo, session, study.questions[0], null);
    expect(await loadMistakeBank(repo)).toEqual([]);
  });

  it('excluded questions never appear in the bank', async () => {
    const repo = createMemoryRepository();
    const exam = await repo.saveExam({ title: 'x', fileHash: 'x', fileName: 'x.pdf' }, [question(1), { ...question(2), excluded: true }]);
    await round(repo, exam.id, [1], [1]);
    expect((await loadMistakeBank(repo)).map((e) => e.question.number)).toEqual([1]);
  });

  it('mixes exams in one pool, or narrows to a single exam, with each question once', async () => {
    const repo = createMemoryRepository();
    const a = await seed(repo, 'a');
    const b = await seed(repo, 'b');
    await round(repo, a.id, [1, 2, 3, 4, 5], [1, 2, 3]);
    await round(repo, b.id, [1, 2, 3, 4, 5], [4, 5]);
    const bank = await loadMistakeBank(repo);
    const counts = bankCountsByExam(bank);
    expect(counts.get(a.id)).toBe(3);
    expect(counts.get(b.id)).toBe(2);
    const mixed = buildMistakePool(bank);
    expect(mixed).toHaveLength(5);
    expect(new Set(mixed.map((q) => q.id)).size).toBe(5);
    expect(new Set(mixed.map((q) => q.examId))).toEqual(new Set([a.id, b.id]));
    expect(buildMistakePool(bank, { examId: b.id }).map((q) => q.number).sort()).toEqual([4, 5]);
  });

  it('a mixed bank drill records answers per exam and clears questions in each exam', async () => {
    const repo = createMemoryRepository();
    const a = await seed(repo, 'a', 2);
    const b = await seed(repo, 'b', 2);
    await round(repo, a.id, [1, 2], [1]);
    await round(repo, b.id, [1, 2], [2]);
    for (let pass = 0; pass < 2; pass += 1) {
      const pool = buildMistakePool(await loadMistakeBank(repo));
      const session = await startSession(repo, BANK_EXAM_ID, 'bank', pool);
      for (const q of pool) await answerQuestion(repo, session, q, 0);
      await repo.completeSession(session.id);
    }
    expect(await loadMistakeBank(repo)).toEqual([]);
    expect((await repo.listSessions(BANK_EXAM_ID)).map((s) => s.kind)).toEqual(['bank', 'bank']);
    // Exam a: 2 answers in the first round, then its one banked question answered in each of the 2 bank passes.
    expect(await repo.listAnswers(a.id)).toHaveLength(4);
  });

  it('weakQuestions matches the bank for one exam', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 'a');
    await round(repo, exam.id, [1, 2, 3, 4, 5], [3, 5]);
    expect(weakQuestions(await loadStudy(repo, exam.id)).map((q) => q.number)).toEqual([3, 5]);
  });

  it('does not change mastery: right once is still learning, as before', async () => {
    const repo = createMemoryRepository();
    const exam = await seed(repo, 'a');
    await round(repo, exam.id, [1, 2, 3, 4, 5], [2]);
    const study = await loadStudy(repo, exam.id);
    expect(study.progress).toMatchObject({ mastered: 0, learning: 5 });
  });

  it('survives a backup round trip including bank sessions', async () => {
    const repo = createMemoryRepository();
    const a = await seed(repo, 'a', 2);
    await round(repo, a.id, [1, 2], [1]);
    const pool = buildMistakePool(await loadMistakeBank(repo));
    const session = await startSession(repo, BANK_EXAM_ID, 'bank', pool);
    await answerQuestion(repo, session, pool[0], 0);
    const backup = await repo.exportAll();
    const fresh = createMemoryRepository();
    await fresh.importAll(JSON.parse(JSON.stringify(backup)));
    expect((await fresh.listSessions(BANK_EXAM_ID)).map((s) => s.kind)).toEqual(['bank']);
    expect((await loadMistakeBank(fresh)).map((e) => e.correctRounds)).toEqual([1]);
  });
});
