const { Solicitud, Factura, Auditoria, sequelize } = require('../models');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responses');
const { guardarArchivo, obtenerRutaAbsoluta } = require('../services/almacenamiento.service');
const { tieneVisibilidadAmplia } = require('../utils/visibilidadSolicitud');

// `obtener`/`descargar` están gateados por `solicitudes:ver`, que también
// tienen `solicitante`/`gestor_documental` (visibilidad restringida a lo
// propio); sin este chequeo, cualquier solicitante podría leer el monto o
// descargar el archivo de facturas de solicitudes ajenas recorriendo ids
// secuenciales (IDOR). `facturar` no lo necesita: está gateado por
// `solicitudes:facturar`, que en el seed actual solo tiene `gestor_compras`
// (rol de visibilidad amplia).
async function obtener(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  if (!tieneVisibilidadAmplia(req.user.roles) && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes ver la factura de esta solicitud');
  }

  const factura = await Factura.findOne({ where: { solicitudId: solicitud.id } });
  return success(res, factura);
}

async function facturar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'confirmada') return badRequest(res, 'La solicitud debe estar confirmada para registrar su factura');

  const { numero, monto, fechaPago } = req.body;
  if (!numero || !monto || !fechaPago) return badRequest(res, 'numero, monto y fechaPago son obligatorios');
  if (!req.file) return badRequest(res, 'El archivo de la factura es obligatorio');

  const facturaExistente = await Factura.findOne({ where: { solicitudId: solicitud.id } });
  if (facturaExistente) return badRequest(res, 'Esta solicitud ya tiene una factura registrada');

  const { ruta } = guardarArchivo(req.file, `solicitudes/${solicitud.id}`);

  let factura;
  try {
    factura = await sequelize.transaction(async (t) => {
      const nuevaFactura = await Factura.create(
        { solicitudId: solicitud.id, numero, monto, fechaPago, facturaS3Key: ruta },
        { transaction: t }
      );
      await solicitud.update({ estado: 'cerrada' }, { transaction: t });
      return nuevaFactura;
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      return badRequest(res, 'Esta solicitud ya tiene una factura registrada');
    }
    throw error;
  }

  await Auditoria.registrar({
    tabla: 'facturas', registroId: factura.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: factura.toJSON(),
  });
  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud cerrada con registro de factura y pago', datosNuevos: solicitud.toJSON(),
  });

  return created(res, 'Factura registrada', factura);
}

async function descargar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  if (!tieneVisibilidadAmplia(req.user.roles) && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes descargar la factura de esta solicitud');
  }

  const factura = await Factura.findOne({ where: { solicitudId: solicitud.id } });
  if (!factura) return notFound(res, 'Esta solicitud no tiene una factura registrada');

  return res.download(obtenerRutaAbsoluta(factura.facturaS3Key));
}

module.exports = { obtener, facturar, descargar };
