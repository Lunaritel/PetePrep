import { useId } from 'react';
import type { HelpEntry } from './helpText';

interface Props {
  /** Summary line the user clicks to open or close the panel. */
  title?: string;
  entries: readonly HelpEntry[];
  /** A short rule or note shown under the list. */
  footer?: string;
  open?: boolean;
  /** Called whenever the user opens or closes the panel. */
  onToggle?: (open: boolean) => void;
}

/**
 * A quiet, collapsible "what does each button do?" list. A native <details> keeps it keyboard and
 * screen-reader friendly without any extra state or focus handling.
 */
export function HelpPanel({ title = 'What does each button do?', entries, footer, open, onToggle }: Props) {
  const headingId = useId();
  return (
    <details
      className="group rounded-xl border border-line bg-surface text-sm"
      open={open}
      onToggle={onToggle ? (e) => onToggle((e.currentTarget as HTMLDetailsElement).open) : undefined}
    >
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 font-semibold text-muted hover:text-ink"
        aria-describedby={headingId}
      >
        <span id={headingId}>{title}</span>
        <span aria-hidden="true" className="text-xs transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <dl className="grid gap-x-4 gap-y-3 border-t border-line px-4 py-4 sm:grid-cols-[9rem_1fr]">
        {entries.map((entry) => (
          <div key={entry.label} className="contents">
            <dt className="font-semibold text-ink">{entry.label}</dt>
            <dd className="text-muted">{entry.long}</dd>
          </div>
        ))}
      </dl>
      {footer && <p className="border-t border-line px-4 py-3 text-xs text-muted">{footer}</p>}
    </details>
  );
}
