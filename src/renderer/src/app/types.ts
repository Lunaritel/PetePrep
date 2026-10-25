import type { Repository } from '../storage/contract';

export type Route =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'practice'; examId: string; sessionId?: string }
  | { name: 'master'; examId: string; sessionId?: string }
  /** Only this exam's mistake bank. */
  | { name: 'weak'; examId: string; sessionId?: string }
  /** The mistake bank of every exam, mixed. Also the bank overview screen when no session is running. */
  | { name: 'bank'; sessionId?: string }
  /** examId is BANK_EXAM_ID for mixed-bank sessions. */
  | { name: 'results'; examId: string; sessionId: string }
  | { name: 'stats'; examId: string }
  | { name: 'settings' };

export interface ScreenProps {
  repo: Repository;
  navigate: (route: Route) => void;
}
