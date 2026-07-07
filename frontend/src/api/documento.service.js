import apiClient from './client';

const EXTENSION_POR_MIMETYPE = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function obtenerExtension(mimetype) {
  return EXTENSION_POR_MIMETYPE[mimetype];
}

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
    // Content-Type: undefined evita que axios serialice el FormData como JSON
    // (apiClient fija 'application/json' por defecto en client.js); así el
    // navegador genera el boundary multipart/form-data correcto.
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
    // Content-Type: undefined evita que axios serialice el FormData como JSON
    // (apiClient fija 'application/json' por defecto en client.js); así el
    // navegador genera el boundary multipart/form-data correcto.
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

function descargarBlob(blob, nombreBase) {
  const extension = obtenerExtension(blob.type);
  const nombreArchivo = extension ? `${nombreBase}.${extension}` : nombreBase;
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
