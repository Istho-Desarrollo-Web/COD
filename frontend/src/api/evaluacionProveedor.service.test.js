import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import evaluacionProveedorService from './evaluacionProveedor.service';

describe('evaluacionProveedor.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the evaluaciones array for a proveedor', async () => {
    mock.onGet('/proveedores/1/evaluaciones').reply(200, { success: true, data: [{ id: 5, estado: 'pendiente' }] });
    const evaluaciones = await evaluacionProveedorService.listar(1);
    expect(evaluaciones).toEqual([{ id: 5, estado: 'pendiente' }]);
  });

  it('listarTodas passes filtros as query params', async () => {
    mock.onGet('/proveedores/evaluaciones').reply((config) => {
      expect(config.params).toEqual({ estado: 'pendiente' });
      return [200, { success: true, data: [] }];
    });
    const evaluaciones = await evaluacionProveedorService.listarTodas({ estado: 'pendiente' });
    expect(evaluaciones).toEqual([]);
  });

  it('crear posts fechaProgramada and returns the created evaluación', async () => {
    mock.onPost('/proveedores/1/evaluaciones').reply(201, { success: true, data: { id: 5, estado: 'pendiente' } });
    const evaluacion = await evaluacionProveedorService.crear(1, { fechaProgramada: '2026-12-01' });
    expect(evaluacion).toEqual({ id: 5, estado: 'pendiente' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ fechaProgramada: '2026-12-01' });
  });

  it('iniciar posts to the iniciar endpoint', async () => {
    mock.onPost('/proveedores/1/evaluaciones/5/iniciar').reply(200, { success: true, data: { id: 5, estado: 'en_proceso' } });
    const evaluacion = await evaluacionProveedorService.iniciar(1, 5);
    expect(evaluacion).toEqual({ id: 5, estado: 'en_proceso' });
  });

  it('completar posts puntaje/observaciones to the completar endpoint', async () => {
    mock.onPost('/proveedores/1/evaluaciones/5/completar').reply(200, { success: true, data: { id: 5, estado: 'completada' } });
    const evaluacion = await evaluacionProveedorService.completar(1, 5, { puntaje: 85 });
    expect(evaluacion).toEqual({ id: 5, estado: 'completada' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ puntaje: 85 });
  });
});
