import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/areas');
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/areas', datos);
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/areas/${id}`);
  return response.data;
}

export default { listar, crear, obtener };
