const { Rol } = require('../models');

let niveles = null;

async function ROLES_NIVEL() {
  if (!niveles) {
    const roles = await Rol.findAll();
    niveles = Object.fromEntries(roles.map((r) => [r.nombre, r.nivel]));
  }
  return niveles;
}

module.exports = { ROLES_NIVEL };
