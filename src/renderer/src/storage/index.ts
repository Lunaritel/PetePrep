import { createDexieRepository } from './dexieRepository';
import type { Repository } from './contract';

export * from './contract';
export { createDexieRepository } from './dexieRepository';
export { createMemoryRepository } from './memoryRepository';

/** The app's real database (IndexedDB, name "deca-mastery"). */
export function openRepository(): Repository {
  return createDexieRepository('deca-mastery');
}
