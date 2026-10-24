import { useMemo, useState } from 'react';
import type { ScreenProps } from '../../app/types';
import { buildMasterPool, statusOf } from '../../storage/studyService';
import type { Study } from '../../storage/studyService';
import { StudyFlow } from '../../study/StudyFlow';
import { Card, MasteryBar, Page, PrimaryButton, SecondaryButton } from '../../study/ui';

type Props = ScreenProps & { examId: string; sessionId?: string };

interface StartProps {
  study: Study;
  unfinished: boolean;
  busy: boolean;
  onBegin: (mix: number) => void;
  onResume: () => void;
  onLibrary: () => void;
  onStats: () => void;
}

function MasterStart({ study, unfinished, busy, onBegin, onResume, onLibrary, onStats }: StartProps) {
  const [mix, setMix] = useState(0);
  const masteredCount = study.questions.filter((q) => statusOf(study, q.id) === 'mastered').length;
  const pendingCount = study.questions.length - masteredCount;
  const poolSize = useMemo(() => buildMasterPool(study, { mixMasteredPercent: mix }).length, [study, mix]);

  if (pendingCount === 0 && study.questions.length > 0) {
    return (
      <Page>
        <Card className="text-center">
          <h1 className="text-2xl font-bold text-correct">Everything mastered</h1>
          <p className="mt-2 text-muted">
            You answered every question in {study.exam.title} correctly twice in a row. There is nothing left to drill.
          </p>
          <div className="my-5">
            <MasteryBar progress={study.progress} />
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <PrimaryButton onClick={onLibrary}>Back to library</PrimaryButton>
            <SecondaryButton onClick={onStats}>Stats</SecondaryButton>
          </div>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        <h1 className="text-2xl font-bold">{study.exam.title}</h1>
        <p className="mt-1 text-muted">Master exam</p>
        <p className="mt-4 text-lg">
          <strong>{pendingCount}</strong> {pendingCount === 1 ? 'question' : 'questions'} still to master
          {mix > 0 && poolSize > pendingCount ? ` (+${poolSize - pendingCount} for review)` : ''}.
        </p>
        <div className="my-5">
          <MasteryBar progress={study.progress} />
        </div>

        {unfinished && (
          <div className="mb-5 rounded-xl border border-line bg-bg p-4">
            <p className="font-semibold">You have an unfinished master round.</p>
            <div className="mt-3">
              <PrimaryButton onClick={onResume} disabled={busy}>
                Resume
              </PrimaryButton>
            </div>
          </div>
        )}

        {masteredCount > 0 && (
          <div className="mb-2">
            <label htmlFor="mix" className="block font-medium">
              Include {mix}% of mastered questions for review
            </label>
            <input
              id="mix"
              type="range"
              min={0}
              max={100}
              step={5}
              value={mix}
              onChange={(e) => setMix(Number(e.target.value))}
              className="mt-2 h-11 w-full accent-accent"
            />
            <p className="text-sm text-muted">Adds a few already-mastered questions so they stay fresh. 0% drills only what is left.</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {unfinished ? (
            <SecondaryButton onClick={() => onBegin(mix)} disabled={busy}>
              Start new round
            </SecondaryButton>
          ) : (
            <PrimaryButton onClick={() => onBegin(mix)} disabled={busy || poolSize === 0}>
              Start
            </PrimaryButton>
          )}
          <SecondaryButton onClick={onLibrary}>Back to library</SecondaryButton>
        </div>
      </Card>
    </Page>
  );
}

export function MasterScreen({ repo, navigate, examId, sessionId }: Props) {
  return (
    <StudyFlow
      repo={repo}
      navigate={navigate}
      kind="master"
      examId={examId}
      sessionId={sessionId}
      heading="Master exam"
      renderStart={({ study, unfinished, begin, resume, busy }) => (
        <MasterStart
          study={study}
          unfinished={unfinished !== null}
          busy={busy}
          onBegin={(mix) => void begin(buildMasterPool(study, { mixMasteredPercent: mix }))}
          onResume={resume}
          onLibrary={() => navigate({ name: 'library' })}
          onStats={() => navigate({ name: 'stats', examId })}
        />
      )}
    />
  );
}
