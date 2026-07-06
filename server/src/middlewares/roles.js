const { RolPermiso } = require('../models');
const { forbidden } = require('../utils/responses');
const asyncHandler = require('../utils/asyncHandler');

const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cacheLoadedAt = 0;

async function cargarCachePermisos() {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache;

  const filas = await RolPermiso.findAll();
  cache = {};
  for (const fila of filas) {
    cache[fila.rolId] = cache[fila.rolId] || {};
    cache[fila.rolId][fila.modulo] = fila.acciones;
  }
  cacheLoadedAt = now;
  return cache;
}

function invalidarCachePermisos() {
  cache = null;
}

function requierePermiso(modulo, accion) {
  return asyncHandler(async (req, res, next) => {
    const permisos = await cargarCachePermisos();
    const acciones = permisos[req.user?.rolId]?.[modulo] || [];
    if (!acciones.includes(accion)) return forbidden(res, 'Sin permisos para esta acción');
    return next();
  });
}

function requiereRolMinimo(nombreRolMinimo) {
  const { ROLES_NIVEL } = require('./rolesNivelCache');
  return asyncHandler(async (req, res, next) => {
    const niveles = await ROLES_NIVEL();
    if ((req.user?.nivelRol || 0) < (niveles[nombreRolMinimo] || Infinity)) {
      return forbidden(res, 'Nivel de rol insuficiente');
    }
    return next();
  });
}

const soloAdmin = requiereRolMinimo('admin');

async function obtenerPermisosDeRol(rolId) {
  const permisos = await cargarCachePermisos();
  return permisos[rolId] || {};
}

module.exports = { requierePermiso, requiereRolMinimo, soloAdmin, cargarCachePermisos, invalidarCachePermisos, obtenerPermisosDeRol };
