import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import solicitudComentarioService from './solicitudComentario.service';

describe('solicitudComentario.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the comentarios array for a solicitud', async () => {
    mock.onGet('/solicitudes/1/comentarios').reply(200, { success: true, data: [{ id: 1, texto: 'Hola' }] });
    const comentarios = await solicitudComentarioService.listar(1);
    expect(comentarios).toEqual([{ id: 1, texto: 'Hola' }]);
  });

  it('crear posts the texto and returns the created comentario', async () => {
    mock.onPost('/solicitudes/1/comentarios').reply(201, { success: true, data: { id: 2, texto: 'Nuevo comentario' } });
    const comentario = await solicitudComentarioService.crear(1, 'Nuevo comentario');
    expect(comentario).toEqual({ id: 2, texto: 'Nuevo comentario' });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ texto: 'Nuevo comentario' });
  });
});
