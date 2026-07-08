import MockAdapter from 'axios-mock-adapter';
import apiClient from './client';
import areaService from './area.service';

describe('area.service', () => {
  let mock;

  beforeEach(() => {
    mock = new MockAdapter(apiClient);
  });

  afterEach(() => {
    mock.restore();
  });

  it('listar returns the areas array', async () => {
    mock.onGet('/areas').reply(200, { success: true, data: [{ id: 1, nombre: 'Financiera' }] });
    const areas = await areaService.listar();
    expect(areas).toEqual([{ id: 1, nombre: 'Financiera' }]);
  });

  it('crear posts nombre and codigo and returns the created area', async () => {
    mock.onPost('/areas').reply(201, { success: true, data: { id: 2, nombre: 'SGI', codigo: 'SGI' } });
    const area = await areaService.crear({ nombre: 'SGI', codigo: 'SGI' });
    expect(area).toEqual({ id: 2, nombre: 'SGI', codigo: 'SGI' });
  });

  it('crear forwards nuevoUsuario when creating a lider inline', async () => {
    const nuevoUsuario = { username: 'jperez', email: 'jperez@istho.com.co', nombre: 'Juan', apellido: 'Pérez', password: 'Clave123!', rolId: 3 };
    mock.onPost('/areas').reply(201, { success: true, data: { id: 3, nombre: 'RRHH', codigo: 'RRHH', liderUsuarioId: 10 } });
    const area = await areaService.crear({ nombre: 'RRHH', codigo: 'RRHH', nuevoUsuario });
    expect(area).toEqual({ id: 3, nombre: 'RRHH', codigo: 'RRHH', liderUsuarioId: 10 });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ nombre: 'RRHH', codigo: 'RRHH', nuevoUsuario });
  });

  it('crear forwards liderUsuarioId when assigning an existing usuario', async () => {
    mock.onPost('/areas').reply(201, { success: true, data: { id: 4, nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 } });
    const area = await areaService.crear({ nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
    expect(area).toEqual({ id: 4, nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
    expect(JSON.parse(mock.history.post[0].data)).toEqual({ nombre: 'TI', codigo: 'TI', liderUsuarioId: 7 });
  });
});
