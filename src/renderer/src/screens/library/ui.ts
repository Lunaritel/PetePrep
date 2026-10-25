/** Shared Tailwind class strings for the library, stats, settings and onboarding screens. */
const base =
  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50';

export const btnPrimary = `${base} bg-accent text-on-accent hover:bg-accent-strong`;
export const btnSecondary = `${base} border border-line bg-surface text-ink hover:bg-bg`;
/** Low-emphasis action (reset, delete): still a full-size target, but it does not compete with study buttons. */
export const btnQuiet = `${base} text-muted hover:bg-bg hover:text-ink`;
export const btnDanger = `${base} bg-wrong text-on-accent hover:opacity-90`;
export const card = 'rounded-2xl border border-line bg-surface p-5 shadow-sm';
