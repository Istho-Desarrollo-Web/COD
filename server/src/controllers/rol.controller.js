const { Rol } = require('../models');
const { success } = require('../utils/responses');
const { CATALOGO_MODULOS } = require('../models/Permiso')();
const { cargarCachePermisos } = require('../middlewares/roles');

async function listar(req, res) {
  const roles = await Rol.findAll({ where: { activo: true }, order: [['nivel', 'DESC']] });
  return success(res, roles);
}

async function matrizAccesos(req, res) {
  const roles = await Rol.findAll({ where: { activo: true }, order: [['nivel', 'DESC']] });
  const cache = await cargarCachePermisos();

  const permisos = [];
  for (const rol of roles) {
    for (const [modulo, acciones] of Object.entries(cache[rol.id] || {})) {
      permisos.push({ rolId: rol.id, modulo, acciones });
    }
  }

  return success(res, { roles, modulos: CATALOGO_MODULOS, permisos });
}

module.exports = { listar, matrizAccesos };
