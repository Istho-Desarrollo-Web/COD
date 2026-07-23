import apiClient from './client';

async function listar(proveedorId) {
  const response = await apiClient.get(`/proveedores/${proveedorId}/evaluaciones`);
  return response.data;
}

async function listarTodas(filtros = {}) {
  const response = await apiClient.get('/proveedores/evaluaciones', { params: filtros });
  return response.data;
}

async function crear(proveedorId, datos) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/evaluaciones`, datos);
  return response.data;
}

async function iniciar(proveedorId, evaluacionId) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/evaluaciones/${evaluacionId}/iniciar`);
  return response.data;
}

async function completar(proveedorId, evaluacionId, datos) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/evaluaciones/${evaluacionId}/completar`, datos);
  return response.data;
}

export default { listar, listarTodas, crear, iniciar, completar };
