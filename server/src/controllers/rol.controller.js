const { Rol } = require('../models');
const { success } = require('../utils/responses');

async function listar(req, res) {
  const roles = await Rol.findAll({ where: { activo: true }, order: [['nivel', 'DESC']] });
  return success(res, roles);
}

module.exports = { listar };
