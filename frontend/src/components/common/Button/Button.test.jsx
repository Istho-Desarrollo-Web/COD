import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Button from './Button';

describe('Button', () => {
  it('renders children and responds to clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the button and shows a loading label when loading', () => {
    render(<Button loading>Guardar</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });
});
