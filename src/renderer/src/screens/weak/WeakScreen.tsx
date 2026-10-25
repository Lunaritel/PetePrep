import type { ScreenProps } from '../../app/types';
import { BANK_RULE, HELP } from '../../app/helpText';
import { shuffle, weakQuestions } from '../../storage/studyService';
import { StudyFlow } from '../../study/StudyFlow';
import { Card, MasteryBar, Page, PrimaryButton, SecondaryButton } from '../../study/ui';

type Props = ScreenProps & { examId: string; sessionId?: string };

/** Weak points: a drill of only this exam's mistake-bank questions. */
export function WeakScreen({ repo, navigate, examId, sessionId }: Props) {
  return (
    <StudyFlow
      repo={repo}
      navigate={navigate}
      kind="weak"
      examId={examId}
      sessionId={sessionId}
      heading="Weak points"
      renderStart={({ study, unfinished, begin, resume, busy }) => {
        const weak = weakQuestions(study);

        if (weak.length === 0 && !unfinished) {
          return (
            <Page>
              <Card className="text-center">
                <h1 className="text-2xl font-bold">Nothing to review here</h1>
                <p className="mt-2 text-muted">
                  You have no missed questions in {study.exam.title} right now. Questions you get wrong will show up here.
                </p>
                <p className="mx-auto mt-3 max-w-prose text-sm text-muted">{BANK_RULE}</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <PrimaryButton onClick={() => navigate({ name: 'library' })}>Back to library</PrimaryButton>
                </div>
              </Card>
            </Page>
          );
        }

        return (
          <Page>
            <Card>
              <h1 className="text-2xl font-bold">{study.exam.title}</h1>
              <p className="mt-1 text-muted">
                {HELP.weak.label} · {weak.length} {weak.length === 1 ? 'question' : 'questions'}
              </p>
              <p className="mt-3 text-sm text-muted">{HELP.weak.long}</p>
              <div className="my-5">
                <MasteryBar progress={study.progress} />
              </div>

              {unfinished && (
                <div className="mb-5 rounded-xl border border-line bg-bg p-4">
                  <p className="font-semibold">You have an unfinished weak points round.</p>
                  <p className="mt-1 text-sm text-muted">Pick up exactly where you stopped, or begin a new round.</p>
                  <div className="mt-3">
                    <PrimaryButton onClick={resume} disabled={busy}>
                      Resume
                    </PrimaryButton>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {unfinished ? (
                  <SecondaryButton onClick={() => void begin(shuffle(weak))} disabled={busy || weak.length === 0}>
                    Start new round
                  </SecondaryButton>
                ) : (
                  <PrimaryButton onClick={() => void begin(shuffle(weak))} disabled={busy}>
                    Start
                  </PrimaryButton>
                )}
                <SecondaryButton onClick={() => navigate({ name: 'library' })}>Back to library</SecondaryButton>
              </div>
            </Card>
          </Page>
        );
      }}
    />
  );
}
