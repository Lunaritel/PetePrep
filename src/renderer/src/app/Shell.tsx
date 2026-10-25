import { Component, useCallback, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { BankScreen } from '../screens/bank';
import { ImportScreen } from '../screens/import';
import { LibraryScreen } from '../screens/library';
import { MasterScreen } from '../screens/master';
import { Onboarding, hasSeenOnboarding, markOnboardingSeen } from '../screens/onboarding';
import { PracticeScreen } from '../screens/practice';
import { ResultsScreen } from '../screens/results';
import { SettingsScreen } from '../screens/settings';
import { WeakScreen } from '../screens/weak';
import { StatsScreen } from '../screens/stats';
import type { Repository } from '../storage/contract';
import type { Route } from './types';
import { useAutoUpdateCheck } from './useAutoUpdateCheck';

interface BoundaryProps {
  children: ReactNode;
  onReset: () => void;
}

interface BoundaryState {
  error: Error | null;
}

/** Keeps a crash in one screen from blanking the whole app; progress is already saved per answer. */
class ScreenBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Screen crashed', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="rounded-xl border border-wrong bg-wrong-bg p-6">
        <h2 className="text-lg font-semibold text-wrong">Something went wrong on this screen</h2>
        <p className="mt-2 text-sm text-ink">
          Your saved progress is safe. Go back to the library and try again.
        </p>
        <p className="mt-2 text-xs text-muted">{this.state.error.message}</p>
        <button
          type="button"
          className="mt-4 min-h-11 rounded-lg bg-accent px-4 font-semibold text-on-accent"
          onClick={() => {
            this.setState({ error: null });
            this.props.onReset();
          }}
        >
          Back to library
        </button>
      </div>
    );
  }
}

function routeKey(route: Route): string {
  return JSON.stringify(route);
}

function renderRoute(route: Route, repo: Repository, navigate: (route: Route) => void): ReactNode {
  const props = { repo, navigate };
  switch (route.name) {
    case 'library':
      return <LibraryScreen {...props} />;
    case 'import':
      return <ImportScreen {...props} />;
    case 'practice':
      return <PracticeScreen {...props} examId={route.examId} sessionId={route.sessionId} />;
    case 'master':
      return <MasterScreen {...props} examId={route.examId} sessionId={route.sessionId} />;
    case 'weak':
      return <WeakScreen {...props} examId={route.examId} sessionId={route.sessionId} />;
    case 'bank':
      return <BankScreen {...props} sessionId={route.sessionId} />;
    case 'results':
      return <ResultsScreen {...props} examId={route.examId} sessionId={route.sessionId} />;
    case 'stats':
      return <StatsScreen {...props} examId={route.examId} />;
    case 'settings':
      return <SettingsScreen {...props} />;
  }
}

const NAV: { label: string; route: Route; matches: Route['name'][] }[] = [
  { label: 'Library', route: { name: 'library' }, matches: ['library'] },
  { label: 'Mistake bank', route: { name: 'bank' }, matches: ['bank'] },
  { label: 'Import exam', route: { name: 'import' }, matches: ['import'] },
  { label: 'Settings', route: { name: 'settings' }, matches: ['settings'] },
];

export function Shell({ repo }: { repo: Repository }) {
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const [onboarded, setOnboarded] = useState<boolean>(() => hasSeenOnboarding());

  useAutoUpdateCheck();

  const navigate = useCallback((next: Route) => setRoute(next), []);

  useEffect(() => {
    window.scrollTo?.(0, 0);
  }, [route]);

  if (!onboarded) {
    return (
      <div className="min-h-[100dvh] bg-bg text-ink">
        <main className="mx-auto max-w-3xl px-0 py-0">
          <Onboarding
            onDone={() => {
              markOnboardingSeen();
              setOnboarded(true);
            }}
          />
        </main>
      </div>
    );
  }

  const studying =
    route.name === 'practice' || route.name === 'master' || route.name === 'weak' || (route.name === 'bank' && !!route.sessionId);

  return (
    <div className="min-h-[100dvh] bg-bg text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-col gap-2 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5 sm:py-3">
          <button
            type="button"
            className="min-h-11 text-lg font-bold tracking-tight text-ink"
            onClick={() => navigate({ name: 'library' })}
          >
            PetePrep
          </button>
          {!studying && (
            <nav aria-label="Main" className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto">
              {NAV.map((item) => {
                const active = item.matches.includes(route.name);
                return (
                  <button
                    key={item.label}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    className={`min-h-11 rounded-lg px-2 text-sm font-semibold sm:px-3 ${
                      active ? 'bg-accent text-on-accent' : 'text-muted hover:bg-bg hover:text-ink'
                    }`}
                    onClick={() => navigate(item.route)}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}
        </div>
      </header>
      <main className="min-w-0">
        <ScreenBoundary key={routeKey(route)} onReset={() => navigate({ name: 'library' })}>
          {renderRoute(route, repo, navigate)}
        </ScreenBoundary>
      </main>
    </div>
  );
}
