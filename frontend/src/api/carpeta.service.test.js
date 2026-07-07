import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import carpetaService from './carpeta.service';

describe('carpeta.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar requests carpetas for the given area and returns the tree', async () => {
    mock.onGet('/carpetas').reply(200, { success: true, data: [{ id: 1, nombre: 'RRHH', subcarpetas: [] }] });
    const carpetas = await carpetaService.listar(3);
    expect(carpetas).toEqual([{ id: 1, nombre: 'RRHH', subcarpetas: [] }]);
    expect(mock.history.get[0].params).toEqual({ areaId: 3 });
  });

  it('crear posts the new carpeta and returns it', async () => {
    mock.onPost('/carpetas').reply(201, { success: true, data: { id: 2, nombre: 'Contratos' } });
    const carpeta = await carpetaService.crear({ areaId: 3, nombre: 'Contratos', carpetaPadreId: null });
    expect(carpeta).toEqual({ id: 2, nombre: 'Contratos' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ areaId: 3, nombre: 'Contratos', carpetaPadreId: null });
  });
});
