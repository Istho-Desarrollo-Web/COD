const cron = require('node-cron');

async function ejecutar() {
  const { Documento, TipoDocumento } = require('../models');
  const { calcularEstadoDocumento } = require('../services/documento.service');
  const { recalcularSaludArea } = require('../services/area.service');

  const documentos = await Documento.findAll({ where: { activo: true }, include: [{ model: TipoDocumento }] });
  const areasAfectadas = new Set();
  let documentosActualizados = 0;

  for (const documento of documentos) {
    const diasAlerta = documento.diasAlertaVencimiento ?? documento.TipoDocumento.diasAlertaVencimientoDefault;
    const estado = calcularEstadoDocumento({ vigenciaHasta: documento.vigenciaHasta, diasAlerta });
    if (estado !== documento.estado) {
      await documento.update({ estado });
      areasAfectadas.add(documento.areaId);
      documentosActualizados += 1;
    }
  }

  for (const areaId of areasAfectadas) {
    await recalcularSaludArea(areaId);
  }

  return { documentosActualizados, areasRecalculadas: areasAfectadas.size };
}

function programar() {
  const expresion = process.env.CRON_RECALCULO_ESTADOS || '0 3 * * *';
  cron.schedule(expresion, () => {
    ejecutar().catch((err) => console.error('Error en job recalcularEstadosDocumentos:', err));
  });
}

module.exports = { ejecutar, programar };
