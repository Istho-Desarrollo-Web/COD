import apiClient from './client';

async function listar() {
  const response = await apiClient.get('/roles');
  return response.data;
}

async function matrizAccesos() {
  const response = await apiClient.get('/roles/matriz-accesos');
  return response.data;
}

export default { listar, matrizAccesos };
