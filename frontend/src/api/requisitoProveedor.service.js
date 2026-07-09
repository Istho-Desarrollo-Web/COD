import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/requisitos-proveedor');
  return response.data;
}

export default { listar };
