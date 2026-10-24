import { describe, expect, it } from 'vitest';
import type { ExamParser } from './importer';
import { jsonExamParser, parseExam, parseExamJson } from './importer';

const minimalExam = {
  title: 'Marketing Cluster Exam',
  questions: [
    {
      prompt: 'Which element of the marketing mix covers distribution?',
      choices: [
        { text: 'Product' },
        { text: 'Price' },
        { text: 'Place' },
        { text: 'Promotion' },
      ],
      answer: 'C',
      explanation: 'Place covers getting the product to the customer.',
    },
  ],
};

function expectOk(content: string) {
  const result = parseExamJson(content);
  if (!result.ok) {
    throw new Error(`Expected success, got: ${result.error}`);
  }
  return result.exam;
}

function expectError(content: string): string {
  const result = parseExamJson(content);
  if (result.ok) {
    throw new Error('Expected failure, got success.');
  }
  return result.error;
}

describe('parseExamJson', () => {
  it('parses a minimal exam and applies defaults', () => {
    const exam = expectOk(JSON.stringify(minimalExam));

    expect(exam.title).toBe('Marketing Cluster Exam');
    expect(exam.id).toBe('imported-marketing-cluster-exam');
    expect(exam.questions).toHaveLength(1);

    const question = exam.questions[0];
    expect(question.id).toBe('q1');
    expect(question.number).toBe(1);
    expect(question.prompt).toBe(
      'Which element of the marketing mix covers distribution?',
    );
    expect(question.choices.map((choice) => choice.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(question.choices.map((choice) => choice.label)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
    expect(question.correctChoiceId).toBe('c');
    expect(question.explanation).toBe(
      'Place covers getting the product to the customer.',
    );
  });

  it('keeps explicit ids, labels, and question numbers', () => {
    const exam = expectOk(
      JSON.stringify({
        id: 'deca-marketing-2024',
        title: 'DECA Marketing 2024',
        questions: [
          {
            number: 42,
            prompt: 'Prompt',
            choices: [
              { id: 'x', label: 'X', text: 'One' },
              { id: 'y', label: 'Y', text: 'Two' },
            ],
            correctChoiceId: 'X',
          },
        ],
      }),
    );

    expect(exam.id).toBe('deca-marketing-2024');
    expect(exam.questions[0].number).toBe(42);
    expect(exam.questions[0].correctChoiceId).toBe('x');
  });

  it('imports a question without an answer', () => {
    const exam = expectOk(
      JSON.stringify({
        questions: [
          {
            prompt: 'Prompt',
            choices: [{ text: 'One' }, { text: 'Two' }],
          },
        ],
      }),
    );

    expect(exam.title).toBe('Imported exam');
    expect(exam.id).toBe('imported-imported-exam');
    expect(exam.questions[0].correctChoiceId).toBeUndefined();
  });

  it('rejects invalid JSON', () => {
    expect(expectError('{ nope')).toMatch(/^Not valid JSON:/);
  });

  it('rejects a non-object root', () => {
    expect(expectError('[]')).toBe(
      'Exam file must contain a JSON object.',
    );
  });

  it('rejects an exam with no questions', () => {
    expect(expectError(JSON.stringify({ title: 'Empty', questions: [] }))).toBe(
      'Exam must contain at least one question.',
    );
  });

  it('rejects a question without a prompt', () => {
    expect(
      expectError(
        JSON.stringify({
          questions: [{ choices: [{ text: 'One' }, { text: 'Two' }] }],
        }),
      ),
    ).toBe('Question 1: prompt is required.');
  });

  it('rejects a question with fewer than two choices', () => {
    expect(
      expectError(
        JSON.stringify({
          questions: [{ prompt: 'Prompt', choices: [{ text: 'One' }] }],
        }),
      ),
    ).toBe('Question 1: at least two choices are required.');
  });

  it('rejects a choice without text', () => {
    expect(
      expectError(
        JSON.stringify({
          questions: [
            {
              prompt: 'Prompt',
              choices: [{ text: 'One' }, { text: '   ' }],
            },
          ],
        }),
      ),
    ).toBe('Question 1: choice 2 text is required.');
  });

  it('rejects duplicate choice ids', () => {
    expect(
      expectError(
        JSON.stringify({
          questions: [
            {
              prompt: 'Prompt',
              choices: [
                { id: 'a', text: 'One' },
                { id: 'a', text: 'Two' },
              ],
            },
          ],
        }),
      ),
    ).toBe('Question 1: duplicate choice id "a".');
  });

  it('rejects a correctChoiceId that matches no choice', () => {
    expect(
      expectError(
        JSON.stringify({
          questions: [
            {
              prompt: 'Prompt',
              choices: [{ text: 'One' }, { text: 'Two' }],
              correctChoiceId: 'z',
            },
          ],
        }),
      ),
    ).toBe('Question 1: correctChoiceId "z" does not match any choice.');
  });

  it('rejects an answer that matches no choice', () => {
    expect(
      expectError(
        JSON.stringify({
          questions: [
            {
              prompt: 'Prompt',
              choices: [{ text: 'One' }, { text: 'Two' }],
              answer: 'Z',
            },
          ],
        }),
      ),
    ).toBe('Question 1: answer "Z" does not match any choice.');
  });

  it('reports the offending question number', () => {
    expect(
      expectError(
        JSON.stringify({
          questions: [
            minimalExam.questions[0],
            { prompt: '', choices: [{ text: 'One' }, { text: 'Two' }] },
          ],
        }),
      ),
    ).toBe('Question 2: prompt is required.');
  });
});

describe('parseExam', () => {
  it('uses the JSON parser by default', () => {
    const result = parseExam(JSON.stringify(minimalExam));
    expect(result.ok).toBe(true);
  });

  it('falls through to the first parser that succeeds', () => {
    const rejecting: ExamParser = {
      name: 'Rejecting',
      parse: () => ({ ok: false, error: 'nope' }),
    };

    const result = parseExam(JSON.stringify(minimalExam), [
      rejecting,
      jsonExamParser,
    ]);

    expect(result.ok).toBe(true);
  });

  it('returns the last parser error when every parser fails', () => {
    const first: ExamParser = {
      name: 'First',
      parse: () => ({ ok: false, error: 'first failed' }),
    };
    const second: ExamParser = {
      name: 'Second',
      parse: () => ({ ok: false, error: 'second failed' }),
    };

    expect(parseExam('anything', [first, second])).toEqual({
      ok: false,
      error: 'second failed',
    });
  });

  it('reports a default error when there are no parsers', () => {
    expect(parseExam('anything', [])).toEqual({
      ok: false,
      error: 'No parser could read this file.',
    });
  });
});
