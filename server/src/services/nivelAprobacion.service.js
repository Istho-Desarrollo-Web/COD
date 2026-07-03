const { Op } = require('sequelize');

async function resolverNivelAprobacion(tipoSolicitudId, monto) {
  const { NivelAprobacion } = require('../models');
  return NivelAprobacion.findOne({
    where: {
      tipoSolicitudId,
      activo: true,
      montoDesde: { [Op.lte]: monto },
      [Op.or]: [{ montoHasta: null }, { montoHasta: { [Op.gte]: monto } }],
    },
    order: [['orden', 'ASC']],
  });
}

module.exports = { resolverNivelAprobacion };
