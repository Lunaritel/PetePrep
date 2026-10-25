import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChooseStep } from './ChooseStep';
import { platform } from '../../platform';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ChooseStep on phones', () => {
  it('rejects PDFs larger than 25 MB before reading them', async () => {
    const onFile = vi.fn();
    render(<ChooseStep error={null} canUseNativePicker={false} onNativePick={vi.fn()} onFile={onFile} />);
    const file = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByTestId('pdf-input'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than 25 MB/);
    expect(onFile).not.toHaveBeenCalled();
  });

  it('requests persistent browser storage when a valid PDF is selected', async () => {
    const requestPersistence = vi.spyOn(platform, 'requestPersistentStorage').mockResolvedValue(true);
    const onFile = vi.fn();
    render(<ChooseStep error={null} canUseNativePicker={false} onNativePick={vi.fn()} onFile={onFile} />);
    const file = new File(['%PDF-1.4 invented test file'], 'practice.pdf', { type: 'application/pdf' });

    await userEvent.upload(screen.getByTestId('pdf-input'), file);

    expect(requestPersistence).toHaveBeenCalledOnce();
    expect(onFile).toHaveBeenCalledOnce();
  });
});
