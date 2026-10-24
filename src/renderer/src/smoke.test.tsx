import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

describe('renderer test environment', () => {
  it('renders React into jsdom', () => {
    render(<p>hello</p>);
    expect(screen.getByText('hello')).toBeTruthy();
    expect(typeof document).toBe('object');
  });
});
