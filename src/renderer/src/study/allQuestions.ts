import type { QuestionRow, Repository } from '../storage/contract';

export interface AllQuestions {
  /** Every studyable (non-excluded) question of every exam. */
  questions: QuestionRow[];
  /** examId -> exam title, for labelling questions in mixed drills. */
  titles: Map<string, string>;
}

/** Used by mixed-exam screens (mistake bank drill, its results) that cannot load a single exam. */
export async function loadAllQuestions(repo: Repository): Promise<AllQuestions> {
  const exams = await repo.listExams();
  const lists = await Promise.all(exams.map((e) => repo.getQuestions(e.id)));
  return {
    questions: lists.flat().filter((q) => !q.excluded),
    titles: new Map(exams.map((e) => [e.id, e.title])),
  };
}
