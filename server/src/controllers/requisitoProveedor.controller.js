const { RequisitoProveedor } = require('../models');
const { success } = require('../utils/responses');

async function listar(req, res) {
  const requisitos = await RequisitoProveedor.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, requisitos);
}

module.exports = { listar };
