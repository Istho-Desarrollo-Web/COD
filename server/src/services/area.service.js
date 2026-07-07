const { Area } = require('../models');

function calcularSaludDocumental({ vigentes, porVencer, vencidos }) {
  const total = vigentes + porVencer + vencidos;
  if (total === 0) return 100;
  return Math.round((vigentes / total) * 1000) / 10;
}

async function recalcularSaludArea(areaId) {
  const { Documento } = require('../models');
  const [vigentes, porVencer, vencidos] = await Promise.all([
    Documento.count({ where: { areaId, estado: 'vigente', activo: true } }),
    Documento.count({ where: { areaId, estado: 'por_vencer', activo: true } }),
    Documento.count({ where: { areaId, estado: 'vencido', activo: true } }),
  ]);
  const pct = calcularSaludDocumental({ vigentes, porVencer, vencidos });
  await Area.update({ saludDocumentalPct: pct }, { where: { id: areaId } });
  return pct;
}

module.exports = { calcularSaludDocumental, recalcularSaludArea };
