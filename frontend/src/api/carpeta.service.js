import apiClient from './client';

async function listar(areaId) {
  const response = await apiClient.get('/carpetas', { params: { areaId } });
  return response.data;
}

async function crear({ areaId, nombre, carpetaPadreId }) {
  const response = await apiClient.post('/carpetas', { areaId, nombre, carpetaPadreId: carpetaPadreId ?? null });
  return response.data;
}

export default { listar, crear };
