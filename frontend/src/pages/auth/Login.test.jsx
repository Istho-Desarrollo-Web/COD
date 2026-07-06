import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { vi } from 'vitest';
import Login from './Login';
import { useAuth } from '../../context/AuthContext';

vi.mock('../../context/AuthContext');

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/inicio" element={<p>Panel de inicio</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('Login', () => {
  it('shows validation errors when submitted empty', async () => {
    useAuth.mockReturnValue({ login: vi.fn() });
    renderLogin();
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('El usuario es obligatorio')).toBeInTheDocument();
    expect(screen.getByText('La contraseña es obligatoria')).toBeInTheDocument();
  });

  it('navigates to /inicio after a successful login', async () => {
    const login = vi.fn().mockResolvedValue({ username: 'admin' });
    useAuth.mockReturnValue({ login });
    renderLogin();

    await userEvent.type(screen.getByLabelText('Usuario'), 'admin');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'CambiarAhora123!');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    await waitFor(() => expect(screen.getByText('Panel de inicio')).toBeInTheDocument());
    expect(login).toHaveBeenCalledWith('admin', 'CambiarAhora123!');
  });

  it('shows the API error message on failed login', async () => {
    const login = vi.fn().mockRejectedValue({ message: 'Usuario o contraseña incorrectos' });
    useAuth.mockReturnValue({ login });
    renderLogin();

    await userEvent.type(screen.getByLabelText('Usuario'), 'admin');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));

    expect(await screen.findByText('Usuario o contraseña incorrectos')).toBeInTheDocument();
  });
});
