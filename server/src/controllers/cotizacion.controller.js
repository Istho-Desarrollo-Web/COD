const { Solicitud, Cotizacion, Proveedor, Auditoria, sequelize } = require('../models');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responses');
const { guardarArchivo } = require('../services/almacenamiento.service');

// Duplicado intencionalmente de solicitud.controller.js — los controllers de
// este codebase no se importan entre sí y no hay un helper compartido para
// esto. `listar()` está gateado por `solicitudes:ver`, que también tienen
// `solicitante`/`gestor_documental` (visibilidad restringida a lo propio);
// sin este chequeo, cualquier solicitante podría leer montos/proveedor de
// cotizaciones de solicitudes ajenas recorriendo ids secuenciales (IDOR).
// `crear`/`seleccionar` no lo necesitan: están gateados por
// `solicitudes:cotizar`, que en el seed actual solo tiene `gestor_compras`
// (rol de visibilidad amplia).
const ROLES_VISIBILIDAD_AMPLIA = ['gestor_compras', 'aprobador_area', 'aprobador_ejecutivo'];

async function listar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  const tieneVisibilidadAmplia = (req.user.roles || []).some((rol) => ROLES_VISIBILIDAD_AMPLIA.includes(rol.nombre));
  if (!tieneVisibilidadAmplia && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes ver las cotizaciones de esta solicitud');
  }

  const cotizaciones = await Cotizacion.findAll({
    where: { solicitudId: solicitud.id },
    include: [{ model: Proveedor }],
    order: [['createdAt', 'DESC']],
  });
  return success(res, cotizaciones);
}

async function crear(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'cotizando') return badRequest(res, 'La solicitud debe estar en cotizando para agregar cotizaciones');

  const { proveedorId, monto, observaciones } = req.body;
  if (!monto) return badRequest(res, 'El monto es obligatorio');

  if (proveedorId) {
    const proveedor = await Proveedor.findByPk(proveedorId);
    if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  }

  let s3Key = null;
  if (req.file) {
    const { ruta } = guardarArchivo(req.file, `solicitudes/${solicitud.id}`);
    s3Key = ruta;
  }

  const cotizacion = await Cotizacion.create({
    solicitudId: solicitud.id, proveedorId: proveedorId || null, monto,
    observaciones: observaciones || null, s3Key,
  });

  await Auditoria.registrar({
    tabla: 'cotizaciones', registroId: cotizacion.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: cotizacion.toJSON(),
  });

  return created(res, 'Cotización agregada', cotizacion);
}

async function seleccionar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'cotizando') return badRequest(res, 'La solicitud debe estar en cotizando para seleccionar una cotización');

  const cotizacion = await Cotizacion.findOne({ where: { id: req.params.cotizacionId, solicitudId: solicitud.id } });
  if (!cotizacion) return notFound(res, 'Cotización no encontrada');

  await sequelize.transaction(async (t) => {
    await Cotizacion.update({ seleccionada: false }, { where: { solicitudId: solicitud.id }, transaction: t });
    await cotizacion.update({ seleccionada: true }, { transaction: t });
  });

  await Auditoria.registrar({
    tabla: 'cotizaciones', registroId: cotizacion.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Cotización marcada como seleccionada',
  });

  const cotizacionActualizada = await Cotizacion.findByPk(cotizacion.id);
  return success(res, cotizacionActualizada);
}

module.exports = { listar, crear, seleccionar };
