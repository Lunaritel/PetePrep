const KEY = 'deca.autoUpdate';

/** Whether the app may check for updates by itself at startup. Off unless the user turned it on. */
export function isAutoUpdateEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setAutoUpdateEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? '1' : '0');
  } catch {
    // Storage can be blocked; the choice then lasts only for this session.
  }
}
