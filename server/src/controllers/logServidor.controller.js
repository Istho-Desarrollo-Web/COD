const { Op } = require('sequelize');
const { LogServidor } = require('../models');
const { paginated, badRequest } = require('../utils/responses');

async function listar(req, res) {
  const { nivel, metodo, desde, hasta, q } = req.query;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

  const condiciones = [];
  if (nivel) condiciones.push({ nivel });
  if (metodo) condiciones.push({ metodo });
  if (q) condiciones.push({ [Op.or]: [{ mensaje: { [Op.like]: `%${q}%` } }, { ruta: { [Op.like]: `%${q}%` } }] });

  if (desde) {
    const fechaDesde = new Date(`${desde}T00:00:00`);
    if (isNaN(fechaDesde.getTime())) return badRequest(res, 'desde no es una fecha válida');
    condiciones.push({ createdAt: { [Op.gte]: fechaDesde } });
  }
  if (hasta) {
    const fechaHasta = new Date(`${hasta}T23:59:59.999`);
    if (isNaN(fechaHasta.getTime())) return badRequest(res, 'hasta no es una fecha válida');
    condiciones.push({ createdAt: { [Op.lte]: fechaHasta } });
  }

  const where = condiciones.length ? { [Op.and]: condiciones } : {};

  const { rows, count } = await LogServidor.findAndCountAll({
    where,
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return paginated(res, rows, { page, limit, total: count, totalPages: Math.ceil(count / limit) });
}

module.exports = { listar };
