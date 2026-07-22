import apiClient from './client';

async function listar(solicitudId) {
  const response = await apiClient.get(`/solicitudes/${solicitudId}/comentarios`);
  return response.data;
}

async function crear(solicitudId, texto) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/comentarios`, { texto });
  return response.data;
}

export default { listar, crear };
