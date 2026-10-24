import { describe, expect, it } from 'vitest';
import { parseBackup, serialiseBackup, type DatabaseSnapshot } from './backupFormat';
import { BackupFormatError } from './contract';
import type { QuestionRow } from './contract';
import { TINY_PNG_BASE64, blobToBase64, tinyPng } from './repositoryContract';

function question(number: number, extra: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id: `e1:${number}`,
    examId: 'e1',
    number,
    prompt: `Q${number}`,
    options: ['a', 'b', 'c', 'd'],
    correctIndex: 1,
    explanation: 'because',
    sourcePage: 1,
    parseConfidence: 1,
    rawText: `${number}. Q${number}`,
    hasLetterRefs: false,
    excluded: false,
    ...extra,
  };
}

function snapshot(): DatabaseSnapshot {
  return {
    exams: [{ id: 'e1', title: 'T', fileHash: 'h', fileName: 'f.pdf', importedAt: '2026-01-01T00:00:00.000Z', questionCount: 2 }],
    questions: [question(1, { snapshot: tinyPng() }), question(2)],
    sessions: [{ id: 's1', examId: 'e1', kind: 'practice', questionIds: ['e1:1', 'e1:2'], startedAt: '2026-01-01T00:00:00.000Z' }],
    answers: [
      { id: 'a1', sessionId: 's1', examId: 'e1', questionId: 'e1:1', chosenIndex: 1, correct: true, answeredAt: '2026-01-01T00:00:01.000Z' },
      { id: 'a2', sessionId: 's1', examId: 'e1', questionId: 'e1:2', chosenIndex: null, correct: false, answeredAt: '2026-01-01T00:00:02.000Z' },
    ],
  };
}

describe('serialiseBackup', () => {
  it('encodes screenshots as base64 PNG and leaves other questions without the field', async () => {
    const backup = await serialiseBackup(snapshot());
    expect(backup).toMatchObject({ format: 'peteprep-backup', version: 1 });
    expect(backup.questions[0].snapshotPngBase64).toBe(TINY_PNG_BASE64);
    expect('snapshotPngBase64' in backup.questions[1]).toBe(false);
    expect(backup.questions.every((q) => !('snapshot' in q))).toBe(true);
  });

  it('is a copy: changing the database afterwards does not change an exported backup', async () => {
    const db = snapshot();
    const backup = await serialiseBackup(db);
    db.exams.push({ ...db.exams[0], id: 'e2', fileHash: 'h2' });
    db.sessions[0].questionIds.push('e1:3');
    db.answers[0].correct = false;
    db.questions[1].options[0] = 'changed';
    expect(backup.exams).toHaveLength(1);
    expect(backup.sessions[0].questionIds).toEqual(['e1:1', 'e1:2']);
    expect(backup.answers[0].correct).toBe(true);
    expect(backup.questions[1].options[0]).toBe('a');
  });

  it('works for a large number of rows', async () => {
    const db = snapshot();
    db.questions = Array.from({ length: 300 }, (_, i) => question(i + 1, i % 50 === 0 ? { snapshot: tinyPng() } : {}));
    const backup = await serialiseBackup(db);
    expect(backup.questions).toHaveLength(300);
    expect(backup.questions.filter((q) => q.snapshotPngBase64).length).toBe(6);
  });
});

describe('parseBackup', () => {
  it('restores rows and turns screenshots back into PNG blobs, byte for byte', async () => {
    const file = JSON.parse(JSON.stringify(await serialiseBackup(snapshot())));
    const parsed = await parseBackup(file);
    expect(parsed.exams).toHaveLength(1);
    expect(parsed.sessions[0].questionIds).toEqual(['e1:1', 'e1:2']);
    expect(parsed.answers.map((a) => a.chosenIndex)).toEqual([1, null]);
    const shot = parsed.questions[0].snapshot as Blob;
    expect(shot.type).toBe('image/png');
    expect(await blobToBase64(shot)).toBe(TINY_PNG_BASE64);
    expect(parsed.questions[1].snapshot).toBeUndefined();
  });

  it('accepts an empty database', async () => {
    const parsed = await parseBackup({ format: 'peteprep-backup', version: 1, exams: [], questions: [], sessions: [], answers: [] });
    expect(parsed).toEqual({ exams: [], questions: [], sessions: [], answers: [] });
  });

  it('throws BackupFormatError (never a raw TypeError) for hostile input', async () => {
    const good = JSON.parse(JSON.stringify(await serialiseBackup(snapshot())));
    const hostile: unknown[] = [
      undefined,
      42,
      'text',
      { format: 'peteprep-backup', version: 1 },
      { ...good, exams: 'nope' },
      { ...good, exams: [null] },
      { ...good, questions: [1] },
      { ...good, sessions: [[]] },
      { ...good, answers: [{}] },
      { ...good, sessions: [{ ...good.sessions[0], kind: 'exam' }] },
      { ...good, sessions: [{ ...good.sessions[0], questionIds: 'e1:1' }] },
      { ...good, exams: [{ ...good.exams[0], questionCount: Number.NaN }] },
    ];
    for (const input of hostile) {
      await expect(parseBackup(input), JSON.stringify(input)?.slice(0, 80)).rejects.toBeInstanceOf(BackupFormatError);
    }
  });

  it('rejects an answer that points at an exam not in the backup', async () => {
    const good = JSON.parse(JSON.stringify(await serialiseBackup(snapshot())));
    good.answers[0].examId = 'ghost';
    await expect(parseBackup(good)).rejects.toThrow(/exam that is not in the backup/);
  });
});
