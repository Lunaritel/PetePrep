import { useEffect } from 'react';
import { isAutoUpdateEnabled } from './updatePrefs';

export const AUTO_CHECK_DELAY_MS = 10_000;

/**
 * If the user opted in, asks for updates once, shortly after startup so it never competes with first paint.
 * It only ever checks: downloading and installing stay manual.
 */
export function useAutoUpdateCheck(): void {
  useEffect(() => {
    const deca = window.deca;
    if (!deca || !isAutoUpdateEnabled()) return;
    const timer = setTimeout(() => {
      void deca.checkForUpdates().catch(() => undefined);
    }, AUTO_CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
}
