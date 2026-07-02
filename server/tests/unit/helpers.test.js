const { parsePaginacion, buildPaginacion, parseOrdenamiento, limpiarObjeto, sanitizarBusqueda } = require('../../src/utils/helpers');

describe('helpers utils', () => {
  it('parsePaginacion defaults to page 1, limit 20', () => {
    expect(parsePaginacion({})).toEqual({ page: 1, limit: 20, offset: 0 });
  });

  it('parsePaginacion computes offset', () => {
    expect(parsePaginacion({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('buildPaginacion computes totalPages/hasNext/hasPrev', () => {
    expect(buildPaginacion(25, 2, 10)).toEqual({ totalPages: 3, hasNext: true, hasPrev: true });
    expect(buildPaginacion(25, 1, 10)).toEqual({ totalPages: 3, hasNext: true, hasPrev: false });
    expect(buildPaginacion(25, 3, 10)).toEqual({ totalPages: 3, hasNext: false, hasPrev: true });
  });

  it('parseOrdenamiento falls back to default when field not allowed', () => {
    expect(parseOrdenamiento({ orden: 'password_hash', direccion: 'asc' }, ['nombre'], 'nombre', 'DESC'))
      .toEqual({ field: 'nombre', order: 'ASC' });
  });

  it('limpiarObjeto removes undefined and null values', () => {
    expect(limpiarObjeto({ a: 1, b: undefined, c: null, d: 0 })).toEqual({ a: 1, d: 0 });
  });

  it('sanitizarBusqueda escapes % and _', () => {
    expect(sanitizarBusqueda('50%_off')).toBe('50\\%\\_off');
  });
});
