import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/tipos-documento');
  return response.data;
}

export default { listar };
