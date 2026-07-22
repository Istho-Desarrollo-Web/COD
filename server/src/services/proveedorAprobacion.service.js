const fs = require('fs');
const path = require('path');
const { calcularEstadoDocumento } = require('./documento.service');
const { guardarArchivo, obtenerRutaAbsoluta } = require('./almacenamiento.service');
const { recalcularSaludArea } = require('./area.service');

const ORDEN_CRITICIDAD = { basico: 0, relevante: 1, critico: 2 };

function requisitoAplica(criticidadProveedor, criticidadMinimaRequisito) {
  return ORDEN_CRITICIDAD[criticidadProveedor] >= ORDEN_CRITICIDAD[criticidadMinimaRequisito];
}

async function requisitosFaltantes(proveedor) {
  const { RequisitoProveedor, ProveedorDocumento } = require('../models');

  const requisitos = await RequisitoProveedor.findAll({ where: { activo: true, obligatorio: true } });
  const aplicables = requisitos.filter((requisito) => requisitoAplica(proveedor.criticidad, requisito.criticidadMinima));
  if (aplicables.length === 0) return [];

  const documentos = await ProveedorDocumento.findAll({ where: { proveedorId: proveedor.id } });
  const requisitosIdCubiertos = new Set(
    documentos.filter((documento) => documento.requisitoId && documento.estado !== 'vencido').map((documento) => documento.requisitoId)
  );

  return aplicables.filter((requisito) => !requisitosIdCubiertos.has(requisito.id)).map((requisito) => requisito.nombre);
}

async function aprobarProveedor(proveedor) {
  const { sequelize, Carpeta, Documento, ProveedorDocumento, RequisitoProveedor, TipoDocumento } = require('../models');
  const areaId = proveedor.areaSolicitanteId;

  const resultado = await sequelize.transaction(async (t) => {
    const [carpetaRaiz] = await Carpeta.findOrCreate({
      where: { areaId, proveedorId: null, carpetaPadreId: null, nombre: 'Proveedores' },
      transaction: t,
    });

    const subcarpeta = await Carpeta.create(
      { areaId, carpetaPadreId: carpetaRaiz.id, proveedorId: proveedor.id, nombre: proveedor.razonSocial },
      { transaction: t }
    );

    const documentosExpediente = await ProveedorDocumento.findAll({ where: { proveedorId: proveedor.id }, transaction: t });
    const tipoGenerico = await TipoDocumento.findOne({ where: { nombre: 'Documento de proveedor' }, transaction: t });

    let documentosReflejados = 0;
    for (const documentoExpediente of documentosExpediente) {
      if (!documentoExpediente.s3Key) continue;

      let nombreDocumento = 'Documento de proveedor';
      let tipoDocumentoId = tipoGenerico.id;
      if (documentoExpediente.requisitoId) {
        const requisito = await RequisitoProveedor.findByPk(documentoExpediente.requisitoId, { transaction: t });
        if (requisito?.tipoDocumentoId) {
          nombreDocumento = requisito.nombre;
          tipoDocumentoId = requisito.tipoDocumentoId;
        }
      }

      const bufferOriginal = fs.readFileSync(obtenerRutaAbsoluta(documentoExpediente.s3Key));
      const extension = path.extname(documentoExpediente.s3Key);
      const { ruta } = guardarArchivo({ originalname: `${nombreDocumento}${extension}`, buffer: bufferOriginal }, areaId);

      const tipoDocumento = await TipoDocumento.findByPk(tipoDocumentoId, { transaction: t });
      const estado = calcularEstadoDocumento({
        vigenciaHasta: documentoExpediente.vigenciaHasta,
        diasAlerta: tipoDocumento.diasAlertaVencimientoDefault,
      });

      await Documento.create(
        {
          areaId,
          carpetaId: subcarpeta.id,
          tipoDocumentoId,
          nombre: nombreDocumento,
          vigenciaDesde: documentoExpediente.vigenciaDesde,
          vigenciaHasta: documentoExpediente.vigenciaHasta,
          estado,
          s3Key: ruta,
        },
        { transaction: t }
      );
      documentosReflejados += 1;
    }

    await proveedor.update({ estado: 'activo' }, { transaction: t });

    return { carpeta: subcarpeta, documentosReflejados };
  });

  if (resultado.documentosReflejados > 0) {
    await recalcularSaludArea(areaId);
  }

  return resultado;
}

module.exports = { aprobarProveedor, requisitosFaltantes };
