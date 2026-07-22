const { Solicitud, Cotizacion, SolicitudAprobacion, NivelAprobacion, TipoSolicitud, Proveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responses');
const { guardarArchivo } = require('../services/almacenamiento.service');
const { enviarAprobacion: resolverEnvioAprobacion } = require('../services/solicitudAprobacion.service');

// Lista EXHAUSTIVA de roles con visibilidad ampliada (ven todas las
// solicitudes) — ver la Nota de implementación del plan. Cualquier otro rol
// con solicitudes:ver (solicitante, gestor_documental) solo ve las propias.
const ROLES_VISIBILIDAD_AMPLIA = ['gestor_compras', 'aprobador_area', 'aprobador_ejecutivo'];

function tieneVisibilidadAmplia(roles) {
  return (roles || []).some((rol) => ROLES_VISIBILIDAD_AMPLIA.includes(rol.nombre));
}

async function listarTipos(req, res) {
  const tipos = await TipoSolicitud.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, tipos);
}

async function listar(req, res) {
  const { estado, tipoSolicitudId } = req.query;
  const where = {};
  if (estado) where.estado = estado;
  if (tipoSolicitudId) where.tipoSolicitudId = tipoSolicitudId;
  if (!tieneVisibilidadAmplia(req.user.roles)) {
    where.solicitanteUsuarioId = req.user.id;
  }

  const solicitudes = await Solicitud.findAll({ where, order: [['createdAt', 'DESC']] });
  return success(res, solicitudes);
}

async function obtener(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (!tieneVisibilidadAmplia(req.user.roles) && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes ver esta solicitud');
  }
  return success(res, solicitud);
}

async function crear(req, res) {
  const { tipoSolicitudId, areaSolicitanteId, descripcion, montoEstimado } = req.body;
  if (!tipoSolicitudId || !areaSolicitanteId || !descripcion) {
    return badRequest(res, 'tipoSolicitudId, areaSolicitanteId y descripcion son obligatorios');
  }

  // codigo depende del id autoincremental, que solo se conoce después del
  // insert — se crea con un valor temporal único (nunca visible al cliente)
  // y se corrige con un update inmediato, dentro de la misma request.
  const solicitud = await Solicitud.create({
    codigo: `TMP-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    tipoSolicitudId, areaSolicitanteId, descripcion,
    montoEstimado: montoEstimado || null,
    solicitanteUsuarioId: req.user.id,
    estado: 'cotizando',
  });
  await solicitud.update({ codigo: `SOL-${new Date().getFullYear()}-${solicitud.id}` });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: solicitud.toJSON(),
  });

  return created(res, 'Solicitud creada', solicitud);
}

async function enviarAprobacion(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'cotizando') return badRequest(res, 'La solicitud debe estar en cotizando para enviarla a aprobación');

  const cotizacionSeleccionada = await Cotizacion.findOne({
    where: { solicitudId: solicitud.id, seleccionada: true },
    include: [{ model: Proveedor }],
  });
  if (!cotizacionSeleccionada) return badRequest(res, 'Selecciona una cotización antes de enviar a aprobación');

  const { nivel, aprobacion } = await resolverEnvioAprobacion(solicitud, cotizacionSeleccionada);
  if (!nivel) return badRequest(res, 'No hay un nivel de aprobación configurado para este monto/tipo');

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud enviada a aprobación', datosNuevos: { estado: 'en_aprobacion', nivelAprobacionId: nivel.id },
  });

  const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
  return success(res, { solicitud: solicitudActualizada, aprobacion });
}

async function aprobar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'en_aprobacion') return badRequest(res, 'La solicitud no está en aprobación');

  const solicitudAprobacion = await SolicitudAprobacion.findOne({
    where: { solicitudId: solicitud.id, estado: 'pendiente' },
    include: [{ model: NivelAprobacion }],
  });
  if (!solicitudAprobacion) return badRequest(res, 'No hay una aprobación pendiente para esta solicitud');

  const rolRequerido = solicitudAprobacion.NivelAprobacion.rolAprobador;
  const tieneRol = req.user.roles.some((rol) => rol.nombre === rolRequerido);
  if (!tieneRol) return forbidden(res, 'No tienes el rol de aprobador requerido para esta solicitud');
  if (rolRequerido === 'aprobador_area' && req.user.areaId !== solicitud.areaSolicitanteId) {
    return forbidden(res, 'Solo puedes aprobar solicitudes de tu propia área');
  }

  const { comentario } = req.body;
  await solicitudAprobacion.update({
    estado: 'aprobado', aprobadorUsuarioId: req.user.id, comentario: comentario || null, fechaResolucion: new Date(),
  });
  await solicitud.update({ estado: 'aprobada' });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud aprobada', datosNuevos: { estado: 'aprobada' },
  });

  const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
  return success(res, solicitudActualizada);
}

async function rechazar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'en_aprobacion') return badRequest(res, 'La solicitud no está en aprobación');

  const { motivo } = req.body;
  if (!motivo) return badRequest(res, 'El motivo del rechazo es obligatorio');

  const solicitudAprobacion = await SolicitudAprobacion.findOne({
    where: { solicitudId: solicitud.id, estado: 'pendiente' },
    include: [{ model: NivelAprobacion }],
  });
  if (!solicitudAprobacion) return badRequest(res, 'No hay una aprobación pendiente para esta solicitud');

  const rolRequerido = solicitudAprobacion.NivelAprobacion.rolAprobador;
  const tieneRol = req.user.roles.some((rol) => rol.nombre === rolRequerido);
  if (!tieneRol) return forbidden(res, 'No tienes el rol de aprobador requerido para esta solicitud');
  if (rolRequerido === 'aprobador_area' && req.user.areaId !== solicitud.areaSolicitanteId) {
    return forbidden(res, 'Solo puedes aprobar solicitudes de tu propia área');
  }

  await solicitudAprobacion.update({
    estado: 'rechazado', aprobadorUsuarioId: req.user.id, comentario: motivo, fechaResolucion: new Date(),
  });
  await solicitud.update({ estado: 'rechazada' });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Solicitud rechazada: ${motivo}`, datosNuevos: { estado: 'rechazada' },
  });

  const solicitudActualizada = await Solicitud.findByPk(solicitud.id);
  return success(res, solicitudActualizada);
}

async function confirmar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.estado !== 'aprobada') return badRequest(res, 'La solicitud debe estar aprobada para confirmarla');

  const { ordenFormalNumero } = req.body;
  if (!ordenFormalNumero) return badRequest(res, 'El número de la orden formal es obligatorio');
  if (!req.file) return badRequest(res, 'El archivo de la orden formal es obligatorio');

  const { ruta } = guardarArchivo(req.file, `solicitudes/${solicitud.id}`);
  await solicitud.update({ estado: 'confirmada', ordenFormalNumero, ordenFormalS3Key: ruta });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud confirmada con orden formal', datosNuevos: solicitud.toJSON(),
  });

  return success(res, solicitud);
}

async function cancelar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');
  if (solicitud.solicitanteUsuarioId !== req.user.id) return forbidden(res, 'Solo el solicitante puede cancelar su propia solicitud');
  if (!['cotizando', 'en_aprobacion'].includes(solicitud.estado)) {
    return badRequest(res, 'Solo se puede cancelar una solicitud en cotizando o en_aprobacion');
  }

  const datosAnteriores = solicitud.toJSON();
  await solicitud.update({ estado: 'cancelada' });

  await Auditoria.registrar({
    tabla: 'solicitudes', registroId: solicitud.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: 'Solicitud cancelada por el solicitante', datosAnteriores, datosNuevos: solicitud.toJSON(),
  });

  return success(res, solicitud);
}

module.exports = { listarTipos, listar, obtener, crear, enviarAprobacion, aprobar, rechazar, confirmar, cancelar };
