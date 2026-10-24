import { useEffect, useMemo, useState } from 'react';
import { SnapshotImage } from '../../components/SnapshotImage';
import type { PageRenderer } from '../../pdf/pageRenderer';
import {
  blockingProblems,
  markChecked,
  needsReview,
  setCorrect,
  setField,
  setOption,
  toggleExcluded,
  type Draft,
} from './importState';

interface Props {
  drafts: Draft[];
  onChange: (drafts: Draft[]) => void;
  renderer: PageRenderer | null;
  onBack: () => void;
  onContinue: () => void;
}

type Filter = 'all' | 'review';

function PageImage({ renderer, page }: { renderer: PageRenderer | null; page: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    setFailed(false);
    if (!renderer) return;
    renderer
      .render(page)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [renderer, page]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Original PDF, page {page}</h3>
        <button
          type="button"
          onClick={() => setZoom((z) => !z)}
          className="text-sm font-medium text-accent hover:underline"
          aria-pressed={zoom}
        >
          {zoom ? 'Fit to width' : 'Zoom in'}
        </button>
      </div>
      <div className="max-h-[34rem] overflow-auto rounded-lg border border-line bg-surface">
        {url ? (
          <img src={url} alt={`Page ${page} of the PDF`} className={zoom ? 'max-w-none' : 'w-full'} style={zoom ? { width: '220%' } : undefined} />
        ) : (
          <p className="p-6 text-sm text-muted">{failed ? 'The page could not be drawn.' : 'Drawing the page…'}</p>
        )}
      </div>
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-accent';

function Detail({
  draft,
  drafts,
  onChange,
  renderer,
}: {
  draft: Draft;
  drafts: Draft[];
  onChange: (drafts: Draft[]) => void;
  renderer: PageRenderer | null;
}) {
  const n = draft.number;
  const problems = blockingProblems(draft);
  const open = needsReview(draft);

  return (
    <div className="grid gap-6 min-[1000px]:grid-cols-2">
      <div className="space-y-4">
        {draft.hasVisual && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-ink">Picture or table in this question</h3>
            {draft.snapshot ? (
              <SnapshotImage blob={draft.snapshot} alt={`Question ${n} as printed in the PDF`} />
            ) : (
              <p className="rounded-lg border border-warn bg-warn-bg p-3 text-sm text-ink">
                This question has a picture or table, but the screenshot could not be made. Check the page below.
              </p>
            )}
          </div>
        )}
        <PageImage renderer={renderer} page={draft.sourcePage} />
      </div>

      <form className="space-y-4" onSubmit={(e) => e.preventDefault()} aria-label={`Question ${n}`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-ink">Question {n}</h3>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={draft.excluded}
              onChange={() => onChange(toggleExcluded(drafts, n))}
              className="size-4 accent-[var(--color-wrong)]"
            />
            Exclude this question
          </label>
        </div>

        {open && !draft.excluded && (
          <div className="rounded-lg border border-warn bg-warn-bg p-3 text-sm text-ink">
            <p className="font-semibold text-warn">Please check this one against the PDF</p>
            <ul className="mt-1 list-disc pl-5">
              {draft.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => onChange(markChecked(drafts, n))}
              className="mt-2 rounded-md border border-warn bg-surface px-3 py-1 font-medium text-warn hover:bg-warn-bg"
            >
              It matches the PDF
            </button>
          </div>
        )}
        {draft.flagged && draft.checked && !draft.excluded && (
          <p className="rounded-lg border border-correct/30 bg-correct-bg px-3 py-2 text-sm text-correct">
            Checked.
          </p>
        )}
        {problems.length > 0 && (
          <p role="alert" className="rounded-lg border border-wrong/30 bg-wrong-bg px-3 py-2 text-sm text-wrong">
            {problems.join(' ')} Fix it or exclude the question to continue.
          </p>
        )}

        <fieldset disabled={draft.excluded} className="space-y-4 disabled:opacity-50">
          <Field id={`q${n}-prompt`} label="Question">
            <textarea
              id={`q${n}-prompt`}
              rows={3}
              className={inputClass}
              value={draft.prompt}
              onChange={(e) => onChange(setField(drafts, n, 'prompt', e.target.value))}
            />
          </Field>

          <fieldset>
            <legend className="mb-1 text-sm font-semibold text-ink">Options (select the correct one)</legend>
            <div className="space-y-2">
              {draft.options.map((option, i) => (
                <div key={i} className="flex items-start gap-3">
                  <input
                    type="radio"
                    name={`q${n}-correct`}
                    checked={draft.correctIndex === i}
                    onChange={() => onChange(setCorrect(drafts, n, i as 0 | 1 | 2 | 3))}
                    aria-label={`Option ${'ABCD'[i]} is the correct answer`}
                    className="mt-3 size-4 accent-[var(--color-accent)]"
                  />
                  <span aria-hidden className="mt-2 w-5 font-semibold text-muted">
                    {'ABCD'[i]}
                  </span>
                  <textarea
                    rows={1}
                    aria-label={`Option ${'ABCD'[i]} text`}
                    className={`${inputClass} ${draft.correctIndex === i ? 'border-correct bg-correct-bg' : ''}`}
                    value={option}
                    onChange={(e) => onChange(setOption(drafts, n, i, e.target.value))}
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <Field id={`q${n}-explanation`} label="Explanation (shown after each answer)">
            <textarea
              id={`q${n}-explanation`}
              rows={6}
              className={inputClass}
              value={draft.explanation}
              onChange={(e) => onChange(setField(drafts, n, 'explanation', e.target.value))}
            />
          </Field>
        </fieldset>
      </form>
    </div>
  );
}

export function ReviewStep({ drafts, onChange, renderer, onBack, onContinue }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<number>(() => drafts.find(needsReview)?.number ?? drafts[0]?.number ?? 1);

  const reviewCount = drafts.filter((d) => !d.excluded && needsReview(d)).length;
  const visible = useMemo(() => {
    const list = filter === 'review' ? drafts.filter((d) => needsReview(d)) : drafts;
    // Flagged questions float to the top of "All" too, so they are never buried at question 80. Sorted by
    // the original flag so the list does not reshuffle under the cursor while editing.
    return [...list].sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.number - b.number);
  }, [drafts, filter]);

  const current = drafts.find((d) => d.number === selected) ?? drafts[0];

  // Keep the selection valid when the filter hides the selected question.
  const currentVisible = visible.some((d) => d.number === selected);
  const shown = currentVisible ? current : (visible[0] ?? current);

  function step(delta: number): void {
    const index = visible.findIndex((d) => d.number === shown.number);
    const next = visible[index + delta];
    if (next) setSelected(next.number);
  }

  return (
    <section aria-labelledby="review-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="review-heading" className="text-xl font-semibold text-ink">
            Check your questions
          </h2>
          <p className="text-sm text-muted">
            Compare each question with the PDF. Anything you change here is what you will study.
          </p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onBack} className="rounded-lg border border-line bg-surface px-4 py-2 font-semibold text-ink hover:bg-bg">
            Back
          </button>
          <button type="button" onClick={onContinue} className="rounded-lg bg-accent px-5 py-2 font-semibold text-on-accent hover:bg-accent-strong">
            Continue to save
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 min-[900px]:grid-cols-[13rem_1fr]">
        <nav aria-label="Questions" className="min-w-0">
          <div role="tablist" aria-label="Filter" className="mb-2 flex rounded-lg border border-line bg-surface p-1 text-sm">
            <button
              role="tab"
              type="button"
              aria-selected={filter === 'all'}
              onClick={() => setFilter('all')}
              className={`flex-1 rounded-md px-2 py-1 font-medium ${filter === 'all' ? 'bg-accent text-on-accent' : 'text-ink'}`}
            >
              All ({drafts.length})
            </button>
            <button
              role="tab"
              type="button"
              aria-selected={filter === 'review'}
              onClick={() => setFilter('review')}
              className={`flex-1 rounded-md px-2 py-1 font-medium ${filter === 'review' ? 'bg-accent text-on-accent' : 'text-ink'}`}
            >
              To check ({reviewCount})
            </button>
          </div>
          <ul className="max-h-[40rem] space-y-1 overflow-auto pr-1">
            {visible.length === 0 && <li className="p-3 text-sm text-muted">Nothing left to review.</li>}
            {visible.map((d) => {
              const flagged = needsReview(d) && !d.excluded;
              const active = d.number === shown.number;
              return (
                <li key={d.number}>
                  <button
                    type="button"
                    onClick={() => setSelected(d.number)}
                    aria-current={active ? 'true' : undefined}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                      active ? 'border-accent bg-accent/10' : flagged ? 'border-warn bg-warn-bg' : 'border-line bg-surface'
                    } ${d.excluded ? 'opacity-60' : ''}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">Q{d.number}</span>
                      {flagged && <span className="rounded bg-warn-bg px-1.5 text-xs font-semibold text-warn">Check</span>}
                      {d.excluded && <span className="rounded bg-line px-1.5 text-xs font-semibold text-muted">Excluded</span>}
                      {d.hasVisual && !d.excluded && <span className="rounded bg-accent/15 px-1.5 text-xs font-semibold text-accent">Picture</span>}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-muted">{d.prompt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 rounded-2xl border border-line bg-surface p-5">
          {shown ? (
            <>
              <Detail draft={shown} drafts={drafts} onChange={onChange} renderer={renderer} />
              <div className="mt-5 flex justify-between border-t border-line pt-4">
                <button type="button" onClick={() => step(-1)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-bg">
                  ← Previous
                </button>
                <button type="button" onClick={() => step(1)} className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-bg">
                  Next →
                </button>
              </div>
            </>
          ) : (
            <p className="text-muted">There are no questions to review.</p>
          )}
        </div>
      </div>
    </section>
  );
}
