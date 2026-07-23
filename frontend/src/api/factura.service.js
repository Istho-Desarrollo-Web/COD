import apiClient from './client';

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

async function obtener(solicitudId) {
  const response = await apiClient.get(`/solicitudes/${solicitudId}/factura`);
  return response.data;
}

async function registrar(solicitudId, formData) {
  const response = await apiClient.post(`/solicitudes/${solicitudId}/facturar`, formData, {
    headers: { 'Content-Type': undefined },
  });
  return response.data;
}

async function descargar(solicitudId) {
  const blob = await apiClient.get(`/solicitudes/${solicitudId}/factura/descargar`, { responseType: 'blob' });
  descargarBlob(blob, `solicitud-${solicitudId}-factura`);
}

export default { obtener, registrar, descargar };
