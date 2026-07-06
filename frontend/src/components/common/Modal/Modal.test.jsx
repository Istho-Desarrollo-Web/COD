import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import Modal from './Modal';

describe('Modal', () => {
  it('renders nothing when isOpen is false', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Prueba" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and content when open, and closes on the close button', async () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Crear área">
        <p>Contenido</p>
      </Modal>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Crear área')).toBeInTheDocument();
    expect(screen.getByText('Contenido')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Cerrar modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the footer when provided', () => {
    render(
      <Modal isOpen onClose={vi.fn()} title="Prueba" footer={<button>Guardar</button>}>
        <p>Contenido</p>
      </Modal>
    );
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });
});
