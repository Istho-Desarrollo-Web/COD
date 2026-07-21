import apiClient from './client';

async function listar(filtros = {}) {
  const response = await apiClient.get('/logs-servidor', { params: filtros });
  return { data: response.data, pagination: response.pagination };
}

export default { listar };
