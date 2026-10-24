import { useRef, useState } from 'react';
import { btnPrimary, btnSecondary, card } from '../library/ui';

const STORAGE_KEY = 'deca.onboarded';

export function hasSeenOnboarding(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markOnboardingSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage can be unavailable (private mode, blocked site data); the tour simply shows again next time.
  }
}

const CARDS = [
  {
    title: 'Practice until every question sticks',
    body: 'Import a DECA exam and answer its questions one at a time. You see the right answer and the official explanation straight away. Questions you miss come back in a "master exam" until you get each one right twice in a row.',
  },
  {
    title: 'Bring your own exam PDF',
    body: 'Download a DECA sample exam PDF that includes the answer key with explanations, then choose Import exam PDF. The app reads the questions and shows them to you to check before anything is saved. Scanned (picture-only) PDFs cannot be read.',
  },
  {
    title: 'Private by design',
    body: 'Everything stays on this computer. There are no accounts, no internet connection needed, no tracking, and no exam content is built into the app. You can export a backup of your progress at any time from Settings.',
  },
] as const;

interface Props {
  onDone: () => void;
}

export function Onboarding({ onDone }: Props) {
  const [index, setIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const last = index === CARDS.length - 1;
  const current = CARDS[index];

  const finish = (): void => {
    markOnboardingSeen();
    onDone();
  };

  const go = (next: number): void => {
    setIndex(next);
    // Move focus to the new card heading so keyboard and screen-reader users land on the new content.
    queueMicrotask(() => headingRef.current?.focus());
  };

  return (
    <section aria-label="Welcome" className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-8">
      <div className={`${card} w-full`}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted" aria-live="polite">
          Step {index + 1} of {CARDS.length}
        </p>
        <h1 ref={headingRef} tabIndex={-1} className="mb-3 text-2xl font-bold text-ink outline-none">
          {current.title}
        </h1>
        <p className="mb-6 text-ink">{current.body}</p>

        <div className="mb-6 flex gap-2" aria-hidden="true">
          {CARDS.map((_, i) => (
            <span key={i} className={`h-2 flex-1 rounded-full ${i <= index ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" className={btnSecondary} onClick={finish}>
            Skip
          </button>
          <div className="flex gap-2">
            <button type="button" className={btnSecondary} disabled={index === 0} onClick={() => go(index - 1)}>
              Back
            </button>
            {last ? (
              <button type="button" className={btnPrimary} onClick={finish}>
                Get started
              </button>
            ) : (
              <button type="button" className={btnPrimary} onClick={() => go(index + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
