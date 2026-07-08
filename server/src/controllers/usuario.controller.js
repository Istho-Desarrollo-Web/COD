const { Usuario, Rol, Auditoria } = require('../models');
const { success, created, notFound, badRequest } = require('../utils/responses');
const { hashearPassword, validarDatosNuevoUsuario } = require('../services/usuario.service');

async function listar(req, res) {
  const usuarios = await Usuario.findAll({ where: { activo: true }, order: [['nombre', 'ASC']] });
  return success(res, usuarios);
}

async function obtener(req, res) {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');
  return success(res, usuario);
}

async function crear(req, res) {
  const { username, email, nombre, apellido, password, rolId, requiereCambioPassword } = req.body;

  const validacion = await validarDatosNuevoUsuario({ username, email, nombre, apellido, password, rolId }, Rol);
  if (!validacion.valido) {
    return validacion.status === 404 ? notFound(res, validacion.error) : badRequest(res, validacion.error);
  }

  const passwordHash = await hashearPassword(password);
  const usuarioCreado = await Usuario.create({
    username,
    email,
    nombre,
    apellido,
    rolId,
    passwordHash,
    requiereCambioPassword: requiereCambioPassword !== undefined ? requiereCambioPassword : true,
  });

  // Usuario.create() returns an in-memory instance built from the values we just
  // passed (including passwordHash) — it does NOT go through defaultScope's
  // attribute exclusion. Re-fetch via findByPk so the hash never reaches the
  // response or the audit log.
  const usuario = await Usuario.findByPk(usuarioCreado.id);

  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'crear',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosNuevos: usuario.toJSON(),
  });

  return created(res, 'Usuario creado', usuario);
}

async function editar(req, res) {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');

  const { nombre, apellido, email, rolId, password, requiereCambioPassword, activo } = req.body;

  if (rolId !== undefined) {
    const rol = await Rol.findByPk(rolId);
    if (!rol || !rol.activo) return notFound(res, 'Rol no encontrado');
  }

  const datosAnteriores = usuario.toJSON();
  const cambios = {};
  if (nombre !== undefined) cambios.nombre = nombre;
  if (apellido !== undefined) cambios.apellido = apellido;
  if (email !== undefined) cambios.email = email;
  if (rolId !== undefined) cambios.rolId = rolId;
  if (activo !== undefined) cambios.activo = activo;
  if (requiereCambioPassword !== undefined) cambios.requiereCambioPassword = requiereCambioPassword;
  if (password) cambios.passwordHash = await hashearPassword(password);

  await usuario.update(cambios);

  // Same reasoning as crear(): if `cambios.passwordHash` was set above, the
  // in-memory `usuario` instance now carries it, bypassing defaultScope's
  // exclusion. Re-fetch via findByPk before returning/auditing.
  const usuarioActualizado = await Usuario.findByPk(usuario.id);

  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'actualizar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores, datosNuevos: usuarioActualizado.toJSON(),
  });

  return success(res, usuarioActualizado);
}

async function eliminar(req, res) {
  const usuario = await Usuario.findByPk(req.params.id);
  if (!usuario || !usuario.activo) return notFound(res, 'Usuario no encontrado');

  const datosAnteriores = usuario.toJSON();
  await usuario.update({ activo: false });
  await Auditoria.registrar({
    tabla: 'usuarios', registroId: usuario.id, accion: 'eliminar',
    usuarioId: req.user.id, usuarioNombre: req.user.nombreCompleto, datosAnteriores,
  });

  return success(res, null, 'Usuario eliminado');
}

module.exports = { listar, obtener, crear, editar, eliminar };
