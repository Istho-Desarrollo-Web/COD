import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/usuarios');
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/usuarios/${id}`);
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/usuarios', datos);
  return response.data;
}

async function editar(id, datos) {
  const response = await apiClient.put(`/usuarios/${id}`, datos);
  return response.data;
}

async function eliminar(id) {
  const response = await apiClient.delete(`/usuarios/${id}`);
  return response.data;
}

export default { listar, obtener, crear, editar, eliminar };
