const { Proveedor, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');

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
  const { tipo, documentoIdentificacion, razonSocial, criticidad, categoria, responsableUsuarioId } = req.body;

  if (!tipo || !documentoIdentificacion || !razonSocial) {
    return badRequest(res, 'tipo, documentoIdentificacion y razonSocial son obligatorios');
  }

  // La unicidad de documentoIdentificacion la aplica la restricción UNIQUE de
  // la tabla; un duplicado lanza SequelizeUniqueConstraintError, que el
  // middleware de errores global (server.js) ya traduce a 409 — mismo
  // mecanismo que usa Area.codigo, sin necesidad de un pre-chequeo manual aquí.
  const proveedor = await Proveedor.create({
    tipo, documentoIdentificacion, razonSocial,
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

  const { razonSocial, criticidad, categoria, responsableUsuarioId, estado } = req.body;

  const datosAnteriores = proveedor.toJSON();
  const cambios = {};
  if (razonSocial !== undefined) cambios.razonSocial = razonSocial;
  if (criticidad !== undefined) cambios.criticidad = criticidad;
  if (categoria !== undefined) cambios.categoria = categoria;
  if (responsableUsuarioId !== undefined) cambios.responsableUsuarioId = responsableUsuarioId;
  if (estado !== undefined) cambios.estado = estado;

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

module.exports = { listar, obtener, crear, editar, eliminar };
