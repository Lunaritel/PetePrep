import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { UpdateState } from '../preload/updateTypes';
import {
  GENERIC_ERROR_MESSAGE,
  NO_RELEASE_MESSAGE,
  NOT_INSTALLED_REASON,
  OFFLINE_MESSAGE,
  PORTABLE_REASON,
  UpdateService,
  friendlyUpdateError,
} from './updateService';
import type { AutoUpdaterLike } from './updateService';

class FakeUpdater extends EventEmitter implements AutoUpdaterLike {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  allowPrerelease = true;
  logger: unknown = null;
  checkForUpdates = vi.fn(async (): Promise<unknown> => undefined);
  downloadUpdate = vi.fn(async (): Promise<unknown> => undefined);
  quitAndInstall = vi.fn();
}

function setup(unavailableReason: string | null = null) {
  const updater = new FakeUpdater();
  const states: UpdateState[] = [];
  const service = new UpdateService({
    updater,
    currentVersion: '0.1.0',
    unavailableReason,
    onState: (s) => states.push(s),
    logger: { warn: vi.fn() },
  });
  return { updater, states, service };
}

describe('UpdateService', () => {
  it('turns off every automatic behaviour', () => {
    const { updater } = setup();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowPrerelease).toBe(false);
  });

  it('starts idle and makes no network call until asked', () => {
    const { updater, service } = setup();
    expect(service.getState()).toEqual({ state: 'idle' });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('walks check -> available -> downloading -> downloaded and reports each step', async () => {
    const { updater, states, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('checking-for-update');
      updater.emit('update-available', { version: '0.2.0' });
    });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit('download-progress', { percent: 42.4 });
      updater.emit('download-progress', { percent: 100 });
      updater.emit('update-downloaded', { version: '0.2.0' });
    });

    expect(await service.check()).toEqual({ state: 'available', version: '0.2.0' });
    expect(await service.download()).toEqual({ state: 'downloaded', version: '0.2.0' });
    expect(states.map((s) => s.state)).toEqual(['checking', 'checking', 'available', 'downloading', 'downloading', 'downloading', 'downloaded']);
    expect(states.filter((s) => s.state === 'downloading')).toContainEqual({ state: 'downloading', percent: 42 });
  });

  it('reports up to date with the running version', async () => {
    const { updater, service } = setup();
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-not-available', { version: '0.1.0' });
    });
    expect(await service.check()).toEqual({ state: 'not-available', version: '0.1.0' });
  });

  it('never leaves the UI checking when the feed resolves without an event', async () => {
    const { service } = setup();
    expect(await service.check()).toEqual({ state: 'not-available', version: '0.1.0' });
  });

  it('only downloads after an update was found', async () => {
    const { updater, service } = setup();
    expect(await service.download()).toEqual({ state: 'idle' });
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
  });

  it('only installs once the download finished', async () => {
    const { updater, service } = setup();
    service.install();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updater.emit('update-downloaded', { version: '0.2.0' });
    service.install();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(true, true);
  });

  it('ignores a second check while one is running or a download is under way', async () => {
    const { updater, service } = setup();
    let release: () => void = () => undefined;
    updater.checkForUpdates.mockImplementation(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const first = service.check();
    await service.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('is unavailable (and never touches the network) when running from source', async () => {
    const { updater, service, states } = setup(NOT_INSTALLED_REASON);
    expect(service.getState()).toEqual({ state: 'unavailable', reason: NOT_INSTALLED_REASON });
    expect(await service.check()).toEqual({ state: 'unavailable', reason: NOT_INSTALLED_REASON });
    expect(await service.download()).toEqual({ state: 'unavailable', reason: NOT_INSTALLED_REASON });
    service.install();
    updater.emit('update-available', { version: '9.9.9' });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    expect(states).toEqual([]);
  });

  it('explains that a portable copy cannot update itself', () => {
    const { service } = setup(PORTABLE_REASON);
    expect(service.getState()).toEqual({ state: 'unavailable', reason: PORTABLE_REASON });
    expect(PORTABLE_REASON).toMatch(/portable/i);
  });

  it('maps a failed check to a friendly error and lets the user retry', async () => {
    const { updater, service } = setup();
    updater.checkForUpdates.mockRejectedValueOnce(Object.assign(new Error('getaddrinfo ENOTFOUND github.com'), { code: 'ENOTFOUND' }));
    expect(await service.check()).toEqual({ state: 'error', message: OFFLINE_MESSAGE });
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit('update-not-available', { version: '0.1.0' });
    });
    expect(await service.check()).toEqual({ state: 'not-available', version: '0.1.0' });
  });

  it('ends a check that never answers with the unreachable message, and allows a retry', async () => {
    vi.useFakeTimers();
    try {
      const { updater, service } = setup();
      updater.checkForUpdates.mockImplementationOnce(() => new Promise(() => undefined));
      const pending = service.check();
      await vi.advanceTimersByTimeAsync(29_999);
      expect(service.getState()).toEqual({ state: 'checking' });
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual({ state: 'error', message: OFFLINE_MESSAGE });

      updater.checkForUpdates.mockImplementation(async () => {
        updater.emit('update-not-available', { version: '0.1.0' });
      });
      expect(await service.check()).toEqual({ state: 'not-available', version: '0.1.0' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a slow check that fails after the timeout crash the process', async () => {
    vi.useFakeTimers();
    try {
      const { updater, service } = setup();
      let fail: (e: Error) => void = () => undefined;
      updater.checkForUpdates.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
      const pending = service.check();
      await vi.advanceTimersByTimeAsync(30_000);
      await pending;
      fail(new Error('late failure'));
      await vi.advanceTimersByTimeAsync(10);
      expect(service.getState().state).toBe('error');
    } finally {
      vi.useRealTimers();
    }
  });

  it('maps an error event during a download to a friendly error', async () => {
    const { updater, service } = setup();
    updater.emit('update-available', { version: '0.2.0' });
    updater.downloadUpdate.mockImplementation(async () => {
      updater.emit('error', new Error('net::ERR_INTERNET_DISCONNECTED'));
    });
    expect(await service.download()).toEqual({ state: 'error', message: OFFLINE_MESSAGE });
  });

  it('clamps nonsense progress values', () => {
    const { updater, service } = setup();
    updater.emit('download-progress', { percent: 250 });
    expect(service.getState()).toEqual({ state: 'downloading', percent: 100 });
    updater.emit('download-progress', { percent: -5 });
    expect(service.getState()).toEqual({ state: 'downloading', percent: 0 });
    updater.emit('download-progress', {});
    expect(service.getState()).toEqual({ state: 'downloading', percent: 0 });
  });
});

describe('friendlyUpdateError', () => {
  it('recognises offline failures', () => {
    for (const text of ['getaddrinfo ENOTFOUND github.com', 'connect ECONNREFUSED 127.0.0.1:80', 'net::ERR_NAME_NOT_RESOLVED', 'ETIMEDOUT']) {
      expect(friendlyUpdateError(new Error(text))).toBe(OFFLINE_MESSAGE);
    }
  });

  it('recognises a missing release feed', () => {
    expect(friendlyUpdateError(new Error('Cannot find latest.yml in the latest release artifacts'))).toBe(NO_RELEASE_MESSAGE);
    expect(friendlyUpdateError(new Error('HttpError: 404 Not Found'))).toBe(NO_RELEASE_MESSAGE);
  });

  it('never leaks raw error text for anything else', () => {
    const message = friendlyUpdateError(new Error('sha512 checksum mismatch in C:\\Users\\someone\\secret path'));
    expect(message).toBe(GENERIC_ERROR_MESSAGE);
    expect(message).not.toMatch(/sha512|Users/);
    expect(friendlyUpdateError('weird')).toBe(GENERIC_ERROR_MESSAGE);
  });
});
