import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/roles');
  return response.data;
}

export default { listar };
