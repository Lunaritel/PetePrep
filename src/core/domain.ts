export interface Choice {
  id: string;
  label: string;
  text: string;
}

export interface Question {
  id: string;
  number: number;
  prompt: string;
  choices: Choice[];
  correctChoiceId?: string;
  explanation?: string;
}

export interface Exam {
  id: string;
  title: string;
  sourceFile?: string;
  questions: Question[];
}

export type AttemptKind = 'initial' | 'master';

export interface AnswerRecord {
  questionId: string;
  selectedChoiceId: string | null;
  correct: boolean;
  answeredAt: string;
}

export interface Attempt {
  id: string;
  examId: string;
  kind: AttemptKind;
  answers: AnswerRecord[];
  startedAt: string;
  completedAt?: string;
}

export type MasteryStatus = 'unseen' | 'learning' | 'mastered';

export interface MasteryState {
  examId: string;
  status: Record<string, MasteryStatus>;
  attempts: Attempt[];
}

export interface Progress {
  total: number;
  mastered: number;
  learning: number;
  unseen: number;
  percentMastered: number;
}
