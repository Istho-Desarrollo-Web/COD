function parsePaginacion(query) {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(query.limit, 10) || 20, 1);
  return { page, limit, offset: (page - 1) * limit };
}

function buildPaginacion(total, page, limit) {
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  return { totalPages, hasNext: page < totalPages, hasPrev: page > 1 };
}

function parseOrdenamiento(query, camposPermitidos, defaultField, defaultOrder = 'ASC') {
  const field = camposPermitidos.includes(query.orden) ? query.orden : defaultField;
  const requested = (query.direccion || '').toUpperCase();
  const order = ['ASC', 'DESC'].includes(requested) ? requested : defaultOrder.toUpperCase();
  return { field, order };
}

function limpiarObjeto(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null));
}

function sanitizarBusqueda(str) {
  return String(str).replace(/[%_]/g, (match) => `\\${match}`);
}

module.exports = { parsePaginacion, buildPaginacion, parseOrdenamiento, limpiarObjeto, sanitizarBusqueda };
