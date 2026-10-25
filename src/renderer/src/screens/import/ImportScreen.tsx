import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ParsedExam } from '../../../../core/pdf/types';
import type { ScreenProps } from '../../app/types';
import type { PageRenderer } from '../../pdf/pageRenderer';
import { DuplicateExamError, type ExamRow } from '../../storage/contract';
import { ChooseStep } from './ChooseStep';
import { ConfirmStep } from './ConfirmStep';
import { ReportStep } from './ReportStep';
import { ReviewStep } from './ReviewStep';
import { summarise, toDrafts, toNewQuestions, type Draft } from './importState';
import { createDefaultServices, type ImportServices, type PickedPdf } from './services';

export interface ImportScreenProps extends ScreenProps {
  /** Override pieces of the PDF pipeline (tests); defaults use the real engine. */
  services?: Partial<ImportServices>;
}

type Stage = 'choose' | 'busy' | 'duplicate' | 'report' | 'review' | 'confirm';

const STEPS: { stage: Stage[]; label: string }[] = [
  { stage: ['choose', 'busy', 'duplicate'], label: 'Choose file' },
  { stage: ['report'], label: 'Check' },
  { stage: ['review'], label: 'Review' },
  { stage: ['confirm'], label: 'Save' },
];

function readableError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `We could not read that file. ${detail}`;
}

function Steps({ stage }: { stage: Stage }) {
  const current = STEPS.findIndex((s) => s.stage.includes(stage));
  return (
    <ol className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Import progress">
      {STEPS.map((step, i) => (
        <li
          key={step.label}
          aria-current={i === current ? 'step' : undefined}
          className={`rounded-full px-3 py-1 font-medium ${
            i === current ? 'bg-accent text-on-accent' : i < current ? 'bg-correct-bg text-correct' : 'bg-surface text-muted ring-1 ring-line'
          }`}
        >
          {i + 1}. {step.label}
        </li>
      ))}
    </ol>
  );
}

export function ImportScreen({ repo, navigate, services: override }: ImportScreenProps) {
  const services = useMemo<ImportServices>(() => ({ ...createDefaultServices(), ...override }), [override]);

  const [stage, setStage] = useState<Stage>('choose');
  const [busyMessage, setBusyMessage] = useState('Reading your PDF…');
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<PickedPdf | null>(null);
  const [hash, setHash] = useState('');
  const [duplicate, setDuplicate] = useState<ExamRow | null>(null);
  const [parsed, setParsed] = useState<ParsedExam | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [renderer, setRenderer] = useState<PageRenderer | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const rendererRef = useRef<PageRenderer | null>(null);

  const closeRenderer = useCallback(() => {
    const old = rendererRef.current;
    rendererRef.current = null;
    setRenderer(null);
    if (old) void old.destroy().catch(() => undefined);
  }, []);

  useEffect(() => () => closeRenderer(), [closeRenderer]);

  const reset = useCallback(() => {
    closeRenderer();
    setStage('choose');
    setError(null);
    setFile(null);
    setHash('');
    setDuplicate(null);
    setParsed(null);
    setDrafts([]);
    setSaveError(null);
  }, [closeRenderer]);

  const handleFile = useCallback(
    async (picked: PickedPdf) => {
      closeRenderer();
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) void navigator.storage.persist().catch(() => false);
      setError(null);
      setSaveError(null);
      setFile(picked);
      setBusyMessage('Reading your PDF…');
      setStage('busy');
      try {
        const fileHash = await services.hash(picked.data);
        setHash(fileHash);
        const existing = await repo.findExamByHash(fileHash);
        if (existing) {
          setDuplicate(existing);
          setStage('duplicate');
          return;
        }

        setBusyMessage('Finding the questions and the answer key…');
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const result = await services.parse(picked.data);
        setParsed(result);
        const initial = toDrafts(result);

        // Questions with a picture or table get a screenshot, so they can be studied as printed.
        const withVisual = result.questions.filter((q) => q.visual);
        if (withVisual.length > 0) {
          setBusyMessage(`Taking screenshots of ${withVisual.length} question${withVisual.length === 1 ? '' : 's'} with pictures or tables…`);
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const shots = new Map<number, Blob>();
          for (const q of withVisual) {
            try {
              shots.set(q.number, await services.renderSnapshot(picked.data, q.visual!.segments));
            } catch {
              // The question stays flagged below; the reviewer sees the page instead.
            }
          }
          for (const d of initial) {
            if (!d.hasVisual) continue;
            const blob = shots.get(d.number);
            if (blob) d.snapshot = blob;
            else {
              d.flagged = true;
              d.reasons.push('The screenshot of this question could not be made. Compare it with the PDF page.');
            }
          }
        }
        setDrafts(initial);
        setStage('report');
      } catch (e) {
        setError(readableError(e));
        setStage('choose');
      }
    },
    [closeRenderer, repo, services],
  );

  const nativePick = useCallback(async () => {
    if (!services.pickPdf) return;
    try {
      const picked = await services.pickPdf();
      if (picked) await handleFile(picked);
    } catch (e) {
      setError(readableError(e));
    }
  }, [handleFile, services]);

  async function startReview(): Promise<void> {
    if (file && !rendererRef.current) {
      try {
        const created = await services.createPageRenderer(file.data);
        rendererRef.current = created;
        setRenderer(created);
      } catch {
        // Review still works without the page image; the panel says so.
      }
    }
    setStage('review');
  }

  async function save(): Promise<void> {
    if (!parsed || !file) return;
    setSaving(true);
    setSaveError(null);
    try {
      await repo.saveExam(
        { title: parsed.title, testCode: parsed.testCode, fileHash: hash, fileName: file.name },
        toNewQuestions(drafts),
      );
      navigate({ name: 'library' });
    } catch (e) {
      if (e instanceof DuplicateExamError) {
        setDuplicate(e.existing);
        setStage('duplicate');
      } else {
        setSaveError(`The exam could not be saved. ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-4 flex items-end justify-between gap-4">
        <h1 className="text-2xl font-semibold text-ink">Import an exam</h1>
        <button
          type="button"
          onClick={() => navigate({ name: 'library' })}
          className="rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-bg"
        >
          Cancel
        </button>
      </header>
      <Steps stage={stage} />

      {stage === 'choose' && (
        <ChooseStep
          error={error}
          canUseNativePicker={services.pickPdf !== null}
          onNativePick={() => void nativePick()}
          onFile={(f) => void handleFile(f)}
        />
      )}

      {stage === 'busy' && (
        <div role="status" aria-live="polite" className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-8 py-10">
          <span aria-hidden className="size-6 animate-spin rounded-full border-4 border-line border-t-accent" />
          <span className="text-ink">{busyMessage}</span>
        </div>
      )}

      {stage === 'duplicate' && duplicate && (
        <section aria-labelledby="dup-heading" className="rounded-2xl border border-line bg-surface p-8">
          <h2 id="dup-heading" className="text-xl font-semibold text-ink">
            You already imported this exam
          </h2>
          <p className="mt-2 text-muted">
            “{duplicate.title}” is already in your library, so there is nothing new to add. Your progress on it is
            safe.
          </p>
          <div className="mt-6 flex gap-3">
            <button type="button" onClick={() => navigate({ name: 'library' })} className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong">
              Open my library
            </button>
            <button type="button" onClick={reset} className="rounded-lg border border-line bg-surface px-5 py-2.5 font-semibold text-ink hover:bg-bg">
              Choose a different file
            </button>
          </div>
        </section>
      )}

      {stage === 'report' && parsed && file && (
        <ReportStep fileName={file.name} parsed={parsed} onReview={() => void startReview()} onAnother={reset} />
      )}

      {stage === 'review' && (
        <ReviewStep
          drafts={drafts}
          onChange={setDrafts}
          renderer={renderer}
          onBack={() => setStage('report')}
          onContinue={() => setStage('confirm')}
        />
      )}

      {stage === 'confirm' && parsed && (
        <ConfirmStep
          title={parsed.title}
          summary={summarise(drafts)}
          saving={saving}
          error={saveError}
          onBack={() => setStage('review')}
          onSave={() => void save()}
        />
      )}
    </main>
  );
}
