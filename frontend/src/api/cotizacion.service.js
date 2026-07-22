import apiClient from './client';

async function listar(solicitudId) {
  const response = await apiClient.get(`/solicitudes/${solicitudId}/cotizaciones`);
  return response.data;
}

async function crear(solicitudId, formData) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/cotizaciones`, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function seleccionar(solicitudId, cotizacionId) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/cotizaciones/${cotizacionId}/seleccionar`);
  return response.data;
}

export default { listar, crear, seleccionar };
