const { TipoDocumento } = require('../models');
const { success } = require('../utils/responses');

async function listar(req, res) {
  const tipos = await TipoDocumento.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, tipos);
}

module.exports = { listar };
