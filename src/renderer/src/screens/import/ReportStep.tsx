import type { ParsedExam } from '../../../../core/pdf/types';

interface Props {
  fileName: string;
  parsed: ParsedExam;
  onReview: () => void;
  onAnother: () => void;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4">
      <div className="text-2xl font-semibold text-ink">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

export function ReportStep({ fileName, parsed, onReview, onAnother }: Props) {
  const { report } = parsed;
  const errors = report.issues.filter((i) => i.severity === 'error');
  const warnings = report.issues.filter((i) => i.severity === 'warning');
  const canContinue = report.ok && parsed.questions.length > 0;

  return (
    <section aria-labelledby="report-heading">
      <h2 id="report-heading" className="text-xl font-semibold text-ink">
        {canContinue ? 'We read your exam' : 'We could not read this exam'}
      </h2>
      <p className="mt-1 text-muted">
        {parsed.title}
        {parsed.testCode ? ` · Test ${parsed.testCode}` : ''} · <span className="break-all">{fileName}</span>
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="Pages" value={report.pageCount} />
        <Stat label="Questions found" value={report.questionCount} />
        <Stat label="Answer-key entries" value={report.keyCount} />
      </div>

      {errors.length > 0 && (
        <div role="alert" className="mt-5 rounded-xl border border-wrong/30 bg-wrong-bg p-5">
          <h3 className="font-semibold text-wrong">Problems that stop the import</h3>
          <p className="mt-1 text-sm text-ink">
            Nothing was saved. This usually means the PDF has a layout the app does not know yet.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
            {errors.map((issue, i) => (
              <li key={i}>
                {issue.question !== undefined && <strong>Question {issue.question}: </strong>}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-5 rounded-xl border border-warn bg-warn-bg p-5">
          <h3 className="font-semibold text-warn">
            {warnings.length} thing{warnings.length === 1 ? '' : 's'} to double-check
          </h3>
          <p className="mt-1 text-sm text-ink">You will see these questions first in the next step.</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
            {warnings.map((issue, i) => (
              <li key={i}>
                {issue.question !== undefined && <strong>Question {issue.question}: </strong>}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {canContinue && warnings.length === 0 && (
        <p className="mt-5 rounded-xl border border-correct/30 bg-correct-bg px-5 py-4 text-correct">
          Every question has four options, an answer and an explanation. You can still look through them before saving.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {canContinue && (
          <button
            type="button"
            onClick={onReview}
            className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-on-accent hover:bg-accent-strong"
          >
            Review questions
          </button>
        )}
        <button
          type="button"
          onClick={onAnother}
          className="rounded-lg border border-line bg-surface px-5 py-2.5 font-semibold text-ink hover:bg-bg"
        >
          Try another file
        </button>
      </div>
    </section>
  );
}
