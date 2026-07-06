import { render, screen } from '@testing-library/react';
import Input from './Input';

describe('Input', () => {
  it('renders a label linked to the input', () => {
    render(<Input label="Usuario" />);
    expect(screen.getByLabelText('Usuario')).toBeInTheDocument();
  });

  it('shows an error message with role alert', () => {
    render(<Input label="Usuario" error="El usuario es obligatorio" />);
    expect(screen.getByRole('alert')).toHaveTextContent('El usuario es obligatorio');
  });
});
