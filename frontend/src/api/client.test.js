import MockAdapter from 'axios-mock-adapter';
import apiClient, { setAuthTokens, getStoredToken } from './client';

describe('client.js', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
    localStorage.clear();
  });

  afterEach(() => {
    mock.restore();
  });

  it('injects the Bearer token from localStorage into requests', async () => {
    setAuthTokens('token-123', 'refresh-123');
    mock.onGet('/areas').reply((config) => {
      expect(config.headers.Authorization).toBe('Bearer token-123');
      return [200, { success: true, data: [] }];
    });

    await apiClient.get('/areas');
  });

  it('resolves to the backend body directly, not the axios envelope', async () => {
    mock.onGet('/areas').reply(200, { success: true, data: [{ id: 1 }], message: null, errors: [], code: null });
    const response = await apiClient.get('/areas');
    expect(response).toEqual({ success: true, data: [{ id: 1 }], message: null, errors: [], code: null });
  });

  it('retries once via /auth/refresh on a 401, then succeeds with the new token', async () => {
    setAuthTokens('token-vencido', 'refresh-valido');
    mock.onGet('/areas').replyOnce(401, { success: false, message: 'Token inválido' });
    mock.onPost('/auth/refresh').reply(200, {
      success: true,
      data: { token: 'token-nuevo', refreshToken: 'refresh-nuevo' },
    });
    mock.onGet('/areas').reply(200, { success: true, data: [{ id: 1 }] });

    const response = await apiClient.get('/areas');

    expect(response.data).toEqual([{ id: 1 }]);
    expect(getStoredToken()).toBe('token-nuevo');
  });

  it('clears tokens and rejects when the refresh itself fails', async () => {
    setAuthTokens('token-vencido', 'refresh-invalido');
    mock.onGet('/areas').reply(401, { success: false, message: 'Token inválido' });
    mock.onPost('/auth/refresh').reply(401, { success: false, message: 'Refresh inválido' });

    await expect(apiClient.get('/areas')).rejects.toBeTruthy();
    expect(getStoredToken()).toBeNull();
  });

  it('does not attempt a refresh for a 401 from the login endpoint itself', async () => {
    mock.onPost('/auth/login').reply(401, { success: false, message: 'Usuario o contraseña incorrectos' });

    await expect(apiClient.post('/auth/login', { username: 'x', password: 'y' })).rejects.toEqual({
      success: false,
      message: 'Usuario o contraseña incorrectos',
    });
    expect(mock.history.post.filter((r) => r.url === '/auth/refresh')).toHaveLength(0);
  });
});
