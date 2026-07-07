import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import tipoDocumentoService from './tipoDocumento.service';

describe('tipoDocumento.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the tipos array', async () => {
    mock.onGet('/tipos-documento').reply(200, { success: true, data: [{ id: 1, nombre: 'Manual' }] });
    const tipos = await tipoDocumentoService.listar();
    expect(tipos).toEqual([{ id: 1, nombre: 'Manual' }]);
  });
});
