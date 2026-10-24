import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { Progress } from '../../../core/domain';

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-base font-semibold ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function PrimaryButton(
  { className = '', ...props },
  ref,
) {
  return <button ref={ref} type="button" className={`${BUTTON_BASE} bg-accent text-on-accent hover:bg-accent-strong ${className}`} {...props} />;
});

export const SecondaryButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(function SecondaryButton(
  { className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`${BUTTON_BASE} border border-line bg-surface text-ink hover:border-accent ${className}`}
      {...props}
    />
  );
});

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-3xl px-5 py-6 text-ink">{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-surface p-6 shadow-sm ${className}`}>{children}</section>;
}

export function MasteryBar({ progress }: { progress: Progress }) {
  return (
    <div>
      <div
        role="progressbar"
        aria-label="Mastery"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percentMastered}
        className="h-3 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-correct transition-[width]" style={{ width: `${progress.percentMastered}%` }} />
      </div>
      <p className="mt-2 text-sm text-muted">
        {progress.mastered} of {progress.total} mastered &middot; {progress.learning} learning &middot; {progress.unseen} not seen yet
      </p>
    </div>
  );
}
