import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import facturaService from './factura.service';

describe('factura.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('obtener returns null when the solicitud has no factura yet', async () => {
    mock.onGet('/solicitudes/1/factura').reply(200, { success: true, data: null });
    const factura = await facturaService.obtener(1);
    expect(factura).toBeNull();
  });

  it('obtener returns the factura for a solicitud', async () => {
    mock.onGet('/solicitudes/1/factura').reply(200, { success: true, data: { id: 5, numero: 'FAC-2026-001' } });
    const factura = await facturaService.obtener(1);
    expect(factura).toEqual({ id: 5, numero: 'FAC-2026-001' });
  });

  it('registrar posts the given FormData and returns the created factura', async () => {
    const formData = new FormData();
    formData.append('numero', 'FAC-2026-001');
    mock.onPost('/solicitudes/1/facturar').reply(201, { success: true, data: { id: 5, numero: 'FAC-2026-001' } });
    const factura = await facturaService.registrar(1, formData);
    expect(factura).toEqual({ id: 5, numero: 'FAC-2026-001' });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('descargar fetches the file as a blob and triggers a download', async () => {
    const blob = new Blob(['contenido'], { type: 'application/pdf' });
    mock.onGet('/solicitudes/1/factura/descargar').reply(200, blob);

    const createObjectURL = vi.fn(() => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;
    const click = vi.fn();
    const anchorOriginal = document.createElement.bind(document);
    let enlaceCreado;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = anchorOriginal(tag);
      if (tag === 'a') {
        el.click = click;
        enlaceCreado = el;
      }
      return el;
    });

    await facturaService.descargar(1);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(enlaceCreado.download).toBe('solicitud-1-factura');

    document.createElement.mockRestore();
  });
});
