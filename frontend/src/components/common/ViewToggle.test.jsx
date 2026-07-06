import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import ViewToggle from './ViewToggle';

describe('ViewToggle', () => {
  it('calls onChange with the clicked mode', async () => {
    const onChange = vi.fn();
    render(<ViewToggle modo="lista" onChange={onChange} />);
    await userEvent.click(screen.getByLabelText('Ver como tarjetas'));
    expect(onChange).toHaveBeenCalledWith('tarjetas');
  });

  it('marks the active mode as pressed', () => {
    render(<ViewToggle modo="tarjetas" onChange={vi.fn()} />);
    expect(screen.getByLabelText('Ver como tarjetas')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Ver como lista')).toHaveAttribute('aria-pressed', 'false');
  });
});
