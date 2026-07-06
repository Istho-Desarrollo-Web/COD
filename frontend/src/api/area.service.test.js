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
});
