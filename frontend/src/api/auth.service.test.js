import MockAdapter from 'axios-mock-adapter';
import apiClient, { getStoredToken, getStoredRefreshToken } from './client';
import authService from './auth.service';

describe('auth.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    localStorage.clear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('login stores both tokens and returns the user with its permisos', async () => {
    mock.onPost('/auth/login').reply(200, {
      success: true,
      data: {
        token: 'tok',
        refreshToken: 'reftok',
        usuario: { id: 1, username: 'admin', nombre: 'Administrador', roles: [{ id: 1, nombre: 'super_administrador', nivel: 100 }] },
        permisos: { areas: ['ver', 'crear'] },
      },
    });

    const user = await authService.login('admin', 'CambiarAhora123!');

    expect(user.roles).toEqual([{ id: 1, nombre: 'super_administrador', nivel: 100 }]);
    expect(user.permisos.areas).toContain('crear');
    expect(getStoredToken()).toBe('tok');
    expect(getStoredRefreshToken()).toBe('reftok');
    expect(authService.obtenerUsuarioGuardado().username).toBe('admin');
  });

  it('logout clears tokens and the stored user', () => {
    localStorage.setItem('cod_token', 'x');
    localStorage.setItem('cod_user', JSON.stringify({ username: 'admin' }));

    authService.logout();

    expect(getStoredToken()).toBeNull();
    expect(authService.obtenerUsuarioGuardado()).toBeNull();
  });

  it('obtenerUsuarioActual fetches /auth/me and updates the stored user', async () => {
    mock.onGet('/auth/me').reply(200, {
      success: true,
      data: { id: 1, username: 'admin', roles: [{ id: 1, nombre: 'super_administrador', nivel: 100 }], permisos: { areas: ['ver'] } },
    });

    const user = await authService.obtenerUsuarioActual();

    expect(user.username).toBe('admin');
    expect(authService.obtenerUsuarioGuardado().username).toBe('admin');
  });

  it('obtenerUsuarioGuardado returns null when nothing is stored', () => {
    expect(authService.obtenerUsuarioGuardado()).toBeNull();
  });
});
