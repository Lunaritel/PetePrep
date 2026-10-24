import type { Repository } from '../storage/contract';

export type Route =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'practice'; examId: string; sessionId?: string }
  | { name: 'master'; examId: string; sessionId?: string }
  | { name: 'results'; examId: string; sessionId: string }
  | { name: 'stats'; examId: string }
  | { name: 'settings' };

export interface ScreenProps {
  repo: Repository;
  navigate: (route: Route) => void;
}
