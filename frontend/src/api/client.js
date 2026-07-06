import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
const TOKEN_KEY = 'cod_token';
const REFRESH_TOKEN_KEY = 'cod_refresh_token';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(token, refreshToken) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshingPromise = null;

apiClient.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const original = error.config;
    const isAuthEndpoint = original?.url?.includes('/auth/login') || original?.url?.includes('/auth/refresh');

    if (error.response?.status === 401 && !original._retry && !isAuthEndpoint) {
      original._retry = true;
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) {
        clearAuthTokens();
        return Promise.reject(error.response?.data || error);
      }

      try {
        refreshingPromise = refreshingPromise || apiClient.post('/auth/refresh', { refreshToken });
        const data = await refreshingPromise;
        refreshingPromise = null;
        setAuthTokens(data.data.token, data.data.refreshToken);
        original.headers.Authorization = `Bearer ${data.data.token}`;
        return apiClient(original);
      } catch (refreshError) {
        refreshingPromise = null;
        clearAuthTokens();
        return Promise.reject(refreshError.response?.data || refreshError);
      }
    }

    return Promise.reject(error.response?.data || error);
  }
);

export default apiClient;
