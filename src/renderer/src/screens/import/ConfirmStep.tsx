import { useState } from 'react';
import type { Summary } from './importState';

interface Props {
  title: string;
  summary: Summary;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onSave: () => void;
}

export function ConfirmStep({ title, summary, saving, error, onBack, onSave }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAck = summary.unreviewed > 0;
  const ready = summary.canSave && (!needsAck || acknowledged) && !saving;

  return (
    <section aria-labelledby="confirm-heading" className="max-w-xl">
      <h2 id="confirm-heading" className="text-xl font-semibold text-ink">
        Save to your library
      </h2>
      <p className="mt-1 text-muted">{title}</p>

      <dl className="mt-5 divide-y divide-line rounded-xl border border-line bg-surface">
        <div className="flex justify-between px-5 py-3">
          <dt className="text-ink">Questions you will study</dt>
          <dd className="font-semibold text-ink">{summary.included}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-ink">Questions excluded</dt>
          <dd className="font-semibold text-ink">{summary.excluded}</dd>
        </div>
        <div className="flex justify-between px-5 py-3">
          <dt className="text-ink">Flagged and not yet checked</dt>
          <dd className={`font-semibold ${summary.unreviewed > 0 ? 'text-warn' : 'text-correct'}`}>{summary.unreviewed}</dd>
        </div>
      </dl>

      {summary.included === 0 && (
        <p role="alert" className="mt-4 rounded-lg border border-wrong/30 bg-wrong-bg px-4 py-3 text-wrong">
          Every question is excluded. Go back and include at least one question.
        </p>
      )}
      {summary.blocked > 0 && (
        <p role="alert" className="mt-4 rounded-lg border border-wrong/30 bg-wrong-bg px-4 py-3 text-wrong">
          {summary.blocked} question{summary.blocked === 1 ? ' has' : 's have'} empty text. Go back and fix or exclude
          {summary.blocked === 1 ? ' it' : ' them'}.
        </p>
      )}

      {needsAck && (
        <label className="mt-4 flex items-start gap-3 rounded-lg border border-warn bg-warn-bg px-4 py-3 text-ink">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1 size-4 accent-[var(--color-accent)]"
          />
          <span>I have checked the flagged questions.</span>
        </label>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-wrong/30 bg-wrong-bg px-4 py-3 text-wrong">
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button type="button" onClick={onBack} disabled={saving} className="rounded-lg border border-line bg-surface px-5 py-2.5 font-semibold text-ink hover:bg-bg disabled:opacity-50">
          Back
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!ready}
          className="rounded-lg bg-accent px-6 py-2.5 font-semibold text-on-accent hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save exam'}
        </button>
      </div>
    </section>
  );
}
