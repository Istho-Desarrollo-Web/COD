const { Proveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest, serverError } = require('../utils/responses');
const { aprobarProveedor } = require('../services/proveedorAprobacion.service');

async function listar(req, res) {
  const { estado, tipo, criticidad } = req.query;
  const where = {};
  if (estado) where.estado = estado;
  if (tipo) where.tipo = tipo;
  if (criticidad) where.criticidad = criticidad;

  const proveedores = await Proveedor.findAll({ where, order: [['razonSocial', 'ASC']] });
  return success(res, proveedores);
}

async function obtener(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  return success(res, proveedor);
}

async function crear(req, res) {
  const { tipo, documentoIdentificacion, razonSocial, criticidad, categoria, responsableUsuarioId, areaSolicitanteId } = req.body;

  if (!tipo || !documentoIdentificacion || !razonSocial || !areaSolicitanteId) {
    return badRequest(res, 'tipo, documentoIdentificacion, razonSocial y areaSolicitanteId son obligatorios');
  }

  // La unicidad de documentoIdentificacion la aplica la restricción UNIQUE de
  // la tabla; un duplicado lanza SequelizeUniqueConstraintError, que el
  // middleware de errores global (server.js) ya traduce a 409 — mismo
  // mecanismo que usa Area.codigo, sin necesidad de un pre-chequeo manual aquí.
  const proveedor = await Proveedor.create({
    tipo, documentoIdentificacion, razonSocial, areaSolicitanteId,
    criticidad: criticidad || 'media',
    categoria: categoria || null,
    responsableUsuarioId: responsableUsuarioId || null,
  });

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: proveedor.toJSON(),
  });

  return created(res, 'Proveedor creado', proveedor);
}

async function editar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const { razonSocial, criticidad, categoria, responsableUsuarioId, estado, areaSolicitanteId } = req.body;

  const datosAnteriores = proveedor.toJSON();
  const cambios = {};
  if (razonSocial !== undefined) cambios.razonSocial = razonSocial;
  if (criticidad !== undefined) cambios.criticidad = criticidad;
  if (categoria !== undefined) cambios.categoria = categoria;
  if (responsableUsuarioId !== undefined) cambios.responsableUsuarioId = responsableUsuarioId;
  if (estado !== undefined) cambios.estado = estado;
  if (areaSolicitanteId !== undefined) cambios.areaSolicitanteId = areaSolicitanteId;

  await proveedor.update(cambios);

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: proveedor.toJSON(),
  });

  return success(res, proveedor);
}

async function eliminar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');

  const datosAnteriores = proveedor.toJSON();
  await proveedor.update({ estado: 'inactivo' });
  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });

  return success(res, null, 'Proveedor dado de baja');
}

async function aprobar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  if (proveedor.estado !== 'en_evaluacion') return badRequest(res, 'El proveedor ya fue aprobado o rechazado');
  if (!proveedor.areaSolicitanteId) return badRequest(res, 'Completa el área solicitante antes de aprobar');

  let resultado;
  try {
    resultado = await aprobarProveedor(proveedor);
  } catch (err) {
    return serverError(res, `No se pudo completar la aprobación: ${err.message}`, err);
  }

  const proveedorActualizado = await Proveedor.findByPk(proveedor.id);

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Proveedor aprobado — ${resultado.documentosReflejados} documento(s) reflejado(s) en la carpeta`,
    datosNuevos: proveedorActualizado.toJSON(),
  });

  return success(res, { proveedor: proveedorActualizado, carpeta: resultado.carpeta, documentosReflejados: resultado.documentosReflejados });
}

async function rechazar(req, res) {
  const proveedor = await Proveedor.findByPk(req.params.id);
  if (!proveedor) return notFound(res, 'Proveedor no encontrado');
  if (proveedor.estado !== 'en_evaluacion') return badRequest(res, 'El proveedor ya fue aprobado o rechazado');

  const { motivo } = req.body;
  if (!motivo) return badRequest(res, 'El motivo del rechazo es obligatorio');

  const datosAnteriores = proveedor.toJSON();
  await proveedor.update({ estado: 'inactivo' });

  await Auditoria.registrar({
    tabla: 'proveedores', registroId: proveedor.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto,
    descripcion: `Proveedor rechazado: ${motivo}`, datosAnteriores, datosNuevos: proveedor.toJSON(),
  });

  return success(res, proveedor, 'Proveedor rechazado');
}

module.exports = { listar, obtener, crear, editar, eliminar, aprobar, rechazar };
