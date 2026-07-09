import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/proveedores', { params: filtros });
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/proveedores/${id}`);
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/proveedores', datos);
  return response.data;
}

async function editar(id, cambios) {
  const response = await apiClient.put(`/proveedores/${id}`, cambios);
  return response.data;
}

async function eliminar(id) {
  const response = await apiClient.delete(`/proveedores/${id}`);
  return response.data;
}

export default { listar, obtener, crear, editar, eliminar };
