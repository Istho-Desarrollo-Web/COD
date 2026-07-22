import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/solicitudes', { params: filtros });
  return response.data;
}

async function listarTipos() {
  const response = await apiClient.get('/solicitudes/tipos');
  return response.data;
}

async function obtener(id) {
  const response = await apiClient.get(`/solicitudes/${id}`);
  return response.data;
}

async function crear(datos) {
  const response = await apiClient.post('/solicitudes', datos);
  return response.data;
}

async function enviarAprobacion(id) {
  const response = await apiClient.post(`/solicitudes/${id}/enviar-aprobacion`);
  return response.data;
}

async function aprobar(id) {
  const response = await apiClient.post(`/solicitudes/${id}/aprobar`);
  return response.data;
}

async function rechazar(id, motivo) {
  const response = await apiClient.post(`/solicitudes/${id}/rechazar`, { motivo });
  return response.data;
}

async function confirmar(id, formData) {
  const response = await apiClient.post(`/solicitudes/${id}/confirmar`, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function cancelar(id) {
  const response = await apiClient.post(`/solicitudes/${id}/cancelar`);
  return response.data;
}

export default { listar, listarTipos, obtener, crear, enviarAprobacion, aprobar, rechazar, confirmar, cancelar };
