const { Rol } = require('../models');

const CACHE_TTL_MS = 60 * 1000;
let niveles = null;
let cacheLoadedAt = 0;

async function ROLES_NIVEL() {
  const now = Date.now();
  if (!niveles || now - cacheLoadedAt >= CACHE_TTL_MS) {
    const roles = await Rol.findAll();
    niveles = Object.fromEntries(roles.map((r) => [r.nombre, r.nivel]));
    cacheLoadedAt = now;
  }
  return niveles;
}

function invalidarRolesNivelCache() {
  niveles = null;
}

module.exports = { ROLES_NIVEL, invalidarRolesNivelCache };
