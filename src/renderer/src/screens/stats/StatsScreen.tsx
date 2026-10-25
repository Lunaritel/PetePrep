import { Fragment, useEffect, useMemo, useState } from 'react';
import type { MasteryStatus } from '../../../../core/domain';
import type { ScreenProps } from '../../app/types';
import { loadStudy, type Study } from '../../storage/studyService';
import { BANK_EXAM_ID, type SessionRow } from '../../storage/contract';
import { formatDate, formatDuration } from '../library/format';
import { btnSecondary, card } from '../library/ui';
import {
  computeExamStats,
  sessionKindLabel,
  sortQuestions,
  type ExamStats,
  type SessionStat,
  type SortDir,
  type SortKey,
} from './computeStats';

type StatusFilter = 'all' | MasteryStatus;

const KIND_FILL: Record<SessionStat['kind'], string> = {
  practice: 'fill-correct',
  master: 'fill-accent',
  weak: 'fill-warn',
  bank: 'fill-accent-strong',
};
const KIND_SWATCH: Record<SessionStat['kind'], string> = {
  practice: 'bg-correct',
  master: 'bg-accent',
  weak: 'bg-warn',
  bank: 'bg-accent-strong',
};
const LEGEND_ORDER: SessionStat['kind'][] = ['practice', 'master', 'weak', 'bank'];

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unseen', label: 'Unseen' },
  { value: 'learning', label: 'Learning' },
  { value: 'mastered', label: 'Mastered' },
];

const COLUMNS: { key: Exclude<SortKey, 'weakest'>; label: string; numeric: boolean }[] = [
  { key: 'number', label: '#', numeric: true },
  { key: 'attempts', label: 'Attempts', numeric: true },
  { key: 'correctPct', label: 'Correct', numeric: true },
  { key: 'streak', label: 'Streak', numeric: true },
  { key: 'status', label: 'Status', numeric: false },
  { key: 'avgTime', label: 'Avg time', numeric: true },
];

const STATUS_STYLE: Record<MasteryStatus, string> = {
  mastered: 'bg-correct-bg text-correct',
  learning: 'bg-line text-accent-strong',
  unseen: 'bg-bg text-muted',
};

function truncate(text: string, max = 70): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

interface Loaded {
  study: Study;
  stats: ExamStats;
}

export function StatsScreen({ repo, navigate, examId }: ScreenProps & { examId: string }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('weakest');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const study = await loadStudy(repo, examId);
        // Mixed mistake-bank rounds are stored under BANK_EXAM_ID; computeExamStats keeps only this exam's share.
        const sessions: SessionRow[] = [...(await repo.listSessions(examId)), ...(await repo.listSessions(BANK_EXAM_ID))];
        if (!cancelled) setLoaded({ study, stats: computeExamStats(study, sessions) });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'The statistics could not be loaded.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, examId]);

  const rows = useMemo(() => {
    if (!loaded) return [];
    const filtered = loaded.stats.questions.filter((q) => filter === 'all' || q.status === filter);
    return sortQuestions(filtered, sortKey, sortDir);
  }, [loaded, filter, sortKey, sortDir]);

  const toggleSort = (key: Exclude<SortKey, 'weakest'>): void => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const back = (
    <button type="button" className={btnSecondary} onClick={() => navigate({ name: 'library' })}>
      ← Back to library
    </button>
  );

  if (error) {
    return (
      <section className="mx-auto max-w-4xl px-4 py-6 sm:px-5 sm:py-8">
        <p role="alert" className="mb-4 rounded-lg border border-wrong bg-wrong-bg px-4 py-3 text-sm text-wrong">
          {error}
        </p>
        {back}
      </section>
    );
  }
  if (!loaded) return <p className="px-5 py-8 text-muted">Loading statistics…</p>;

  const { study, stats } = loaded;
  const { progress } = study;

  return (
    <section aria-labelledby="stats-heading" className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-5 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="stats-heading" className="text-2xl font-bold text-ink">
            {study.exam.title}
          </h1>
          <p className="text-sm text-muted">Statistics</p>
        </div>
        {back}
      </div>

      <div className={card}>
        <h2 className="mb-3 text-lg font-bold text-ink">Overall mastery</h2>
        <p className="mb-2 text-3xl font-bold text-ink" data-testid="overall-percent">
          {progress.percentMastered}% mastered
        </p>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Figure label="Mastered" value={String(progress.mastered)} />
          <Figure label="Learning" value={String(progress.learning)} />
          <Figure label="Unseen" value={String(progress.unseen)} />
          <Figure label="Answers given" value={String(stats.overall.attempts)} />
          <Figure
            label="Overall correct"
            value={stats.overall.correctPct === null ? '-' : `${stats.overall.correctPct}%`}
          />
          <Figure
            label="Average time per question"
            value={stats.overall.avgTimeMs === null ? '-' : formatDuration(stats.overall.avgTimeMs)}
          />
        </dl>
      </div>

      <div className={card}>
        <h2 className="mb-3 text-lg font-bold text-ink">Rounds</h2>
        <Timeline sessions={stats.sessions} />
      </div>

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">Question history</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filter by status" className="flex flex-wrap gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={`${btnSecondary} ${filter === f.value ? 'border-accent bg-accent-soft text-accent-strong' : ''}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-pressed={sortKey === 'weakest'}
              onClick={() => {
                setSortKey('weakest');
                setSortDir('asc');
              }}
              className={`${btnSecondary} ${sortKey === 'weakest' ? 'border-accent bg-accent-soft text-accent-strong' : ''}`}
            >
              Weakest first
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-muted">No questions match this filter.</p>
        ) : (
          <div className="space-y-3">
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">
                Per-question history for {study.exam.title}, sorted by{' '}
                {sortKey === 'weakest' ? 'weakest first' : `${sortKey} ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
              </caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  {COLUMNS.map((c) => (
                    <Fragment key={c.key}>
                      <th
                        scope="col"
                        aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`py-2 pr-3 ${c.numeric ? 'text-right' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(c.key)}
                          className="inline-flex min-h-11 items-center gap-1 font-semibold hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          {c.label}
                          <span aria-hidden="true">{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                        </button>
                      </th>
                      {c.key === 'number' && (
                        <th scope="col" className="py-2 pr-3">
                          Question
                        </th>
                      )}
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((q) => (
                  <tr key={q.id} className="border-b border-line align-top">
                    <td className="py-2 pr-3 text-right tabular-nums">{q.number}</td>
                    <td className="py-2 pr-3 text-ink">{truncate(q.stem)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{q.attempts}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {q.correctPct === null ? '-' : `${q.correctPct}%`}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{q.streak}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[q.status]}`}>
                        {q.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {q.avgTimeMs === null ? '-' : formatDuration(q.avgTimeMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="grid gap-3 sm:hidden" aria-label="Per-question history">
            {rows.map((q) => (
              <li key={q.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink">Question {q.number}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[q.status]}`}>{q.status}</span>
                </div>
                <p className="mt-2 break-words text-sm text-ink">{q.stem}</p>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div><dt className="text-xs text-muted">Attempts</dt><dd className="font-semibold text-ink">{q.attempts}</dd></div>
                  <div><dt className="text-xs text-muted">Correct</dt><dd className="font-semibold text-ink">{q.correctPct === null ? '-' : `${q.correctPct}%`}</dd></div>
                  <div><dt className="text-xs text-muted">Correct streak</dt><dd className="font-semibold text-ink">{q.streak}</dd></div>
                  <div><dt className="text-xs text-muted">Average time</dt><dd className="font-semibold text-ink">{q.avgTimeMs === null ? '-' : formatDuration(q.avgTimeMs)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-bg px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-lg font-bold text-ink">{value}</dd>
    </div>
  );
}

const MAX_BARS = 30;

function Timeline({ sessions }: { sessions: SessionStat[] }) {
  if (sessions.length === 0) {
    return <p className="text-sm text-muted">No rounds yet. Start a practice session and your results will appear here.</p>;
  }
  const recent = sessions.slice(-MAX_BARS);
  const summary = recent.map((s) => (s.scorePct === null ? 'no answers' : `${s.scorePct}%`)).join(', ');
  // Few rounds should not become giant bars: cap each slot and left-align.
  const barWidth = Math.min(8, 100 / recent.length);

  return (
    <div className="space-y-3">
      <svg
        role="img"
        aria-label={`Score per round, oldest to newest: ${summary}`}
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="h-24 w-full rounded-lg bg-bg"
      >
        {recent.map((s, i) => {
          const height = ((s.scorePct ?? 0) / 100) * 38;
          return (
            <rect
              key={s.id}
              x={i * barWidth + barWidth * 0.15}
              y={40 - height}
              width={barWidth * 0.7}
              height={height}
              rx={0.5}
              className={KIND_FILL[s.kind]}
            >
              <title>{`${formatDate(s.startedAt)} · ${sessionKindLabel(s.kind)}: ${s.scorePct === null ? 'no answers' : `${s.scorePct}%`}`}</title>
            </rect>
          );
        })}
      </svg>
      <ol className="divide-y divide-line text-sm" aria-label="Rounds, oldest first">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-ink">
              {formatDate(s.startedAt)} · {sessionKindLabel(s.kind)}
            </span>
            <span className="text-muted">
              {s.answered === 0
                ? 'No answers'
                : `${s.correct} of ${s.answered} correct (${s.scorePct}%)`}
              {' · '}
              {s.kind === 'bank' ? 'Mixed round' : s.durationMs === null ? 'In progress' : formatDuration(s.durationMs)}
            </span>
          </li>
        ))}
      </ol>
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        {LEGEND_ORDER.filter((kind) => sessions.some((s) => s.kind === kind)).map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2 w-2 rounded-sm ${KIND_SWATCH[kind]}`} />
            {sessionKindLabel(kind)}
          </span>
        ))}
      </p>
    </div>
  );
}
