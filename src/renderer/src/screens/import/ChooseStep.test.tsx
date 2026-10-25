import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChooseStep } from './ChooseStep';

describe('ChooseStep on phones', () => {
  it('rejects PDFs larger than 25 MB before reading them', async () => {
    const onFile = vi.fn();
    render(<ChooseStep error={null} canUseNativePicker={false} onNativePick={vi.fn()} onFile={onFile} />);
    const file = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' });
    await userEvent.upload(screen.getByTestId('pdf-input'), file);
    expect(await screen.findByRole('alert')).toHaveTextContent(/larger than 25 MB/);
    expect(onFile).not.toHaveBeenCalled();
  });
});
