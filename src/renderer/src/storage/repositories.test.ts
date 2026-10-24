// @vitest-environment node
// Node's Blob and structuredClone are what Chromium's IndexedDB behaves like for screenshots;
// jsdom's Blob cannot be structured-cloned by fake-indexeddb.
import 'fake-indexeddb/auto';
import { createDexieRepository } from './dexieRepository';
import { createMemoryRepository } from './memoryRepository';
import { runRepositoryContract } from './repositoryContract';

runRepositoryContract('in-memory', () => createMemoryRepository());

let dbCounter = 0;
runRepositoryContract('Dexie (IndexedDB)', () => createDexieRepository(`deca-test-${Date.now()}-${dbCounter++}`));
