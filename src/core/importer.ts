import type { Choice, Exam, Question } from './domain';

export type ImportResult =
  | { ok: true; exam: Exam }
  | { ok: false; error: string };

export interface ExamParser {
  readonly name: string;
  parse(content: string): ImportResult;
}

const CHOICE_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'imported-exam';
}

function resolveChoiceId(choices: Choice[], raw: string): string | null {
  const wanted = raw.trim();
  if (!wanted) {
    return null;
  }

  const lower = wanted.toLowerCase();
  const byId = choices.find((choice) => choice.id.toLowerCase() === lower);
  if (byId) {
    return byId.id;
  }

  const byLabel = choices.find((choice) => choice.label.toLowerCase() === lower);
  if (byLabel) {
    return byLabel.id;
  }

  const byText = choices.find((choice) => choice.text.trim().toLowerCase() === lower);
  if (byText) {
    return byText.id;
  }

  return null;
}

type QuestionResult = { ok: true; question: Question } | { ok: false; error: string };

function parseQuestion(value: unknown, index: number): QuestionResult {
  const prefix = `Question ${index + 1}: `;

  if (!isRecord(value)) {
    return { ok: false, error: `${prefix}must be an object.` };
  }

  const prompt = typeof value.prompt === 'string' ? value.prompt.trim() : '';
  if (!prompt) {
    return { ok: false, error: `${prefix}prompt is required.` };
  }

  const rawChoices = Array.isArray(value.choices) ? value.choices : [];
  if (rawChoices.length < 2) {
    return { ok: false, error: `${prefix}at least two choices are required.` };
  }

  const choices: Choice[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rawChoices.length; i += 1) {
    const raw = rawChoices[i];
    if (!isRecord(raw)) {
      return { ok: false, error: `${prefix}choice ${i + 1} must be an object.` };
    }

    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text) {
      return { ok: false, error: `${prefix}choice ${i + 1} text is required.` };
    }

    const fallbackLabel = CHOICE_LABELS[i] ?? `C${i + 1}`;
    const id =
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : fallbackLabel.toLowerCase();

    if (seen.has(id.toLowerCase())) {
      return { ok: false, error: `${prefix}duplicate choice id "${id}".` };
    }
    seen.add(id.toLowerCase());

    const label =
      typeof raw.label === 'string' && raw.label.trim()
        ? raw.label.trim()
        : id.toUpperCase();

    choices.push({ id, label, text });
  }

  const number =
    typeof value.number === 'number' && Number.isFinite(value.number)
      ? value.number
      : index + 1;

  let correctChoiceId: string | undefined;
  const rawCorrect = value.correctChoiceId;
  const rawAnswer = value.answer;

  if (typeof rawCorrect === 'string' && rawCorrect.trim()) {
    const resolved = resolveChoiceId(choices, rawCorrect);
    if (!resolved) {
      return {
        ok: false,
        error: `${prefix}correctChoiceId "${rawCorrect}" does not match any choice.`,
      };
    }
    correctChoiceId = resolved;
  } else if (typeof rawAnswer === 'string' && rawAnswer.trim()) {
    const resolved = resolveChoiceId(choices, rawAnswer);
    if (!resolved) {
      return {
        ok: false,
        error: `${prefix}answer "${rawAnswer}" does not match any choice.`,
      };
    }
    correctChoiceId = resolved;
  }

  const explanation =
    typeof value.explanation === 'string' && value.explanation.trim()
      ? value.explanation.trim()
      : undefined;

  const question: Question = {
    id: `q${index + 1}`,
    number,
    prompt,
    choices,
  };

  if (correctChoiceId) {
    question.correctChoiceId = correctChoiceId;
  }
  if (explanation) {
    question.explanation = explanation;
  }

  return { ok: true, question };
}

export function parseExamJson(content: string): ImportResult {
  let root: unknown;

  try {
    root = JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Not valid JSON: ${detail}` };
  }

  if (!isRecord(root)) {
    return { ok: false, error: 'Exam file must contain a JSON object.' };
  }

  const rawQuestions = Array.isArray(root.questions) ? root.questions : [];
  if (rawQuestions.length === 0) {
    return { ok: false, error: 'Exam must contain at least one question.' };
  }

  const questions: Question[] = [];

  for (let i = 0; i < rawQuestions.length; i += 1) {
    const result = parseQuestion(rawQuestions[i], i);
    if (!result.ok) {
      return result;
    }
    questions.push(result.question);
  }

  const title =
    typeof root.title === 'string' && root.title.trim()
      ? root.title.trim()
      : 'Imported exam';
  const id =
    typeof root.id === 'string' && root.id.trim()
      ? root.id.trim()
      : `imported-${slugify(title)}`;

  return { ok: true, exam: { id, title, questions } };
}

export const jsonExamParser: ExamParser = {
  name: 'JSON',
  parse: parseExamJson,
};

export function parseExam(
  content: string,
  parsers: ExamParser[] = [jsonExamParser],
): ImportResult {
  let lastError = 'No parser could read this file.';

  for (const parser of parsers) {
    const result = parser.parse(content);
    if (result.ok) {
      return result;
    }
    lastError = result.error;
  }

  return { ok: false, error: lastError };
}
