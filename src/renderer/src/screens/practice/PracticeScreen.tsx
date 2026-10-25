import { useState } from 'react';
import type { ScreenProps } from '../../app/types';
import { HELP } from '../../app/helpText';
import { shuffle } from '../../storage/studyService';
import { StudyFlow } from '../../study/StudyFlow';
import { Card, MasteryBar, Page, PrimaryButton, SecondaryButton } from '../../study/ui';

type Props = ScreenProps & { examId: string; sessionId?: string };

export function PracticeScreen({ repo, navigate, examId, sessionId }: Props) {
  const [shuffleOrder, setShuffleOrder] = useState(true);

  return (
    <StudyFlow
      repo={repo}
      navigate={navigate}
      kind="practice"
      examId={examId}
      sessionId={sessionId}
      heading="Practice"
      renderStart={({ study, unfinished, begin, resume, busy }) => (
        <Page>
          <Card>
            <h1 className="text-2xl font-bold">{study.exam.title}</h1>
            <p className="mt-1 text-muted">Practice · {study.questions.length} questions</p>
            <p className="mt-3 text-sm text-muted">{HELP.practice.long}</p>
            <div className="my-5">
              <MasteryBar progress={study.progress} />
            </div>

            {unfinished && (
              <div className="mb-5 rounded-xl border border-line bg-bg p-4">
                <p className="font-semibold">You have an unfinished practice session.</p>
                <p className="mt-1 text-sm text-muted">Pick up exactly where you stopped, or begin again from question 1.</p>
                <div className="mt-3">
                  <PrimaryButton onClick={resume} disabled={busy}>
                    Resume
                  </PrimaryButton>
                </div>
              </div>
            )}

            <label className="flex min-h-11 items-center gap-3 text-base">
              <input
                type="checkbox"
                className="size-5 accent-accent"
                checked={shuffleOrder}
                onChange={(e) => setShuffleOrder(e.target.checked)}
              />
              Shuffle question order
            </label>
            <p className="mt-1 text-sm text-muted">Answer choices always stay in their printed order.</p>

            <div className="mt-6 flex flex-wrap gap-3">
              {unfinished ? (
                <SecondaryButton onClick={() => void begin(shuffleOrder ? shuffle(study.questions) : study.questions)} disabled={busy}>
                  Start new
                </SecondaryButton>
              ) : (
                <PrimaryButton onClick={() => void begin(shuffleOrder ? shuffle(study.questions) : study.questions)} disabled={busy || study.questions.length === 0}>
                  Start
                </PrimaryButton>
              )}
              <SecondaryButton onClick={() => navigate({ name: 'library' })}>Back to library</SecondaryButton>
            </div>
          </Card>
        </Page>
      )}
    />
  );
}
