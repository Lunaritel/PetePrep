import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Onboarding, hasSeenOnboarding, markOnboardingSeen } from './Onboarding';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Onboarding', () => {
  it('walks three cards with Next and Back, then finishes with Get started', async () => {
    const onDone = vi.fn();
    render(<Onboarding onDone={onDone} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Practice until every question sticks');
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Bring your own exam PDF');
    expect(screen.getByText(/answer key with explanations/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Private by design');
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Get started' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenOnboarding()).toBe(true);
  });

  it('Skip finishes immediately and remembers it', async () => {
    const onDone = vi.fn();
    render(<Onboarding onDone={onDone} />);
    expect(hasSeenOnboarding()).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(hasSeenOnboarding()).toBe(true);
  });

  it('survives unavailable storage', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(hasSeenOnboarding()).toBe(false);
    expect(() => markOnboardingSeen()).not.toThrow();
    const onDone = vi.fn();
    render(<Onboarding onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('uses the documented storage key', () => {
    markOnboardingSeen();
    expect(window.localStorage.getItem('deca.onboarded')).toBe('1');
  });
});
