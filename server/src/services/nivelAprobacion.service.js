const { Op } = require('sequelize');

async function resolverNivelAprobacion(tipoSolicitudId, monto, criticidad) {
  const { NivelAprobacion } = require('../models');

  if (criticidad === 'critico') {
    return NivelAprobacion.findOne({
      where: { tipoSolicitudId, activo: true, rolAprobador: 'aprobador_ejecutivo' },
      order: [['orden', 'ASC']],
    });
  }

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
