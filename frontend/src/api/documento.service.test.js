import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import documentoService from './documento.service';

describe('documento.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns data and pagination as siblings', async () => {
    mock.onGet('/documentos').reply(200, {
      success: true,
      data: [{ id: 1, nombre: 'Manual RH' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    const resultado = await documentoService.listar({ areaId: 3 });
    expect(resultado).toEqual({
      data: [{ id: 1, nombre: 'Manual RH' }],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });
    expect(mock.history.get[0].params).toEqual({ areaId: 3 });
  });

  it('obtener returns a single documento', async () => {
    mock.onGet('/documentos/5').reply(200, { success: true, data: { id: 5, nombre: 'Política SST' } });
    const documento = await documentoService.obtener(5);
    expect(documento).toEqual({ id: 5, nombre: 'Política SST' });
  });

  it('crear posts the given FormData and returns the created documento', async () => {
    const formData = new FormData();
    formData.append('nombre', 'Manual RH');
    mock.onPost('/documentos').reply(201, { success: true, data: { id: 1, nombre: 'Manual RH' } });
    const documento = await documentoService.crear(formData);
    expect(documento).toEqual({ id: 1, nombre: 'Manual RH' });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('editar PUTs the changes and returns the updated documento', async () => {
    mock.onPut('/documentos/1').reply(200, { success: true, data: { id: 1, nombre: 'Manual RH v2' } });
    const documento = await documentoService.editar(1, { nombre: 'Manual RH v2' });
    expect(documento).toEqual({ id: 1, nombre: 'Manual RH v2' });
    expect(JSON.parse(mock.history.put[0].data)).toEqual({ nombre: 'Manual RH v2' });
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/documentos/1').reply(200, { success: true, data: null, message: 'Documento eliminado' });
    const resultado = await documentoService.eliminar(1);
    expect(resultado).toBeNull();
  });

  it('listarVersiones returns the version history array', async () => {
    mock.onGet('/documentos/1/versiones').reply(200, { success: true, data: [{ id: 9, version: 'v1' }] });
    const versiones = await documentoService.listarVersiones(1);
    expect(versiones).toEqual([{ id: 9, version: 'v1' }]);
  });

  it('subirVersion posts the given FormData to the versiones endpoint', async () => {
    const formData = new FormData();
    formData.append('version', 'v2');
    mock.onPost('/documentos/1/versiones').reply(200, { success: true, data: { id: 1, version: 'v2' } });
    const documento = await documentoService.subirVersion(1, formData);
    expect(documento).toEqual({ id: 1, version: 'v2' });
    expect(mock.history.post[0].data).toBe(formData);
  });

  it('descargar fetches the file as a blob and triggers a download with the extension from the mimetype', async () => {
    const blob = new Blob(['contenido'], { type: 'application/pdf' });
    mock.onGet('/documentos/1/descargar').reply(200, blob);

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

    await documentoService.descargar(1);

    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    expect(enlaceCreado.download).toBe('documento-1.pdf');

    document.createElement.mockRestore();
  });

  it('descargarVersion appends the extension derived from the mimetype to the version filename', async () => {
    const blob = new Blob(['contenido'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    mock.onGet('/documentos/1/versiones/9/descargar').reply(200, blob);

    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    const anchorOriginal = document.createElement.bind(document);
    let enlaceCreado;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = anchorOriginal(tag);
      if (tag === 'a') {
        el.click = vi.fn();
        enlaceCreado = el;
      }
      return el;
    });

    await documentoService.descargarVersion(1, 9);

    expect(enlaceCreado.download).toBe('documento-1-version-9.docx');

    document.createElement.mockRestore();
  });

  it('descargar omits the extension when the mimetype is not in the known map', async () => {
    const blob = new Blob(['contenido'], { type: 'application/octet-stream' });
    mock.onGet('/documentos/1/descargar').reply(200, blob);

    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
    const anchorOriginal = document.createElement.bind(document);
    let enlaceCreado;
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = anchorOriginal(tag);
      if (tag === 'a') {
        el.click = vi.fn();
        enlaceCreado = el;
      }
      return el;
    });

    await documentoService.descargar(1);

    expect(enlaceCreado.download).toBe('documento-1');

    document.createElement.mockRestore();
  });
});
