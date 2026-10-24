import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateState } from '../../../../preload/updateTypes';
import { UpdateCard } from './UpdateCard';

type Listener = (state: UpdateState) => void;

function installBridge(initial: UpdateState = { state: 'idle' }) {
  let listener: Listener | null = null;
  const bridge = {
    version: '0.1.0',
    getUpdateState: vi.fn(async () => initial),
    checkForUpdates: vi.fn(async (): Promise<UpdateState> => ({ state: 'checking' })),
    downloadUpdate: vi.fn(async (): Promise<UpdateState> => ({ state: 'downloading', percent: 0 })),
    installUpdate: vi.fn(async () => undefined),
    onUpdateState: vi.fn((cb: Listener) => {
      listener = cb;
      return () => {
        listener = null;
      };
    }),
  };
  (window as unknown as { deca: unknown }).deca = bridge;
  return { bridge, push: (s: UpdateState) => act(() => listener?.(s)), subscribed: () => listener !== null };
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  delete (window as unknown as { deca?: unknown }).deca;
});

describe('UpdateCard', () => {
  it('starts idle, offline, with automatic checks off', async () => {
    const { bridge } = installBridge();
    render(<UpdateCard />);
    expect(await screen.findByText(/only looks for updates when you ask/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /check for updates automatically/i })).not.toBeChecked();
    expect(bridge.checkForUpdates).not.toHaveBeenCalled();
    expect(screen.getByText(/version 0\.1\.0/)).toBeInTheDocument();
  });

  it('checks on demand and shows each state it is pushed', async () => {
    const user = userEvent.setup();
    const { bridge, push } = installBridge();
    render(<UpdateCard />);
    await user.click(await screen.findByRole('button', { name: 'Check for updates' }));
    expect(bridge.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Checking for updates');
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();

    push({ state: 'not-available', version: '0.1.0' });
    expect(screen.getByRole('status')).toHaveTextContent('You are up to date (version 0.1.0).');
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  });

  it('offers the download when a version is available, then shows progress', async () => {
    const user = userEvent.setup();
    const { bridge, push } = installBridge();
    render(<UpdateCard />);
    await screen.findByRole('button', { name: 'Check for updates' });
    push({ state: 'available', version: '0.2.0' });
    expect(screen.getByRole('status')).toHaveTextContent('Version 0.2.0 is available.');
    await user.click(screen.getByRole('button', { name: 'Download version 0.2.0' }));
    expect(bridge.downloadUpdate).toHaveBeenCalledTimes(1);

    push({ state: 'downloading', percent: 37 });
    expect(screen.getByRole('status')).toHaveTextContent('Downloading the update… 37%');
    expect(screen.getByRole('progressbar', { name: 'Update download' })).toHaveAttribute('aria-valuenow', '37');
    expect(screen.queryByRole('button', { name: /Download version/ })).not.toBeInTheDocument();
  });

  it('only installs after the download finished', async () => {
    const user = userEvent.setup();
    const { bridge, push } = installBridge();
    render(<UpdateCard />);
    await screen.findByRole('button', { name: 'Check for updates' });
    expect(screen.queryByRole('button', { name: 'Restart and install' })).not.toBeInTheDocument();
    push({ state: 'downloaded', version: '0.2.0' });
    expect(screen.getByRole('status')).toHaveTextContent('Version 0.2.0 is ready');
    await user.click(screen.getByRole('button', { name: 'Restart and install' }));
    expect(bridge.installUpdate).toHaveBeenCalledTimes(1);
  });

  it('shows an error in the live region and lets the user try again', async () => {
    const { push } = installBridge();
    render(<UpdateCard />);
    await screen.findByRole('button', { name: 'Check for updates' });
    push({ state: 'error', message: 'Could not reach the update server. Check your internet connection.' });
    expect(screen.getByRole('status')).toHaveTextContent('Could not reach the update server');
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeEnabled();
  });

  it('disables everything and explains why when updating is unavailable', async () => {
    installBridge({ state: 'unavailable', reason: 'This portable copy cannot update itself. Download the newest version from the releases page.' });
    render(<UpdateCard />);
    expect(await screen.findByText(/portable copy cannot update itself/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /check for updates automatically/i })).toBeDisabled();
  });

  it('treats a missing bridge (plain browser, tests) as unavailable', () => {
    render(<UpdateCard />);
    expect(screen.getByRole('status')).toHaveTextContent('Updates only work in the installed app.');
    expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
    expect(screen.getByText(/version dev/)).toBeInTheDocument();
  });

  it('remembers the automatic-check choice and defaults to off', async () => {
    const user = userEvent.setup();
    installBridge();
    const first = render(<UpdateCard />);
    const toggle = await screen.findByRole('switch', { name: /check for updates automatically/i });
    expect(localStorage.getItem('deca.autoUpdate')).toBeNull();
    await user.click(toggle);
    expect(toggle).toBeChecked();
    expect(localStorage.getItem('deca.autoUpdate')).toBe('1');
    first.unmount();
    render(<UpdateCard />);
    expect(await screen.findByRole('switch', { name: /check for updates automatically/i })).toBeChecked();
  });

  it('unsubscribes from update events when it unmounts', async () => {
    const { bridge, subscribed } = installBridge();
    const view = render(<UpdateCard />);
    await screen.findByRole('button', { name: 'Check for updates' });
    expect(bridge.onUpdateState).toHaveBeenCalledTimes(1);
    expect(subscribed()).toBe(true);
    view.unmount();
    expect(subscribed()).toBe(false);
  });

  it('states plainly that updates are the only internet use', async () => {
    installBridge();
    render(<UpdateCard />);
    expect(await screen.findByText(/only time DECAPete uses the internet/i)).toBeInTheDocument();
  });
});
