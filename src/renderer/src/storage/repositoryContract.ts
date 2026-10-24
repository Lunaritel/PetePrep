import { beforeEach, describe, expect, it } from 'vitest';
import { BackupFormatError, DuplicateExamError } from './contract';
import type { BackupFile, NewQuestion, QuestionRow, Repository } from './contract';

/** A real 1x1 PNG, so snapshot round-trips are checked against genuine image bytes. */
export const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function tinyPng(): Blob {
  const binary = atob(TINY_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes as BlobPart], { type: 'image/png' });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    if (typeof blob.arrayBuffer === 'function') {
      blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function makeQuestion(number: number, overrides: Partial<NewQuestion> = {}): NewQuestion {
  return {
    number,
    prompt: `Question ${number}?`,
    options: ['alpha', 'beta', 'gamma', 'delta'],
    correctIndex: (number % 4) as 0 | 1 | 2 | 3,
    explanation: `Because ${number}.`,
    sourcePage: 2,
    parseConfidence: 1,
    rawText: `${number}. Question ${number}?`,
    hasLetterRefs: false,
    excluded: false,
    ...overrides,
  };
}

/** Everything observable through the Repository, with blobs flattened so states can be compared. */
export async function captureState(repo: Repository) {
  const exams = await repo.listExams();
  const ordered = [...exams].sort((a, b) => a.id.localeCompare(b.id));
  const questions: (Omit<QuestionRow, 'snapshot'> & { snapshot?: string })[] = [];
  const sessions = [];
  const answers = [];
  for (const exam of ordered) {
    for (const { snapshot, ...rest } of await repo.getQuestions(exam.id)) {
      questions.push({ ...rest, ...(snapshot ? { snapshot: await blobToBase64(snapshot) } : {}) });
    }
    const examSessions = await repo.listSessions(exam.id);
    sessions.push(...examSessions);
    answers.push(...(await repo.listAnswers(exam.id)));
  }
  return JSON.parse(JSON.stringify({ exams: ordered, questions, sessions, answers }));
}

async function expectBackupRejected(repo: Repository, backup: unknown, pattern?: RegExp) {
  const before = await captureState(repo);
  const error = await repo.importAll(backup).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, 'importAll should reject').toBeInstanceOf(BackupFormatError);
  if (pattern) expect((error as Error).message).toMatch(pattern);
  expect(await captureState(repo), 'a rejected backup must leave existing data untouched').toEqual(before);
}

/** The behaviour every Repository implementation must have. */
export function runRepositoryContract(name: string, factory: () => Promise<Repository> | Repository): void {
  describe(`Repository contract: ${name}`, () => {
    let repo: Repository;

    beforeEach(async () => {
      repo = await factory();
    });

    const seed = (hash = 'hash-a', count = 4, title = 'Exam A') =>
      repo.saveExam(
        { title, testCode: '1206', fileHash: hash, fileName: `${hash}.pdf` },
        Array.from({ length: count }, (_, i) => makeQuestion(i + 1)),
      );

    describe('exams', () => {
      it('starts empty', async () => {
        expect(await repo.listExams()).toEqual([]);
        expect(await repo.getExam('missing')).toBeUndefined();
        expect(await repo.findExamByHash('nope')).toBeUndefined();
      });

      it('saves an exam with its questions and counts only non-excluded ones', async () => {
        const exam = await repo.saveExam({ title: 'T', fileHash: 'h', fileName: 'f.pdf' }, [
          makeQuestion(1),
          makeQuestion(2, { excluded: true }),
          makeQuestion(3),
        ]);
        expect(exam.id).toBeTruthy();
        expect(exam.questionCount).toBe(2);
        expect(Number.isNaN(Date.parse(exam.importedAt))).toBe(false);
        expect(await repo.getExam(exam.id)).toEqual(exam);
        expect(await repo.findExamByHash('h')).toEqual(exam);
        const questions = await repo.getQuestions(exam.id);
        expect(questions.map((q) => q.id)).toEqual([`${exam.id}:1`, `${exam.id}:2`, `${exam.id}:3`]);
        expect(questions.every((q) => q.examId === exam.id)).toBe(true);
        expect(questions[1].excluded).toBe(true);
      });

      it('returns questions in printed order regardless of insertion order', async () => {
        const exam = await repo.saveExam({ title: 'T', fileHash: 'h', fileName: 'f.pdf' }, [
          makeQuestion(3),
          makeQuestion(1),
          makeQuestion(10),
          makeQuestion(2),
        ]);
        expect((await repo.getQuestions(exam.id)).map((q) => q.number)).toEqual([1, 2, 3, 10]);
      });

      it('rejects a second import of the same PDF and stores nothing from it', async () => {
        const first = await seed('same');
        const error = await repo.saveExam({ title: 'Again', fileHash: 'same', fileName: 'x.pdf' }, [makeQuestion(1)]).then(
          () => null,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(DuplicateExamError);
        expect((error as DuplicateExamError).existing.id).toBe(first.id);
        expect(await repo.listExams()).toHaveLength(1);
        expect(await repo.getQuestions(first.id)).toHaveLength(4);
      });

      it('lists newest imports first', async () => {
        const older = await seed('h1', 1, 'Older');
        await new Promise((r) => setTimeout(r, 5));
        const newer = await seed('h2', 1, 'Newer');
        expect((await repo.listExams()).map((e) => e.id)).toEqual([newer.id, older.id]);
      });

      it('keeps the optional test code', async () => {
        const exam = await seed();
        expect((await repo.getExam(exam.id))?.testCode).toBe('1206');
      });

      it('round-trips a screenshot blob byte for byte', async () => {
        const exam = await repo.saveExam({ title: 'T', fileHash: 'h', fileName: 'f.pdf' }, [
          makeQuestion(1, { snapshot: tinyPng() }),
          makeQuestion(2),
        ]);
        const [withShot, without] = await repo.getQuestions(exam.id);
        expect(without.snapshot).toBeUndefined();
        expect(withShot.snapshot).toBeDefined();
        expect(await blobToBase64(withShot.snapshot as Blob)).toBe(TINY_PNG_BASE64);
      });

      it('deleteExam removes the exam, questions, sessions and answers, and leaves other exams alone', async () => {
        const a = await seed('a', 2, 'A');
        const b = await seed('b', 2, 'B');
        const [qa] = await repo.getQuestions(a.id);
        const [qb] = await repo.getQuestions(b.id);
        const sa = await repo.createSession({ examId: a.id, kind: 'practice', questionIds: [qa.id] });
        const sb = await repo.createSession({ examId: b.id, kind: 'practice', questionIds: [qb.id] });
        await repo.recordAnswer({ sessionId: sa.id, examId: a.id, questionId: qa.id, chosenIndex: 0, correct: true });
        await repo.recordAnswer({ sessionId: sb.id, examId: b.id, questionId: qb.id, chosenIndex: 1, correct: false });

        await repo.deleteExam(a.id);

        expect(await repo.getExam(a.id)).toBeUndefined();
        expect(await repo.findExamByHash('a')).toBeUndefined();
        expect(await repo.getQuestions(a.id)).toEqual([]);
        expect(await repo.listSessions(a.id)).toEqual([]);
        expect(await repo.getSession(sa.id)).toBeUndefined();
        expect(await repo.listAnswers(a.id)).toEqual([]);
        expect(await repo.getQuestions(b.id)).toHaveLength(2);
        expect(await repo.listSessions(b.id)).toHaveLength(1);
        expect(await repo.listAnswers(b.id)).toHaveLength(1);
        // The hash is free again, so the same PDF can be re-imported.
        await expect(seed('a', 1, 'A again')).resolves.toBeTruthy();
      });

      it('deleting a missing exam is harmless', async () => {
        await expect(repo.deleteExam('nope')).resolves.toBeUndefined();
      });
    });

    describe('sessions and answers', () => {
      it('creates, fetches and completes a session', async () => {
        const exam = await seed();
        const questions = await repo.getQuestions(exam.id);
        const session = await repo.createSession({ examId: exam.id, kind: 'master', questionIds: questions.map((q) => q.id) });
        expect(session.id).toBeTruthy();
        expect(session.kind).toBe('master');
        expect(session.completedAt).toBeUndefined();
        expect(await repo.getSession(session.id)).toEqual(session);

        const done = await repo.completeSession(session.id);
        expect(done.completedAt).toBeDefined();
        expect((await repo.getSession(session.id))?.completedAt).toBe(done.completedAt);
        expect(done.questionIds).toEqual(session.questionIds);
      });

      it('refuses to create a session for a missing exam and to complete a missing session', async () => {
        await expect(repo.createSession({ examId: 'nope', kind: 'practice', questionIds: [] })).rejects.toThrow();
        await expect(repo.completeSession('nope')).rejects.toThrow();
      });

      it('lists sessions oldest first and only for the requested exam', async () => {
        const a = await seed('a', 1, 'A');
        const b = await seed('b', 1, 'B');
        const first = await repo.createSession({ examId: a.id, kind: 'practice', questionIds: [] });
        await new Promise((r) => setTimeout(r, 5));
        const second = await repo.createSession({ examId: a.id, kind: 'master', questionIds: [] });
        await repo.createSession({ examId: b.id, kind: 'practice', questionIds: [] });
        expect((await repo.listSessions(a.id)).map((s) => s.id)).toEqual([first.id, second.id]);
      });

      it('orders answers by answeredAt, and keeps insertion order for identical timestamps', async () => {
        const exam = await seed();
        const [q1, q2, q3] = await repo.getQuestions(exam.id);
        const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [q1.id, q2.id, q3.id] });
        const base = { sessionId: session.id, examId: exam.id, chosenIndex: 0, correct: true };
        await repo.recordAnswer({ ...base, questionId: q3.id, answeredAt: '2026-01-01T00:00:03.000Z' });
        await repo.recordAnswer({ ...base, questionId: q1.id, answeredAt: '2026-01-01T00:00:01.000Z' });
        const tie = '2026-01-01T00:00:02.000Z';
        const t1 = await repo.recordAnswer({ ...base, questionId: q2.id, answeredAt: tie });
        const t2 = await repo.recordAnswer({ ...base, questionId: q2.id, answeredAt: tie, correct: false });
        const t3 = await repo.recordAnswer({ ...base, questionId: q1.id, answeredAt: tie });

        const listed = await repo.listAnswers(exam.id);
        expect(listed.map((a) => a.answeredAt)).toEqual([
          '2026-01-01T00:00:01.000Z',
          tie,
          tie,
          tie,
          '2026-01-01T00:00:03.000Z',
        ]);
        expect(listed.slice(1, 4).map((a) => a.id)).toEqual([t1.id, t2.id, t3.id]);
        expect(await repo.listSessionAnswers(session.id)).toEqual(listed);
      });

      it('fills in answeredAt and keeps optional fields', async () => {
        const exam = await seed();
        const [q] = await repo.getQuestions(exam.id);
        const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [q.id] });
        const before = Date.now();
        const answer = await repo.recordAnswer({
          sessionId: session.id,
          examId: exam.id,
          questionId: q.id,
          chosenIndex: null,
          correct: false,
          durationMs: 1234,
        });
        expect(Date.parse(answer.answeredAt)).toBeGreaterThanOrEqual(before - 1000);
        expect(answer.chosenIndex).toBeNull();
        expect(answer.durationMs).toBe(1234);
        expect((await repo.listSessionAnswers(session.id))[0]).toEqual(answer);
      });

      it('rapid answers recorded back to back come out in the order they were written', async () => {
        const exam = await seed('rapid', 1);
        const [q] = await repo.getQuestions(exam.id);
        const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [q.id] });
        const written: boolean[] = [];
        for (let i = 0; i < 25; i += 1) {
          const correct = i % 3 !== 0;
          written.push(correct);
          await repo.recordAnswer({ sessionId: session.id, examId: exam.id, questionId: q.id, chosenIndex: 0, correct });
        }
        expect((await repo.listAnswers(exam.id)).map((a) => a.correct)).toEqual(written);
      });

      it('deleteSession removes its answers only', async () => {
        const exam = await seed();
        const [q] = await repo.getQuestions(exam.id);
        const s1 = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [q.id] });
        const s2 = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [q.id] });
        const base = { examId: exam.id, questionId: q.id, chosenIndex: 0, correct: true };
        await repo.recordAnswer({ ...base, sessionId: s1.id });
        await repo.recordAnswer({ ...base, sessionId: s2.id });
        await repo.deleteSession(s1.id);
        expect(await repo.getSession(s1.id)).toBeUndefined();
        expect(await repo.listSessionAnswers(s1.id)).toEqual([]);
        expect(await repo.listSessionAnswers(s2.id)).toHaveLength(1);
        expect(await repo.listAnswers(exam.id)).toHaveLength(1);
      });

      it('resetProgress clears sessions and answers but keeps the exam and its questions', async () => {
        const a = await seed('a', 2, 'A');
        const b = await seed('b', 2, 'B');
        for (const exam of [a, b]) {
          const [q] = await repo.getQuestions(exam.id);
          const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: [q.id] });
          await repo.recordAnswer({ sessionId: session.id, examId: exam.id, questionId: q.id, chosenIndex: 0, correct: true });
        }
        await repo.resetProgress(a.id);
        expect(await repo.getExam(a.id)).toBeDefined();
        expect(await repo.getQuestions(a.id)).toHaveLength(2);
        expect(await repo.listSessions(a.id)).toEqual([]);
        expect(await repo.listAnswers(a.id)).toEqual([]);
        expect(await repo.listSessions(b.id)).toHaveLength(1);
        expect(await repo.listAnswers(b.id)).toHaveLength(1);
      });
    });

    describe('backup', () => {
      async function populate() {
        const a = await repo.saveExam({ title: 'Alpha', testCode: '1206', fileHash: 'ha', fileName: 'a.pdf' }, [
          makeQuestion(1, { snapshot: tinyPng(), hasLetterRefs: true }),
          makeQuestion(2),
          makeQuestion(3, { excluded: true, parseConfidence: 0.4 }),
        ]);
        const b = await repo.saveExam({ title: 'Beta', fileHash: 'hb', fileName: 'b.pdf' }, [makeQuestion(1), makeQuestion(2)]);
        for (const exam of [a, b]) {
          const qs = (await repo.getQuestions(exam.id)).filter((q) => !q.excluded);
          const session = await repo.createSession({ examId: exam.id, kind: 'practice', questionIds: qs.map((q) => q.id) });
          let n = 0;
          for (const q of qs) {
            n += 1;
            await repo.recordAnswer({
              sessionId: session.id,
              examId: exam.id,
              questionId: q.id,
              chosenIndex: n % 2 === 0 ? null : q.correctIndex,
              correct: n % 2 !== 0,
              durationMs: 900 + n,
              answeredAt: `2026-02-0${n}T10:00:00.000Z`,
            });
          }
          if (exam === a) await repo.completeSession(session.id);
        }
        return { a, b };
      }

      it('exports a well-formed backup', async () => {
        await populate();
        const backup = await repo.exportAll();
        expect(backup.format).toBe('deca-mastery-backup');
        expect(backup.version).toBe(1);
        expect(backup.exams).toHaveLength(2);
        expect(backup.questions).toHaveLength(5);
        expect(backup.sessions).toHaveLength(2);
        expect(backup.answers).toHaveLength(4);
        expect(backup.questions.find((q) => q.snapshotPngBase64)?.snapshotPngBase64).toBe(TINY_PNG_BASE64);
        expect(backup.questions.some((q) => 'snapshot' in q)).toBe(false);
      });

      it('export -> wipe -> import restores identical state (via a JSON file round trip)', async () => {
        const { a, b } = await populate();
        const before = await captureState(repo);
        const file = JSON.stringify(await repo.exportAll());

        await repo.deleteExam(a.id);
        await repo.deleteExam(b.id);
        expect(await repo.listExams()).toEqual([]);

        await repo.importAll(JSON.parse(file));
        expect(await captureState(repo)).toEqual(before);
        // Screenshot bytes survive too.
        const [first] = await repo.getQuestions(a.id);
        expect(await blobToBase64(first.snapshot as Blob)).toBe(TINY_PNG_BASE64);
      });

      it('import replaces the whole database', async () => {
        await populate();
        const backup = await repo.exportAll();
        await repo.saveExam({ title: 'Extra', fileHash: 'hx', fileName: 'x.pdf' }, [makeQuestion(1)]);
        await repo.importAll(backup);
        expect((await repo.listExams()).map((e) => e.title).sort()).toEqual(['Alpha', 'Beta']);
        expect(await repo.findExamByHash('hx')).toBeUndefined();
      });

      it('importing into a brand-new database works, and the restored data is usable', async () => {
        const { a } = await populate();
        const backup = JSON.parse(JSON.stringify(await repo.exportAll()));
        const fresh = await factory();
        await fresh.importAll(backup);
        expect((await fresh.listExams()).map((e) => e.id).sort()).toEqual([a.id, (await repo.listExams()).find((e) => e.title === 'Beta')!.id].sort());
        const session = await fresh.createSession({ examId: a.id, kind: 'master', questionIds: [] });
        expect(await fresh.getSession(session.id)).toBeDefined();
        await expect(
          fresh.saveExam({ title: 'dup', fileHash: 'ha', fileName: 'a.pdf' }, [makeQuestion(1)]),
        ).rejects.toBeInstanceOf(DuplicateExamError);
      });

      it('an empty backup empties the database', async () => {
        await populate();
        await repo.importAll({ format: 'deca-mastery-backup', version: 1, exportedAt: 'x', exams: [], questions: [], sessions: [], answers: [] });
        expect(await repo.listExams()).toEqual([]);
      });

      describe('rejects malformed backups and keeps existing data', () => {
        let good: BackupFile;
        const clone = (): BackupFile => JSON.parse(JSON.stringify(good));

        beforeEach(async () => {
          await populate();
          good = await repo.exportAll();
        });

        it('not an object / wrong format / wrong version', async () => {
          await expectBackupRejected(repo, null, /not a DECAPete backup/);
          await expectBackupRejected(repo, 'hello', /not a DECAPete backup/);
          await expectBackupRejected(repo, [], /not a DECAPete backup/);
          await expectBackupRejected(repo, { ...clone(), format: 'something-else' }, /not a DECAPete backup/);
          await expectBackupRejected(repo, { ...clone(), version: 2 }, /version/i);
        });

        it('missing lists', async () => {
          for (const key of ['exams', 'questions', 'sessions', 'answers'] as const) {
            const bad: Record<string, unknown> = { ...clone() };
            delete bad[key];
            await expectBackupRejected(repo, bad, new RegExp(key));
          }
        });

        it('a question whose exam is missing', async () => {
          const bad = clone();
          bad.questions[0].examId = 'ghost';
          await expectBackupRejected(repo, bad, /exam that is not in the backup/);
        });

        it('a session whose exam is missing, or that lists an unknown question', async () => {
          const orphan = clone();
          orphan.sessions[0].examId = 'ghost';
          await expectBackupRejected(repo, orphan, /exam that is not in the backup/);
          const dangling = clone();
          dangling.sessions[0].questionIds.push('ghost:99');
          await expectBackupRejected(repo, dangling, /question that is not in the backup/);
        });

        it('an answer whose session or question is missing', async () => {
          const noSession = clone();
          noSession.answers[0].sessionId = 'ghost';
          await expectBackupRejected(repo, noSession, /session that is not in the backup/);
          const noQuestion = clone();
          noQuestion.answers[0].questionId = 'ghost:1';
          await expectBackupRejected(repo, noQuestion, /question that is not in the backup/);
        });

        it('bad option count', async () => {
          const three = clone();
          (three.questions[0].options as string[]).pop();
          await expectBackupRejected(repo, three, /four text options/);
          const five = clone();
          (five.questions[0].options as string[]).push('extra');
          await expectBackupRejected(repo, five, /four text options/);
          const notText = clone();
          (notText.questions[0].options as unknown[])[2] = 7;
          await expectBackupRejected(repo, notText, /four text options/);
        });

        it('an answer outside A-D', async () => {
          const key = clone();
          (key.questions[0] as { correctIndex: number }).correctIndex = 4;
          await expectBackupRejected(repo, key, /outside A-D/);
          const choice = clone();
          choice.answers[0].chosenIndex = 7;
          await expectBackupRejected(repo, choice, /outside A-D/);
        });

        it('wrong field types', async () => {
          const bad = clone();
          (bad.exams[0] as unknown as { title: number }).title = 5;
          await expectBackupRejected(repo, bad, /title/);
          const flag = clone();
          (flag.questions[0] as unknown as { excluded: string }).excluded = 'no';
          await expectBackupRejected(repo, flag, /excluded/);
        });

        it('a damaged picture', async () => {
          const bad = clone();
          const withShot = bad.questions.find((q) => q.snapshotPngBase64)!;
          withShot.snapshotPngBase64 = '***not base64***';
          await expectBackupRejected(repo, bad, /damaged picture/);
        });

        it('duplicate exams, hashes, questions, sessions and answers', async () => {
          const exams = clone();
          exams.exams.push({ ...exams.exams[0] });
          await expectBackupRejected(repo, exams, /same exam twice/);
          const hash = clone();
          hash.exams[1].fileHash = hash.exams[0].fileHash;
          await expectBackupRejected(repo, hash, /same PDF/);
          const questions = clone();
          questions.questions.push({ ...questions.questions[0] });
          await expectBackupRejected(repo, questions, /same question twice/);
          const sessions = clone();
          sessions.sessions.push({ ...sessions.sessions[0] });
          await expectBackupRejected(repo, sessions, /same session twice/);
          const answers = clone();
          answers.answers.push({ ...answers.answers[0] });
          await expectBackupRejected(repo, answers, /same answer twice/);
        });
      });
    });
  });
}
