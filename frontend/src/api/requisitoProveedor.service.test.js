import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import requisitoProveedorService from './requisitoProveedor.service';

describe('requisitoProveedor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the requisitos array', async () => {
    mock.onGet('/requisitos-proveedor').reply(200, { success: true, data: [{ id: 1, nombre: 'RUT' }] });
    const requisitos = await requisitoProveedorService.listar();
    expect(requisitos).toEqual([{ id: 1, nombre: 'RUT' }]);
  });
});
