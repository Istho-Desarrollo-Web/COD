import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/areas');
  return response.data;
}

async function crear({ nombre, codigo }) {
  const response = await apiClient.post('/areas', { nombre, codigo });
  return response.data;
}

export default { listar, crear };
