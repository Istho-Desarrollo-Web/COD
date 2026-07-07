import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/documentos', { params: filtros });
  return { data: response.data, pagination: response.pagination };
}

async function obtener(id) {
  const response = await apiClient.get(`/documentos/${id}`);
  return response.data;
}

async function crear(formData) {
  const response = await apiClient.post('/documentos', formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function editar(id, cambios) {
  const response = await apiClient.put(`/documentos/${id}`, cambios);
  return response.data;
}

async function eliminar(id) {
  const response = await apiClient.delete(`/documentos/${id}`);
  return response.data;
}

async function listarVersiones(id) {
  const response = await apiClient.get(`/documentos/${id}/versiones`);
  return response.data;
}

async function subirVersion(id, formData) {
  const response = await apiClient.post(`/documentos/${id}/versiones`, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreArchivo;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

async function descargar(id) {
  const blob = await apiClient.get(`/documentos/${id}/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `documento-${id}`);
}

async function descargarVersion(id, versionId) {
  const blob = await apiClient.get(`/documentos/${id}/versiones/${versionId}/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `documento-${id}-version-${versionId}`);
}

export default { listar, obtener, crear, editar, eliminar, listarVersiones, subirVersion, descargar, descargarVersion };
