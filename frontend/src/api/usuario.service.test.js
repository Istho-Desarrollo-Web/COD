import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import usuarioService from './usuario.service';

describe('usuario.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the usuarios array', async () => {
    mock.onGet('/usuarios').reply(200, { success: true, data: [{ id: 1, username: 'jperez' }] });
    const usuarios = await usuarioService.listar();
    expect(usuarios).toEqual([{ id: 1, username: 'jperez' }]);
  });

  it('obtener returns a single usuario', async () => {
    mock.onGet('/usuarios/5').reply(200, { success: true, data: { id: 5, username: 'jperez' } });
    const usuario = await usuarioService.obtener(5);
    expect(usuario).toEqual({ id: 5, username: 'jperez' });
  });

  it('crear posts the given data and returns the created usuario', async () => {
    const datos = { username: 'jperez', email: 'jperez@istho.com.co', nombre: 'Juan', apellido: 'Pérez', password: 'Clave123!', rolId: 3 };
    mock.onPost('/usuarios').reply(201, { success: true, data: { id: 1, ...datos } });
    const usuario = await usuarioService.crear(datos);
    expect(usuario).toEqual({ id: 1, ...datos });
    expect(JSON.parse(mock.history.post[0].data)).toEqual(datos);
  });

  it('editar PUTs the changes and returns the updated usuario', async () => {
    mock.onPut('/usuarios/1').reply(200, { success: true, data: { id: 1, nombre: 'Juan Actualizado' } });
    const usuario = await usuarioService.editar(1, { nombre: 'Juan Actualizado' });
    expect(usuario).toEqual({ id: 1, nombre: 'Juan Actualizado' });
  });

  it('eliminar deletes and returns null', async () => {
    mock.onDelete('/usuarios/1').reply(200, { success: true, data: null, message: 'Usuario eliminado' });
    const resultado = await usuarioService.eliminar(1);
    expect(resultado).toBeNull();
  });
});
