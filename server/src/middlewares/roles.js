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
    // `acciones` es DataTypes.JSON, pero esta base de datos lo materializa
    // como `longtext` (no JSON nativo) — Sequelize no lo re-parsea solo, así
    // que llega como el string `'["ver"]'` en vez del array. Normalizarlo
    // aquí es el único punto por el que pasan todas las lecturas de permisos.
    cache[fila.rolId][fila.modulo] = typeof fila.acciones === 'string' ? JSON.parse(fila.acciones) : fila.acciones;
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
    // Un usuario con varios roles tiene el permiso si CUALQUIERA de sus
    // roles lo otorga — es una unión, no una intersección.
    const autorizado = (req.user?.roles || []).some((rol) => (permisos[rol.id]?.[modulo] || []).includes(accion));
    if (!autorizado) return forbidden(res, 'Sin permisos para esta acción');
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

const soloAdmin = requiereRolMinimo('super_administrador');

// Fusiona (unión) las acciones por módulo entre todos los roles del
// usuario — el frontend sigue esperando un único objeto `permisos` ya
// resuelto, no uno por rol.
async function obtenerPermisosDeRoles(rolIds) {
  const permisos = await cargarCachePermisos();
  const fusionado = {};
  for (const rolId of rolIds) {
    for (const [modulo, acciones] of Object.entries(permisos[rolId] || {})) {
      fusionado[modulo] = Array.from(new Set([...(fusionado[modulo] || []), ...acciones]));
    }
  }
  return fusionado;
}

module.exports = { requierePermiso, requiereRolMinimo, soloAdmin, cargarCachePermisos, invalidarCachePermisos, obtenerPermisosDeRoles };
