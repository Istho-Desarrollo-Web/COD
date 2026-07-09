import apiClient from './client';

async function listar(proveedorId) {
  const response = await apiClient.get(`/proveedores/${proveedorId}/documentos`);
  return response.data;
}

async function crear(proveedorId, formData) {
  const response = await apiClient.post(`/proveedores/${proveedorId}/documentos`, formData, {
    // Content-Type: undefined evita que axios serialice el FormData como JSON
    // (apiClient fija 'application/json' por defecto en client.js); así el
    // navegador genera el boundary multipart/form-data correcto.
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function eliminar(proveedorId, documentoId) {
  const response = await apiClient.delete(`/proveedores/${proveedorId}/documentos/${documentoId}`);
  return response.data;
}

function descargarBlob(blob, nombreBase) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombreBase;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

async function descargar(proveedorId, documentoId) {
  const blob = await apiClient.get(`/proveedores/${proveedorId}/documentos/${documentoId}/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `proveedor-${proveedorId}-documento-${documentoId}`);
}

export default { listar, crear, eliminar, descargar };
