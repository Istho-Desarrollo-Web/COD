import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import authService from '../api/auth.service';
import { getStoredToken } from '../api/client';

vi.mock('../api/auth.service');
vi.mock('../api/client', async () => {
  const actual = await vi.importActual('../api/client');
  return { ...actual, getStoredToken: vi.fn() };
});

function Consumidor() {
  const { user, isAuthenticated, isLoading, login, logout, tienePermiso, isAdmin } = useAuth();
  if (isLoading) return <p>Cargando...</p>;
  return (
    <div>
      <p>{isAuthenticated ? `autenticado:${user.username}` : 'sin sesión'}</p>
      <p>{isAdmin ? 'es admin' : 'no admin'}</p>
      <p>{tienePermiso('areas', 'ver') ? 'puede ver areas' : 'no puede ver areas'}</p>
      <button onClick={() => login('admin', 'x')}>login</button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoredToken.mockReturnValue(null);
  });

  it('starts unauthenticated when there is no stored token', async () => {
    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
  });

  it('hydrates the user from /me when a token is already stored', async () => {
    getStoredToken.mockReturnValue('tok-existente');
    authService.obtenerUsuarioActual.mockResolvedValue({ username: 'admin', rol: 'admin', permisos: {} });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('autenticado:admin')).toBeInTheDocument());
  });

  it('clears the session when hydration fails', async () => {
    getStoredToken.mockReturnValue('tok-invalido');
    authService.obtenerUsuarioActual.mockRejectedValue(new Error('401'));

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );

    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('login updates the context and tienePermiso resolves from the returned permisos', async () => {
    authService.login.mockResolvedValue({ username: 'lider', rol: 'lider_area', permisos: { areas: ['ver'] } });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());

    await userEvent.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByText('autenticado:lider')).toBeInTheDocument());
    expect(screen.getByText('no admin')).toBeInTheDocument();
    expect(screen.getByText('puede ver areas')).toBeInTheDocument();
  });

  it('admin always resolves tienePermiso to true, regardless of the permisos map', async () => {
    authService.login.mockResolvedValue({ username: 'admin', rol: 'admin', permisos: {} });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
    await userEvent.click(screen.getByText('login'));

    await waitFor(() => expect(screen.getByText('es admin')).toBeInTheDocument());
    expect(screen.getByText('puede ver areas')).toBeInTheDocument();
  });

  it('logout clears the user from context', async () => {
    authService.login.mockResolvedValue({ username: 'admin', rol: 'admin', permisos: {} });

    render(
      <AuthProvider>
        <Consumidor />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
    await userEvent.click(screen.getByText('login'));
    await waitFor(() => expect(screen.getByText('autenticado:admin')).toBeInTheDocument());

    await userEvent.click(screen.getByText('logout'));
    await waitFor(() => expect(screen.getByText('sin sesión')).toBeInTheDocument());
  });
});
