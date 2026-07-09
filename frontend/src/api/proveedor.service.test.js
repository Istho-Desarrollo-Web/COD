import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import proveedorService from './proveedor.service';

describe('proveedor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the proveedores array and forwards filtros as query params', async () => {
    mock.onGet('/proveedores').reply(200, { success: true, data: [{ id: 1, razonSocial: 'Insumos ABC' }] });
    const proveedores = await proveedorService.listar({ estado: 'activo' });
    expect(proveedores).toEqual([{ id: 1, razonSocial: 'Insumos ABC' }]);
    expect(mock.history.get[0].params).toEqual({ estado: 'activo' });
  });

  it('obtener returns a single proveedor', async () => {
    mock.onGet('/proveedores/5').reply(200, { success: true, data: { id: 5, razonSocial: 'Transportes XYZ' } });
    const proveedor = await proveedorService.obtener(5);
    expect(proveedor).toEqual({ id: 5, razonSocial: 'Transportes XYZ' });
  });

  it('crear posts the given data and returns the created proveedor', async () => {
    mock.onPost('/proveedores').reply(201, { success: true, data: { id: 2, razonSocial: 'Nuevo SAS' } });
    const proveedor = await proveedorService.crear({ tipo: 'proveedor', documentoIdentificacion: '900123', razonSocial: 'Nuevo SAS' });
    expect(proveedor).toEqual({ id: 2, razonSocial: 'Nuevo SAS' });
  });

  it('editar PUTs the changes and returns the updated proveedor', async () => {
    mock.onPut('/proveedores/1').reply(200, { success: true, data: { id: 1, razonSocial: 'Editado SAS' } });
    const proveedor = await proveedorService.editar(1, { razonSocial: 'Editado SAS' });
    expect(proveedor).toEqual({ id: 1, razonSocial: 'Editado SAS' });
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/proveedores/1').reply(200, { success: true, data: null });
    const resultado = await proveedorService.eliminar(1);
    expect(resultado).toBeNull();
  });
});
