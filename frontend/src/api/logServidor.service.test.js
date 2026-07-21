import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import logServidorService from './logServidor.service';

describe('logServidor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns data and pagination, forwarding filtros as query params', async () => {
    mock.onGet('/logs-servidor').reply(200, {
      success: true,
      data: [{ id: 1, nivel: 'info', metodo: 'GET', ruta: '/health', statusCode: 200 }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const resultado = await logServidorService.listar({ nivel: 'info' });
    expect(resultado.data).toEqual([{ id: 1, nivel: 'info', metodo: 'GET', ruta: '/health', statusCode: 200 }]);
    expect(resultado.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(mock.history.get[0].params).toEqual({ nivel: 'info' });
  });
});
