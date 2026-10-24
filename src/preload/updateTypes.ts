/** Shared by main, preload and renderer (type-only imports). */
export type UpdateState =
  /** Updating is not possible here (running from source, or the portable zip). `reason` is user-facing. */
  | { state: 'unavailable'; reason: string }
  | { state: 'idle' }
  | { state: 'checking' }
  /** Already on the newest version. */
  | { state: 'not-available'; version: string }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };
