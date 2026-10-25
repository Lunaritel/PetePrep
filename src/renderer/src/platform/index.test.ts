import { afterEach, describe, expect, it, vi } from 'vitest';
import { platform } from './index';

const originalStorage = Object.getOwnPropertyDescriptor(navigator, 'storage');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalStorage) Object.defineProperty(navigator, 'storage', originalStorage);
  else Reflect.deleteProperty(navigator, 'storage');
});

describe('platform.requestPersistentStorage', () => {
  it('requests persistence when browser storage is not already persistent', async () => {
    const persisted = vi.fn().mockResolvedValue(false);
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('__WEB_BUILD__', true);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted, persist } });

    await expect(platform.requestPersistentStorage()).resolves.toBe(true);
    expect(persisted).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('does not request again when storage is already persistent', async () => {
    const persisted = vi.fn().mockResolvedValue(true);
    const persist = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('__WEB_BUILD__', true);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted, persist } });

    await expect(platform.requestPersistentStorage()).resolves.toBe(true);
    expect(persist).not.toHaveBeenCalled();
  });

  it('fails softly if the browser denies or cannot provide persistence', async () => {
    const persisted = vi.fn().mockRejectedValue(new Error('not available'));
    const persist = vi.fn();
    vi.stubGlobal('__WEB_BUILD__', true);
    Object.defineProperty(navigator, 'storage', { configurable: true, value: { persisted, persist } });

    await expect(platform.requestPersistentStorage()).resolves.toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('platform.pickPdf', () => {
  it('uses the native PDF picker when the desktop bridge is available', async () => {
    const picked = { name: 'exam.pdf', data: new Uint8Array([1, 2, 3]) };
    const openPdf = vi.fn().mockResolvedValue(picked);
    window.deca = { ...({} as NonNullable<typeof window.deca>), openPdf };

    await expect(platform.pickPdf()).resolves.toEqual(picked);
    expect(openPdf).toHaveBeenCalledOnce();
    window.deca = undefined;
  });

  it('returns null when the desktop bridge is unavailable', async () => {
    window.deca = undefined;
    await expect(platform.pickPdf()).resolves.toBeNull();
  });
});
