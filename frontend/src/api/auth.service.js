import apiClient, { setAuthTokens, clearAuthTokens } from './client';

const USER_KEY = 'cod_user';

async function login(username, password) {
  const response = await apiClient.post('/auth/login', { username, password });
  const { token, refreshToken, usuario, permisos } = response.data;
  setAuthTokens(token, refreshToken);
  const user = { ...usuario, permisos };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

function logout() {
  clearAuthTokens();
  localStorage.removeItem(USER_KEY);
}

async function obtenerUsuarioActual() {
  const response = await apiClient.get('/auth/me');
  localStorage.setItem(USER_KEY, JSON.stringify(response.data));
  return response.data;
}

function obtenerUsuarioGuardado() {
  const stored = localStorage.getItem(USER_KEY);
  return stored ? JSON.parse(stored) : null;
}

export default { login, logout, obtenerUsuarioActual, obtenerUsuarioGuardado };
