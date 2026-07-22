import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import cotizacionService from './cotizacion.service';

describe('cotizacion.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the cotizaciones array for a solicitud', async () => {
    mock.onGet('/solicitudes/1/cotizaciones').reply(200, { success: true, data: [{ id: 5, monto: 90000 }] });
    const cotizaciones = await cotizacionService.listar(1);
    expect(cotizaciones).toEqual([{ id: 5, monto: 90000 }]);
  });

  it('crear posts the given FormData and returns the created cotizacion', async () => {
    const formData = new FormData();
    formData.append('monto', '90000');
    mock.onPost('/solicitudes/1/cotizaciones').reply(201, { success: true, data: { id: 5, monto: 90000 } });
    const cotizacion = await cotizacionService.crear(1, formData);
    expect(cotizacion).toEqual({ id: 5, monto: 90000 });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('seleccionar posts to the seleccionar endpoint', async () => {
    mock.onPost('/solicitudes/1/cotizaciones/5/seleccionar').reply(200, { success: true, data: { id: 5, seleccionada: true } });
    const resultado = await cotizacionService.seleccionar(1, 5);
    expect(resultado).toEqual({ id: 5, seleccionada: true });
  });
});
