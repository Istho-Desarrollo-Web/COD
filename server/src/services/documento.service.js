const DIA_MS = 24 * 60 * 60 * 1000;

function calcularEstadoDocumento({ vigenciaHasta, diasAlerta, hoy = new Date() }) {
  if (!vigenciaHasta) return 'sin_vigencia';
  const fechaVencimiento = new Date(`${vigenciaHasta}T00:00:00`);
  const diasRestantes = Math.floor((fechaVencimiento.getTime() - hoy.getTime()) / DIA_MS);
  if (diasRestantes < 0) return 'vencido';
  if (diasRestantes <= (diasAlerta ?? 30)) return 'por_vencer';
  return 'vigente';
}

async function subirNuevaVersion(documentoId, { version, s3Key, vigenciaDesde, vigenciaHasta, subidoPorUsuarioId }) {
  const { Documento, DocumentoVersionHistorial, TipoDocumento } = require('../models');
  const { recalcularSaludArea } = require('./area.service');

  const documento = await Documento.findByPk(documentoId);
  if (!documento) throw new Error('Documento no encontrado');

  await DocumentoVersionHistorial.create({
    documentoId: documento.id,
    version: documento.version,
    s3Key: documento.s3Key,
    vigenciaDesde: documento.vigenciaDesde,
    vigenciaHasta: documento.vigenciaHasta,
    subidoPorUsuarioId,
  });

  const tipoDocumento = await TipoDocumento.findByPk(documento.tipoDocumentoId);
  const diasAlerta = documento.diasAlertaVencimiento ?? tipoDocumento.diasAlertaVencimientoDefault;
  const estado = calcularEstadoDocumento({ vigenciaHasta, diasAlerta });

  await documento.update({ version, s3Key, vigenciaDesde, vigenciaHasta, estado });
  await recalcularSaludArea(documento.areaId);
  return documento;
}

module.exports = { calcularEstadoDocumento, subirNuevaVersion };
