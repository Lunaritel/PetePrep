const KEY = 'deca.helpSeen';

/** Whether the library has already shown the help panel open once. Safe when storage is blocked. */
export function hasSeenHelp(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markHelpSeen(): void {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    // Storage can be blocked; the panel just stays collapsed by default next time.
  }
}
