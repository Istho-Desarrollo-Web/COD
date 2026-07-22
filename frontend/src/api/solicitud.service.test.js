import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import solicitudService from './solicitud.service';

describe('solicitud.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the solicitudes array and forwards filtros as query params', async () => {
    mock.onGet('/solicitudes').reply(200, { success: true, data: [{ id: 1, codigo: 'SOL-2026-1' }] });
    const solicitudes = await solicitudService.listar({ estado: 'cotizando' });
    expect(solicitudes).toEqual([{ id: 1, codigo: 'SOL-2026-1' }]);
    expect(mock.history.get[0].params).toEqual({ estado: 'cotizando' });
  });

  it('listarTipos returns the tipos array', async () => {
    mock.onGet('/solicitudes/tipos').reply(200, { success: true, data: [{ id: 1, nombre: 'compra' }] });
    const tipos = await solicitudService.listarTipos();
    expect(tipos).toEqual([{ id: 1, nombre: 'compra' }]);
  });

  it('obtener returns a single solicitud', async () => {
    mock.onGet('/solicitudes/5').reply(200, { success: true, data: { id: 5, codigo: 'SOL-2026-5' } });
    const solicitud = await solicitudService.obtener(5);
    expect(solicitud).toEqual({ id: 5, codigo: 'SOL-2026-5' });
  });

  it('crear posts the given data and returns the created solicitud', async () => {
    mock.onPost('/solicitudes').reply(201, { success: true, data: { id: 2, codigo: 'SOL-2026-2' } });
    const solicitud = await solicitudService.crear({ tipoSolicitudId: 1, areaSolicitanteId: 7, descripcion: 'Compra' });
    expect(solicitud).toEqual({ id: 2, codigo: 'SOL-2026-2' });
  });

  it('enviarAprobacion posts to the enviar-aprobacion endpoint', async () => {
    mock.onPost('/solicitudes/1/enviar-aprobacion').reply(200, { success: true, data: { solicitud: { id: 1, estado: 'en_aprobacion' } } });
    const resultado = await solicitudService.enviarAprobacion(1);
    expect(resultado.solicitud.estado).toBe('en_aprobacion');
  });

  it('aprobar posts to the aprobar endpoint', async () => {
    mock.onPost('/solicitudes/1/aprobar').reply(200, { success: true, data: { id: 1, estado: 'aprobada' } });
    const resultado = await solicitudService.aprobar(1);
    expect(resultado).toEqual({ id: 1, estado: 'aprobada' });
  });

  it('rechazar posts the motivo and returns the updated solicitud', async () => {
    mock.onPost('/solicitudes/1/rechazar').reply(200, { success: true, data: { id: 1, estado: 'rechazada' } });
    const resultado = await solicitudService.rechazar(1, 'Sin presupuesto');
    expect(resultado).toEqual({ id: 1, estado: 'rechazada' });
    expect(JSON.parse(mock.history.post.find((r) => r.url === '/solicitudes/1/rechazar').data)).toEqual({ motivo: 'Sin presupuesto' });
  });

  it('cancelar posts to the cancelar endpoint', async () => {
    mock.onPost('/solicitudes/1/cancelar').reply(200, { success: true, data: { id: 1, estado: 'cancelada' } });
    const resultado = await solicitudService.cancelar(1);
    expect(resultado).toEqual({ id: 1, estado: 'cancelada' });
  });

  it('confirmar posts the given FormData and returns the updated solicitud', async () => {
    const formData = new FormData();
    formData.append('ordenFormalNumero', 'OF-2026-001');
    mock.onPost('/solicitudes/1/confirmar').reply(200, { success: true, data: { id: 1, estado: 'confirmada' } });
    const resultado = await solicitudService.confirmar(1, formData);
    expect(resultado).toEqual({ id: 1, estado: 'confirmada' });
    expect(mock.history.post[0].data).toBe(formData);
  });
});
