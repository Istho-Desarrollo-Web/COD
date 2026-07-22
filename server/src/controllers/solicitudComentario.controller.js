const { Solicitud, SolicitudComentario, Usuario, Auditoria } = require('../models');
const { success, created, notFound, badRequest, forbidden } = require('../utils/responses');

// Duplicado intencionalmente de solicitud.controller.js / cotizacion.controller.js
// — los controllers de este codebase no se importan entre sí y no hay un
// helper compartido para esto. Ambas funciones de este archivo necesitan el
// chequeo (a diferencia de cotizacion.controller.js, donde solo `listar` lo
// necesitaba): `listar` está gateada por `solicitudes:ver` (mismo hueco de
// siempre); `crear` está gateada por `solicitudes:comentar`, que en el seed
// actual SÍ tiene `solicitante` (rol de visibilidad restringida) — sin este
// chequeo, cualquier solicitante podría comentar en solicitudes ajenas
// recorriendo ids secuenciales (IDOR), rompiendo la restricción de que un
// solicitante solo opera sobre lo propio.
const ROLES_VISIBILIDAD_AMPLIA = ['gestor_compras', 'aprobador_area', 'aprobador_ejecutivo'];

function tieneVisibilidadAmplia(roles) {
  return (roles || []).some((rol) => ROLES_VISIBILIDAD_AMPLIA.includes(rol.nombre));
}

async function listar(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  if (!tieneVisibilidadAmplia(req.user.roles) && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes ver los comentarios de esta solicitud');
  }

  const comentarios = await SolicitudComentario.findAll({
    where: { solicitudId: solicitud.id },
    include: [{ model: Usuario }],
    order: [['createdAt', 'ASC']],
  });
  return success(res, comentarios);
}

async function crear(req, res) {
  const solicitud = await Solicitud.findByPk(req.params.id);
  if (!solicitud) return notFound(res, 'Solicitud no encontrada');

  if (!tieneVisibilidadAmplia(req.user.roles) && solicitud.solicitanteUsuarioId !== req.user.id) {
    return forbidden(res, 'No puedes agregar comentarios a esta solicitud');
  }

  const { texto } = req.body;
  if (!texto) return badRequest(res, 'El texto del comentario es obligatorio');

  const comentario = await SolicitudComentario.create({
    solicitudId: solicitud.id, usuarioId: req.user.id, texto,
  });

  await Auditoria.registrar({
    tabla: 'solicitud_comentarios', registroId: comentario.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: comentario.toJSON(),
  });

  const comentarioConUsuario = await SolicitudComentario.findByPk(comentario.id, { include: [{ model: Usuario }] });
  return created(res, 'Comentario agregado', comentarioConUsuario);
}

module.exports = { listar, crear };
