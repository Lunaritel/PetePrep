import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_CHECK_DELAY_MS, useAutoUpdateCheck } from './useAutoUpdateCheck';
import { setAutoUpdateEnabled } from './updatePrefs';

function installBridge() {
  const bridge = {
    checkForUpdates: vi.fn(async () => ({ state: 'checking' })),
    downloadUpdate: vi.fn(),
    installUpdate: vi.fn(),
  };
  (window as unknown as { deca: unknown }).deca = bridge;
  return bridge;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (window as unknown as { deca?: unknown }).deca;
});

describe('useAutoUpdateCheck', () => {
  it('does nothing when the preference is off (the default)', () => {
    const bridge = installBridge();
    renderHook(() => useAutoUpdateCheck());
    vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 5);
    expect(bridge.checkForUpdates).not.toHaveBeenCalled();
  });

  it('checks exactly once, after the startup delay, when the user opted in', () => {
    setAutoUpdateEnabled(true);
    const bridge = installBridge();
    renderHook(() => useAutoUpdateCheck());
    vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS - 1);
    expect(bridge.checkForUpdates).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(bridge.checkForUpdates).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 10);
    expect(bridge.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('never downloads or installs by itself', () => {
    setAutoUpdateEnabled(true);
    const bridge = installBridge();
    renderHook(() => useAutoUpdateCheck());
    vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 3);
    expect(bridge.downloadUpdate).not.toHaveBeenCalled();
    expect(bridge.installUpdate).not.toHaveBeenCalled();
  });

  it('does nothing outside Electron', () => {
    setAutoUpdateEnabled(true);
    expect(() => {
      renderHook(() => useAutoUpdateCheck());
      vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 2);
    }).not.toThrow();
  });

  it('cancels the pending check if the app unmounts first', () => {
    setAutoUpdateEnabled(true);
    const bridge = installBridge();
    const view = renderHook(() => useAutoUpdateCheck());
    view.unmount();
    vi.advanceTimersByTime(AUTO_CHECK_DELAY_MS * 2);
    expect(bridge.checkForUpdates).not.toHaveBeenCalled();
  });

  it('survives a failing check without an unhandled rejection', async () => {
    setAutoUpdateEnabled(true);
    const bridge = installBridge();
    bridge.checkForUpdates.mockRejectedValue(new Error('offline'));
    renderHook(() => useAutoUpdateCheck());
    await vi.advanceTimersByTimeAsync(AUTO_CHECK_DELAY_MS);
    expect(bridge.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});
