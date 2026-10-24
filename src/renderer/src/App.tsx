import { useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import type { AnswerRecord, Attempt, Exam } from '../../core/domain';
import {
  buildMasterExam,
  createMasteryState,
  getProgress,
  gradeAnswer,
  isMasteryComplete,
  recordAttempt,
} from '../../core/mastery';
import { sampleExam } from '../../core/sampleExam';

const rootExam = sampleExam;

export function App(): ReactElement {
  const [mastery, setMastery] = useState(() => createMasteryState(rootExam.id));
  const [exam, setExam] = useState<Exam>(rootExam);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerRecord | null>(null);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [attemptNumber, setAttemptNumber] = useState(0);

  const progress = useMemo(() => getProgress(mastery, rootExam), [mastery]);
  const complete = isMasteryComplete(mastery, rootExam);
  const remaining = progress.total - progress.mastered;
  const isMasterExam = exam.id !== rootExam.id;
  const question = index < exam.questions.length ? exam.questions[index] : null;
  const answerChoice =
    question?.choices.find((choice) => choice.id === question.correctChoiceId) ?? null;

  function handleSubmit(): void {
    if (!question || selected === null) return;
    const record = gradeAnswer(question, selected, new Date().toISOString());
    setFeedback(record);
    setAnswers((previous) => [...previous, record]);
  }

  function handleNext(): void {
    if (!question) return;
    const now = new Date().toISOString();
    const attempt: Attempt = {
      id: `${exam.id}-attempt-${attemptNumber + 1}`,
      examId: exam.id,
      kind: isMasterExam ? 'master' : 'initial',
      answers,
      startedAt: now,
      completedAt: now,
    };

    setMastery((previous) => recordAttempt(previous, exam, attempt));
    setAttemptNumber((count) => count + 1);
    setAnswers([]);
    setFeedback(null);
    setSelected(null);
    setIndex(index + 1);
  }

  function handleStartMaster(): void {
    const nextExam = buildMasterExam(mastery, rootExam);
    if (!nextExam) return;
    setExam(nextExam);
    setIndex(0);
    setSelected(null);
    setFeedback(null);
    setAnswers([]);
  }

  function handleReset(): void {
    setMastery(createMasteryState(rootExam.id));
    setExam(rootExam);
    setIndex(0);
    setSelected(null);
    setFeedback(null);
    setAnswers([]);
    setAttemptNumber(0);
  }

  return (
    <main className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Engine demo · sample data</p>
          <h1>DECA Mastery</h1>
        </div>
        <div className="progress-summary" aria-label="Overall mastery">
          <span className="progress-value">{progress.percentMastered}%</span>
          <span className="progress-label">
            {progress.mastered} of {progress.total} mastered
          </span>
        </div>
      </header>

      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percentMastered}
        aria-label="Mastery progress"
      >
        <div className="progress-fill" style={{ width: `${progress.percentMastered}%` }} />
      </div>

      {question === null ? (
        <section className="card summary">
          <h2>
            {complete ? 'Mastered' : isMasterExam ? 'Master exam complete' : 'Attempt complete'}
          </h2>
          <p className="muted">
            {complete
              ? 'Every question in this exam has been answered correctly twice in a row.'
              : `${remaining} question${remaining === 1 ? '' : 's'} still need more practice.`}
          </p>
          <dl className="stats">
            <div>
              <dt>Mastered</dt>
              <dd>{progress.mastered}</dd>
            </div>
            <div>
              <dt>Learning</dt>
              <dd>{progress.learning}</dd>
            </div>
            <div>
              <dt>Unseen</dt>
              <dd>{progress.unseen}</dd>
            </div>
          </dl>
          <div className="actions">
            {remaining > 0 && (
              <button type="button" className="primary" onClick={handleStartMaster}>
                Start master exam ({remaining})
              </button>
            )}
            <button type="button" className="ghost" onClick={handleReset}>
              Reset progress
            </button>
          </div>
        </section>
      ) : (
        <section className="card">
          <div className="question-meta">
            <span className="badge">{isMasterExam ? 'Master exam' : 'Exam'}</span>
            <span className="muted">
              Question {index + 1} of {exam.questions.length}
            </span>
          </div>

          <h2 className="prompt">{question.prompt}</h2>

          <ul className="choices">
            {question.choices.map((choice) => {
              const isSelected = selected === choice.id;
              const isAnswer = feedback !== null && choice.id === question.correctChoiceId;
              const isWrongPick = feedback !== null && isSelected && !feedback.correct;
              const classes = [
                'choice',
                isSelected ? 'is-selected' : '',
                isAnswer ? 'is-answer' : '',
                isWrongPick ? 'is-wrong' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <li key={choice.id}>
                  <button
                    type="button"
                    className={classes}
                    onClick={() => {
                      if (!feedback) setSelected(choice.id);
                    }}
                    disabled={feedback !== null}
                    aria-pressed={isSelected}
                  >
                    <span className="choice-label">{choice.label}</span>
                    <span className="choice-text">{choice.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {feedback && (
            <div className={feedback.correct ? 'feedback correct' : 'feedback wrong'}>
              <p className="feedback-title">{feedback.correct ? 'Correct' : 'Incorrect'}</p>
              {!feedback.correct && answerChoice && (
                <p className="feedback-answer">
                  Correct answer:{' '}
                  <strong>
                    {answerChoice.label}. {answerChoice.text}
                  </strong>
                </p>
              )}
              {question.explanation && (
                <p className="feedback-explanation">{question.explanation}</p>
              )}
            </div>
          )}

          <div className="actions">
            {feedback === null ? (
              <button
                type="button"
                className="primary"
                onClick={handleSubmit}
                disabled={selected === null}
              >
                Submit answer
              </button>
            ) : (
              <button type="button" className="primary" onClick={handleNext}>
                {index + 1 === exam.questions.length ? 'Finish attempt' : 'Next question'}
              </button>
            )}
          </div>
        </section>
      )}

      <footer className="app-footer">
        <span>Demo questions only. PDF import arrives in the next increment.</span>
        <span>Attempts recorded: {attemptNumber}</span>
      </footer>
    </main>
  );
}
