import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import proveedorDocumentoService from './proveedorDocumento.service';

describe('proveedorDocumento.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the documentos array for a proveedor', async () => {
    mock.onGet('/proveedores/1/documentos').reply(200, { success: true, data: [{ id: 1, s3Key: 'documentos/proveedores/1/rut.pdf' }] });
    const documentos = await proveedorDocumentoService.listar(1);
    expect(documentos).toEqual([{ id: 1, s3Key: 'documentos/proveedores/1/rut.pdf' }]);
  });

  it('crear posts the given FormData and returns the created documento', async () => {
    const formData = new FormData();
    formData.append('requisitoId', '2');
    mock.onPost('/proveedores/1/documentos').reply(201, { success: true, data: { id: 3, requisitoId: 2 } });
    const documento = await proveedorDocumentoService.crear(1, formData);
    expect(documento).toEqual({ id: 3, requisitoId: 2 });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/proveedores/1/documentos/3').reply(200, { success: true, data: null });
    const resultado = await proveedorDocumentoService.eliminar(1, 3);
    expect(resultado).toBeNull();
  });

  it('descargar fetches the file as a blob and triggers a download', async () => {
    const blob = new Blob(['contenido'], { type: 'application/pdf' });
    mock.onGet('/proveedores/1/documentos/3/descargar').reply(200, blob);

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

    await proveedorDocumentoService.descargar(1, 3);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(enlaceCreado.download).toBe('proveedor-1-documento-3');

    document.createElement.mockRestore();
  });
});
