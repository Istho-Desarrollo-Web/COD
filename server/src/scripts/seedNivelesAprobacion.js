const { TipoSolicitud, NivelAprobacion } = require('../models');

const TIPOS = ['compra', 'contratacion_servicio'];

// Umbrales de ejemplo — ajustar desde Administración con los montos reales de ISTHO.
const NIVELES = [
  { montoDesde: 0, montoHasta: 1_000_000, rolAprobador: 'lider_area', orden: 1 },
  { montoDesde: 1_000_000.01, montoHasta: 10_000_000, rolAprobador: 'financiera', orden: 2 },
  { montoDesde: 10_000_000.01, montoHasta: null, rolAprobador: 'admin', orden: 3 },
];

module.exports = async function seedNivelesAprobacion() {
  for (const nombre of TIPOS) {
    const [tipo] = await TipoSolicitud.findOrCreate({ where: { nombre } });
    for (const nivel of NIVELES) {
      await NivelAprobacion.findOrCreate({
        where: { tipoSolicitudId: tipo.id, orden: nivel.orden },
        defaults: { ...nivel, tipoSolicitudId: tipo.id },
      });
    }
  }
};
